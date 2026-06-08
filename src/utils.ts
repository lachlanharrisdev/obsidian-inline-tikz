export async function sha256(source: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(source);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type ColorMode = "auto" | "light" | "dark";

export function shouldReplaceBlack(mode: ColorMode, doc: Document): boolean {
    if (mode === "light") return false;
    if (mode === "dark") return true;
    return doc.body.classList.contains("theme-dark");
}
