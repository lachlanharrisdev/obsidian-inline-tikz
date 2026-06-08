/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, import/no-nodejs-modules, no-undef -- this module is a desktop-only compatibility shim that uses node APIs under try-catch */

import { ASSETS } from "./assets";

const typedAssets: Record<string, string> = ASSETS;

let tex2svg: ((source: string) => Promise<string>) | null = null;
let initialized = false;

function patchFs(): boolean {
    try {
        if (typeof require === "undefined") return false;

        const fs = require("fs");
        const path = require("path");
        const { Buffer } = require("buffer");
        const { Readable } = require("stream");

        const originalReadFileSync = fs.readFileSync.bind(fs);
        const originalCreateReadStream = fs.createReadStream.bind(fs);

        fs.readFileSync = function readFileSyncOverride(
            this: unknown,
            ...args: unknown[]
        ) {
            const filePath = args[0];
            if (typeof filePath === "string") {
                const fileName = path.basename(filePath);
                const assetBase64 = typedAssets[fileName];
                if (assetBase64) {
                    return Buffer.from(assetBase64, "base64");
                }
            }
            return originalReadFileSync.apply(this, args);
        };

        fs.createReadStream = function createReadStreamOverride(
            this: unknown,
            ...args: unknown[]
        ) {
            const filePath = args[0];
            if (typeof filePath === "string") {
                const fileName = path.basename(filePath);
                const assetBase64 = typedAssets[fileName];
                if (assetBase64) {
                    const buffer = Buffer.from(assetBase64, "base64");
                    return Readable.from(buffer);
                }
            }
            return originalCreateReadStream.apply(this, args);
        };

        return true;
    } catch {
        return false;
    }
}

function loadTex2svg(): boolean {
    try {
        if (typeof require === "undefined") return false;

        const nodeTikzJax = require("node-tikzjax") as { default?: unknown };
        tex2svg = (nodeTikzJax.default || nodeTikzJax) as (
            source: string,
        ) => Promise<string>;
        return true;
    } catch {
        tex2svg = null;
        return false;
    }
}

export function isAvailable(): boolean {
    return tex2svg !== null;
}

export function init(): boolean {
    if (initialized) return tex2svg !== null;
    initialized = true;

    if (!patchFs()) {
        tex2svg = null;
        return false;
    }

    return loadTex2svg();
}

export async function compile(source: string): Promise<string> {
    if (!tex2svg) {
        throw new Error(
            "TikZ compilation requires the desktop version of Obsidian",
        );
    }
    return await tex2svg(source);
}
