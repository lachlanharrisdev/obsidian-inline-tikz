import { Plugin } from "obsidian";
import * as crypto from "crypto";
import { ASSETS, FONTS_CSS } from "./assets";
import { Readable } from "stream";

// Use CommonJS require for fs and path to allow monkey-patching and avoid bundling issues
const fs = require("fs");
const path = require("path");

// --- Import Workaround ---
// Handle ESM/CommonJS interop for node-tikzjax
const nodeTikzJax = require("node-tikzjax");
const tex2svg = (nodeTikzJax.default || nodeTikzJax) as (
    source: string,
    options?: any,
) => Promise<string>;

// --- WASM Path Patching ---
// Since node-tikzjax is a Node library bundled into an Obsidian plugin,
// it expects files on disk. We monkey-patch fs.readFileSync and fs.createReadStream
// to serve embedded base64 assets instead.
const originalReadFileSync = fs.readFileSync;
const originalCreateReadStream = fs.createReadStream;

fs.readFileSync = function (
    filePath: string | Buffer | number | null,
    options?: any,
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
    options?: any,
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
        reject: (reason: any) => void;
    }> = [];

    async onload() {
        console.log("Loading Obsidian TikZ plugin...");

        await this.loadFonts();

        this.registerMarkdownCodeBlockProcessor(
            "tikz",
            async (source, el, ctx) => {
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

    private async loadFonts() {
        try {
            const style = document.createElement("style");
            style.id = "tikzjax-fonts";
            style.textContent = FONTS_CSS;
            document.head.appendChild(style);
        } catch (e) {
            console.error("TikZ Plugin: Failed to load embedded fonts", e);
        }
    }

    private async enqueueCompilation(
        source: string,
        hash: string,
    ): Promise<string> {
        return new Promise((resolve, reject) => {
            this.compilationQueue.push({ source, hash, resolve, reject });
            this.processQueue();
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
                // Re-check cache in case it was filled while waiting
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
                this.processQueue();
            }
        } else {
            this.isCompiling = false;
        }
    }

    private async compileTikz(source: string, hash: string): Promise<string> {
        try {
            // Since fonts are injected into document.head, no need for embedFontCss
            const svg = await tex2svg(source);

            this.cache.set(hash, svg);
            return svg;
        } catch (e) {
            throw e;
        }
    }

    private renderSvg(el: HTMLElement, svg: string) {
        const container = el.createDiv({ cls: "tikz-container" });
        container.innerHTML = svg;
    }

    private renderError(el: HTMLElement, error: any) {
        const errorBox = el.createDiv({ cls: "tikz-error" });
        errorBox.createEl("strong", { text: "TikZ Compilation Error:" });
        errorBox.createDiv({
            text: error instanceof Error ? error.message : String(error),
            cls: "tikz-error-message",
        });
    }
}
