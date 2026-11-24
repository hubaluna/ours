/**
 * Lightweight browser-native replacement for `linkedom` used by shared metadata
 * helpers when bundled for the client. Edge functions (Deno) and Vitest (Node)
 * continue to use `linkedom` directly.
 */
export function parseHTML(html: string): { document: Document } {
  if (typeof DOMParser !== "undefined") {
    return {
      document: new DOMParser().parseFromString(html, "text/html"),
    };
  }
  throw new Error("DOMParser is not available in this environment");
}
