const DOCFERRY_ORIGIN = "https://docferry.bondie.io";
const SHARE_PATH_PATTERN = /^\/s\/([A-Za-z0-9_-]{1,64})\/?$/;

export interface ParsedDocFerryShareUrl {
  baseUrl: string;
  importUrl: string;
  slug: string;
}

export interface ImportAssetPathInput {
  asset_id: string;
  filename: string;
  original_path?: string | null;
}

export type LinkIntent =
  | { kind: "empty" }
  | { kind: "invalid" }
  | { kind: "docferry-share"; url: string }
  | { kind: "web"; url: string };

export function classifyLinkIntent(value: string): LinkIntent {
  const candidate = value.trim();
  if (!candidate) return { kind: "empty" };

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return { kind: "invalid" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { kind: "invalid" };
  }

  if (url.origin === DOCFERRY_ORIGIN) {
    try {
      const share = parseDocFerryShareUrl(candidate);
      return {
        kind: "docferry-share",
        url: `${share.baseUrl}/s/${encodeURIComponent(share.slug)}`,
      };
    } catch {
      return { kind: "invalid" };
    }
  }

  return { kind: "web", url: url.toString() };
}

export function linkIntentRequiresSession(intent: LinkIntent): boolean {
  return intent.kind === "web";
}

export function parseDocFerryShareUrl(value: string): ParsedDocFerryShareUrl {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("DocFerry share URL is invalid.");
  }

  if (
    url.origin !== DOCFERRY_ORIGIN ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error("Only a public docferry.bondie.io Share URL can be imported.");
  }

  const match = SHARE_PATH_PATTERN.exec(url.pathname);
  if (!match) {
    throw new Error("DocFerry share URL is invalid.");
  }

  const slug = match[1];
  return {
    baseUrl: DOCFERRY_ORIGIN,
    importUrl: `${DOCFERRY_ORIGIN}/s/${encodeURIComponent(slug)}/import`,
    slug,
  };
}

export function resolveDocFerryAssetUrl(value: string, baseUrl: string): string {
  let url: URL;
  try {
    url = new URL(value.trim(), `${baseUrl}/`);
  } catch {
    throw new Error("DocFerry import returned an invalid asset URL.");
  }

  if (url.origin !== DOCFERRY_ORIGIN || url.username || url.password) {
    throw new Error("DocFerry import returned an untrusted asset URL.");
  }
  return url.toString();
}

export function safeImportSegment(value: string, fallback = "DocFerry Import"): string {
  const cleaned = value
    .replace(/[\\/:*?"<>|#^[\]]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || fallback;
}

export function importAssetRelativePath(asset: ImportAssetPathInput): string {
  const originalPath = (asset.original_path ?? "")
    .split("#", 1)[0]
    .split("?", 1)[0]
    .replace(/\\/g, "/")
    .trim();
  const parts = originalPath
    .split("/")
    .filter((part) => part && part !== "." && part !== "..")
    .map((part) => safeImportSegment(part, "attachment"));

  if (parts.length > 0) {
    return parts.join("/");
  }
  return `attachments/${safeImportSegment(asset.filename || asset.asset_id, "attachment")}`;
}
