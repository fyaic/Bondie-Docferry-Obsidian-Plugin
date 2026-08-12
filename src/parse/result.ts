export interface ParseResult {
  createdAt: string;
  fileStem: string;
  host: string;
  markdown: string;
  parseJobId?: string;
  sourceUrl: string;
  summary: string;
  title: string;
}

export function parseHttpUrl(value: string): URL | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}
