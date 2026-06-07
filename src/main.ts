import { Plugin } from "obsidian";
import * as crypto from "crypto";
import { ASSETS } from "./assets";
import { Readable } from "stream";

import type * as FS from "fs";
import type * as Path from "path";

interface TikzOptions {
    embedFontCss?: boolean;
    fontCssUrl?: string;
    texPackages?: Record<string, string>;
    tikzLibraries?: string[];
    addToPreamble?: string;
    tikzOptions?: string;
    showConsole?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports -- required to bypass esbuild's read-only namespace
const fs = require("fs") as typeof FS;
// eslint-disable-next-line @typescript-eslint/no-require-imports -- required to bypass esbuild's read-only namespace
const path = require("path") as typeof Path;

// eslint-disable-next-line @typescript-eslint/no-require-imports -- required to bypass esbuild's read-only namespace
const nodeTikzJax = require("node-tikzjax") as { default?: unknown };
const tex2svg = (nodeTikzJax.default || nodeTikzJax) as (
    source: string,
    options?: TikzOptions,
) => Promise<string>;

const typedAssets: Record<string, string> = ASSETS;

const originalReadFileSync = fs.readFileSync;
const originalCreateReadStream = fs.createReadStream;

fs.readFileSync = function (
    filePath: Parameters<typeof originalReadFileSync>[0],
    options?: Parameters<typeof originalReadFileSync>[1],
): ReturnType<typeof originalReadFileSync> {
    if (typeof filePath === "string") {
        const fileName = path.basename(filePath);
        const assetBase64 = typedAssets[fileName];
        if (assetBase64) {
            return Buffer.from(assetBase64, "base64");
        }
    }
    return originalReadFileSync(filePath, options);
} as typeof originalReadFileSync;

fs.createReadStream = (
    filePath: Parameters<typeof originalCreateReadStream>[0],
    options?: Parameters<typeof originalCreateReadStream>[1],
): ReturnType<typeof originalCreateReadStream> => {
    if (typeof filePath === "string") {
        const fileName = path.basename(filePath);
        const assetBase64 = typedAssets[fileName];
        if (assetBase64) {
            const buffer = Buffer.from(assetBase64, "base64");
            return Readable.from(buffer) as ReturnType<
                typeof originalCreateReadStream
            >;
        }
    }
    return originalCreateReadStream(filePath, options);
};

interface BlockState {
    version: number;
    debounceTimer: number | null;
}

export default class TikzPlugin extends Plugin {
    private cache: Map<string, string> = new Map();
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
        this.registerMarkdownCodeBlockProcessor(
            "tikz",
            (source, el, _ctx) => {
                this.processBlock(source, el);
            },
        );
    }

    onunload() {
        for (const timerId of this.debounceTimers) {
            window.clearTimeout(timerId);
        }
        this.debounceTimers.clear();
        this.compilationQueue = [];
    }

    private getBlockState(el: HTMLElement): BlockState {
        let state = this.blockStates.get(el);
        if (!state) {
            state = { version: 0, debounceTimer: null };
            this.blockStates.set(el, state);
        }
        return state;
    }

    private processBlock(source: string, el: HTMLElement) {
        const state = this.getBlockState(el);
        state.version++;

        if (state.debounceTimer !== null) {
            window.clearTimeout(state.debounceTimer);
            this.debounceTimers.delete(state.debounceTimer);
            state.debounceTimer = null;
        }

        const hash = crypto
            .createHash("sha256")
            .update(source)
            .digest("hex");

        if (this.cache.has(hash)) {
            this.renderSvg(el, this.cache.get(hash)!);
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
                if (this.cache.has(item.hash)) {
                    item.resolve(this.cache.get(item.hash)!);
                } else {
                    const svg = await this.compileTikz(item.source, item.hash);
                    item.resolve(svg);
                }
            } catch (e) {
                item.reject(e);
            } finally {
                this.isCompiling = false;
                window.setTimeout(
                    () => void this.processQueue(),
                    0,
                );
            }
        } else {
            this.isCompiling = false;
        }
    }

    private async compileTikz(source: string, hash: string): Promise<string> {
        const svg = await tex2svg(source);
        this.cache.set(hash, svg);
        return svg;
    }

    private renderLoading(el: HTMLElement) {
        el.empty();
        const box = el.createDiv({ cls: "tikz-rendering" });
        box.createSpan({ text: "Rendering TikZ diagram..." });
    }

    private renderSvg(el: HTMLElement, svg: string) {
        el.empty();
        const container = el.createDiv({ cls: "tikz-container" });

        const processedSvg = svg.replace(
            /#000000|#000|\bblack\b|rgb\(\s*0\s*,\s*0\s*,\s*0\s*\)|rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*[\d.]+\s*\)/gi,
            "currentColor",
        );

        const parser = new DOMParser();
        const doc = parser.parseFromString(processedSvg, "image/svg+xml");
        if (doc.documentElement) {
            container.appendChild(doc.documentElement);
        }
    }

    private renderError(el: HTMLElement, error: unknown) {
        el.empty();
        const errorBox = el.createDiv({ cls: "tikz-error" });
        errorBox.createEl("strong", { text: "Tikz compilation error:" });
        errorBox.createDiv({
            text: error instanceof Error ? error.message : String(error),
            cls: "tikz-error-message",
        });
    }
}
