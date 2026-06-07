import { Plugin } from "obsidian";
import * as crypto from "crypto";
import { ASSETS } from "./assets";
import { Readable } from "stream";
import fsModule from "fs";
import pathModule from "path";

// Cast to any to allow monkey-patching of Node built-ins
const fs = fsModule as unknown;
const path = pathModule as unknown;

interface TikzOptions {
    embedFontCss?: boolean;
    fontCssUrl?: string;
    texPackages?: Record<string, string>;
    tikzLibraries?: string[];
    addToPreamble?: string;
    tikzOptions?: string;
    showConsole?: boolean;
}

// --- Import Workaround ---
const nodeTikzJax = require("node-tikzjax");
const tex2svg = (nodeTikzJax.default || nodeTikzJax) as (
    source: string,
    options?: TikzOptions,
) => Promise<string>;

// --- WASM Path Patching ---
const originalReadFileSync = fs.readFileSync;
const originalCreateReadStream = fs.createReadStream;

fs.readFileSync = function (
    filePath: string | Buffer | number | null,
    options?: unknown,
) {
    if (typeof filePath === "string") {
        const fileName = path.basename(filePath);
        if (ASSETS[fileName]) {
            return Buffer.from(ASSETS[fileName], "base64");
        }
    }
    return originalReadFileSync(filePath, options);
};

fs.createReadStream = function (
    filePath: string | Buffer | number | null,
    options?: unknown,
) {
    if (typeof filePath === "string") {
        const fileName = path.basename(filePath);
        if (ASSETS[fileName]) {
            const buffer = Buffer.from(ASSETS[fileName], "base64");
            return Readable.from(buffer);
        }
    }
    return originalCreateReadStream(filePath, options);
};

export default class TikzPlugin extends Plugin {
    private cache: Map<string, string> = new Map();
    private isCompiling: boolean = false;
    private compilationQueue: Array<{
        source: string;
        hash: string;
        resolve: (value: string) => void;
        reject: (reason: unknown) => void;
    }> = [];

    async onload() {
        this.registerMarkdownCodeBlockProcessor(
            "tikz",
            async (source, el, _ctx) => {
                const hash = crypto
                    .createHash("sha256")
                    .update(source)
                    .digest("hex");

                if (this.cache.has(hash)) {
                    this.renderSvg(el, this.cache.get(hash)!);
                    return;
                }

                try {
                    const svg = await this.enqueueCompilation(source, hash);
                    this.renderSvg(el, svg);
                } catch (e) {
                    this.renderError(el, e);
                }
            },
        );
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
                void this.processQueue();
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

    private renderSvg(el: HTMLElement, svg: string) {
        const container = el.createDiv({ cls: "tikz-container" });
        const parser = new DOMParser();
        const doc = parser.parseFromString(svg, "image/svg+xml");
        if (doc.documentElement) {
            container.appendChild(doc.documentElement);
        }
    }

    private renderError(el: HTMLElement, error: unknown) {
        const errorBox = el.createDiv({ cls: "tikz-error" });
        errorBox.createEl("strong", { text: "Tikz compilation error:" });
        errorBox.createDiv({
            text: error instanceof Error ? error.message : String(error),
            cls: "tikz-error-message",
        });
    }
}
