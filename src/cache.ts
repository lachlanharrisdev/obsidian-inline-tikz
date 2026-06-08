import { DataAdapter, normalizePath } from "obsidian";

const CACHE_DIR = normalizePath(".tikz-cache");
const INDEX_PATH = normalizePath(`${CACHE_DIR}/index.json`);

const CURRENT_CACHE_VERSION = 2;

interface CacheEntryMeta {
    timestamp: number;
}

interface CacheIndex {
    version: number;
    entries: Record<string, CacheEntryMeta>;
}

export interface CacheStats {
    count: number;
}

export class TikzCache {
    private adapter: DataAdapter;
    private memCache: Map<string, string> = new Map();
    private index: CacheIndex | null = null;
    private ready: boolean = false;

    constructor(adapter: DataAdapter) {
        this.adapter = adapter;
    }

    async init(): Promise<void> {
        try {
            if (!(await this.adapter.exists(CACHE_DIR))) {
                await this.adapter.mkdir(CACHE_DIR);
            }
            await this.loadIndex();
            this.ready = true;
        } catch {
            this.ready = false;
        }
    }

    private async loadIndex(): Promise<void> {
        try {
            const data = await this.adapter.read(INDEX_PATH);
            this.index = JSON.parse(data) as CacheIndex;
        } catch {
            this.index = { version: CURRENT_CACHE_VERSION, entries: {} };
        }
    }

    private async saveIndex(): Promise<void> {
        if (!this.index) return;
        try {
            await this.adapter.write(
                INDEX_PATH,
                JSON.stringify(this.index, null, 2),
            );
        } catch {
            // Silently fail
        }
    }

    private svgPath(hash: string): string {
        return normalizePath(`${CACHE_DIR}/${hash}.svg`);
    }

    async get(hash: string): Promise<string | null> {
        if (this.memCache.has(hash)) {
            return this.memCache.get(hash)!;
        }
        if (!this.index || !(hash in this.index.entries)) {
            return null;
        }
        try {
            const svg = await this.adapter.read(this.svgPath(hash));
            this.memCache.set(hash, svg);
            return svg;
        } catch {
            return null;
        }
    }

    async set(hash: string, svg: string): Promise<void> {
        this.memCache.set(hash, svg);
        if (!this.index) {
            this.index = { version: CURRENT_CACHE_VERSION, entries: {} };
        }
        this.index.entries[hash] = { timestamp: Date.now() };
        try {
            await this.adapter.write(this.svgPath(hash), svg);
            await this.saveIndex();
        } catch {
            // Memory cache still works this session
        }
    }

    async clear(): Promise<void> {
        this.memCache.clear();
        if (this.index) {
            const hashes = Object.keys(this.index.entries);
            await Promise.allSettled(
                hashes.map((h) =>
                    this.adapter.remove(this.svgPath(h)).catch(() => {}),
                ),
            );
        }
        this.index = { version: CURRENT_CACHE_VERSION, entries: {} };
        await this.saveIndex();
    }

    async getStats(): Promise<CacheStats> {
        const count = this.index
            ? Object.keys(this.index.entries).length
            : 0;
        return { count };
    }

    isReady(): boolean {
        return this.ready;
    }
}
