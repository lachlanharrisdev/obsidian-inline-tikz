import { Notice, Plugin } from "obsidian";
import { sha256, shouldReplaceBlack } from "./utils";
import { TikzCache } from "./cache";
import * as Compile from "./compile";
import { TikzSettingTab, DEFAULT_SETTINGS } from "./settings";
import type { TikzPluginSettings } from "./settings";

const BLACK_REPLACE_RE =
    /#000000|#000|\bblack\b|rgb\(\s*0\s*,\s*0\s*,\s*0\s*\)|rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*[\d.]+\s*\)/gi;

interface BlockState {
    version: number;
    debounceTimer: number | null;
}

export default class TikzPlugin extends Plugin {
    settings!: TikzPluginSettings;
    cache!: TikzCache;
    private compilerReady: boolean = false;
    private isCompiling: boolean = false;
    private compilationQueue: Array<{
        source: string;
        hash: string;
        resolve: (value: string) => void;
        reject: (reason: unknown) => void;
    }> = [];
    private blockStates: WeakMap<HTMLElement, BlockState> = new WeakMap();
    private debounceTimers: Set<number> = new Set();

    async onload() {
        this.settings = Object.assign(
            {},
            DEFAULT_SETTINGS,
            ((await this.loadData()) as Partial<TikzPluginSettings>) ?? {},
        );

        this.cache = new TikzCache(this.app.vault.adapter);
        await this.cache.init();

        this.compilerReady = Compile.init();

        this.addSettingTab(new TikzSettingTab(this.app, this));

        this.addCommand({
            id: "clear-tikz-cache",
            name: "Clear cached diagrams",
            callback: async () => {
                await this.cache.clear();
                // eslint-disable-next-line obsidianmd/ui/sentence-case -- TikZ is a proper name
                new Notice("Inline TikZ: cache cleared");
            },
        });

        this.registerMarkdownCodeBlockProcessor("tikz", (source, el, _ctx) => {
            void this.processBlock(source, el);
        });
    }

    onunload() {
        for (const timerId of this.debounceTimers) {
            window.clearTimeout(timerId);
        }
        this.debounceTimers.clear();
        this.compilationQueue = [];
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
    }

    private getBlockState(el: HTMLElement): BlockState {
        let state = this.blockStates.get(el);
        if (!state) {
            state = { version: 0, debounceTimer: null };
            this.blockStates.set(el, state);
        }
        return state;
    }

    private async processBlock(source: string, el: HTMLElement) {
        const state = this.getBlockState(el);
        state.version++;

        if (state.debounceTimer !== null) {
            window.clearTimeout(state.debounceTimer);
            this.debounceTimers.delete(state.debounceTimer);
            state.debounceTimer = null;
        }

        const hash = await sha256(source);

        const cachedSvg = await this.cache.get(hash);
        if (cachedSvg !== null) {
            this.renderSvg(el, cachedSvg);
            return;
        }

        if (!this.compilerReady) {
            this.renderUnavailable(el);
            return;
        }

        this.renderLoading(el);

        state.debounceTimer = window.setTimeout(() => {
            this.debounceTimers.delete(state.debounceTimer!);
            state.debounceTimer = null;
            void this.doCompile(source, el, state.version, hash);
        }, 200);
        this.debounceTimers.add(state.debounceTimer);
    }

    private async doCompile(
        source: string,
        el: HTMLElement,
        version: number,
        hash: string,
    ) {
        try {
            const svg = await this.enqueueCompilation(source, hash);
            const state = this.getBlockState(el);
            if (state.version === version && el.isConnected) {
                this.renderSvg(el, svg);
            }
        } catch (e) {
            const state = this.getBlockState(el);
            if (state.version === version && el.isConnected) {
                this.renderError(el, e);
            }
        }
    }

    private async enqueueCompilation(
        source: string,
        hash: string,
    ): Promise<string> {
        return new Promise((resolve, reject) => {
            this.compilationQueue.push({ source, hash, resolve, reject });
            void this.processQueue();
        });
    }

    private async processQueue() {
        if (this.isCompiling || this.compilationQueue.length === 0) {
            return;
        }

        this.isCompiling = true;
        const item = this.compilationQueue.shift();

        if (item) {
            try {
                const svg = await Compile.compile(item.source);
                await this.cache.set(item.hash, svg);
                item.resolve(svg);
            } catch (e) {
                item.reject(e);
            } finally {
                this.isCompiling = false;
                window.setTimeout(() => void this.processQueue(), 0);
            }
        } else {
            this.isCompiling = false;
        }
    }

    private renderLoading(el: HTMLElement) {
        el.empty();
        const box = el.createDiv({ cls: "tikz-rendering" });
        box.createSpan({ text: "Rendering TikZ diagram..." });
    }

    private renderSvg(el: HTMLElement, svg: string) {
        el.empty();
        const container = el.createDiv({
            cls: "tikz-container",
        });

        const replaceBlack = shouldReplaceBlack(
            this.settings.colorMode,
            // eslint-disable-next-line obsidianmd/prefer-active-doc -- fine for theme class check on main window
            document,
        );
        const processedSvg = replaceBlack
            ? svg.replace(BLACK_REPLACE_RE, "currentColor")
            : svg;

        const parser = new DOMParser();
        const doc = parser.parseFromString(processedSvg, "image/svg+xml");
        if (doc.documentElement) {
            container.appendChild(doc.documentElement);
        }
    }

    private renderError(el: HTMLElement, error: unknown) {
        el.empty();
        const errorBox = el.createDiv({ cls: "tikz-error" });
        // eslint-disable-next-line obsidianmd/ui/sentence-case -- "TikZ" is a proper name
        errorBox.createEl("strong", { text: "TikZ compilation error:" });
        errorBox.createDiv({
            text: error instanceof Error ? error.message : String(error),
            cls: "tikz-error-message",
        });
    }

    private renderUnavailable(el: HTMLElement) {
        el.empty();
        const box = el.createDiv({ cls: "tikz-unavailable" });
        box.createSpan({
            text: "TikZ diagram unavailable – open on desktop to render and cache it.",
        });
        box.createDiv({
            text: "Cached diagrams will display here automatically.",
            cls: "tikz-unavailable-hint",
        });
    }
}
