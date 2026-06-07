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

// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = require("fs") as typeof FS;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require("path") as typeof Path;

// eslint-disable-next-line @typescript-eslint/no-var-requires
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

fs.createReadStream = function (
    filePath: Parameters<typeof originalCreateReadStream>[0],
    options?: Parameters<typeof originalCreateReadStream>[1],
): ReturnType<typeof originalCreateReadStream> {
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
} as typeof originalCreateReadStream;

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
