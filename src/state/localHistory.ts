export interface LocalHistoryItem {
  filePath?: string;
  id: string;
  kind: "capture" | "docferry-import";
  remoteJobId?: string;
  sourceUrl: string;
  status: "draft" | "parsed" | "saved" | "shared" | "failed";
  title: string;
  updatedAt: string;
}

export function normalizeLocalHistory(value: unknown): LocalHistoryItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item) => {
      const rawSourceUrl = typeof item.sourceUrl === "string" ? item.sourceUrl : "";
      const kind = item.kind === "docferry-import" || isDocFerryShareUrl(rawSourceUrl)
        ? "docferry-import"
        : "capture";
      return {
        filePath: typeof item.filePath === "string" ? item.filePath : undefined,
        id: typeof item.id === "string" ? item.id : createHistoryId(),
        kind,
        remoteJobId: typeof item.remoteJobId === "string" ? item.remoteJobId : undefined,
        sourceUrl: historySourceReference(rawSourceUrl, kind),
        status: isLocalHistoryStatus(item.status) ? item.status : "draft",
        title: typeof item.title === "string" ? item.title : "Untitled capture",
        updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : new Date().toISOString(),
      } satisfies LocalHistoryItem;
    })
    .filter((item) => item.sourceUrl.length > 0)
    .slice(0, 20);
}

export function createLocalHistoryItem(input: {
  filePath?: string;
  kind?: LocalHistoryItem["kind"];
  remoteJobId?: string;
  sourceUrl: string;
  status: LocalHistoryItem["status"];
  title: string;
}): LocalHistoryItem {
  const kind = input.kind ?? "capture";
  return {
    filePath: input.filePath,
    id: createHistoryId(),
    kind,
    remoteJobId: input.remoteJobId,
    sourceUrl: historySourceReference(input.sourceUrl, kind),
    status: input.status,
    title: input.title,
    updatedAt: new Date().toISOString(),
  };
}

export function upsertLocalHistoryItem(
  items: LocalHistoryItem[],
  nextItem: LocalHistoryItem,
): LocalHistoryItem[] {
  const matchingItems = items.filter(
    (item) => isMatchingHistoryItem(item, nextItem),
  );
  const existingFilePath = matchingItems.find((item) => item.filePath)?.filePath;
  const mergedItem = {
    ...nextItem,
    filePath: nextItem.filePath ?? existingFilePath,
  };

  return [
    mergedItem,
    ...items.filter((item) => !isMatchingHistoryItem(item, nextItem)),
  ].slice(0, 20);
}

export function removeLocalHistoryItem(
  items: LocalHistoryItem[],
  historyId: string,
): LocalHistoryItem[] {
  return items.filter((item) => item.id !== historyId);
}

export function matchesCaptureHistory(
  item: LocalHistoryItem,
  remoteJobId: string | undefined,
  sourceUrl: string,
): boolean {
  if (remoteJobId) return item.remoteJobId === remoteJobId;
  return item.kind === "capture" && item.sourceUrl === historySourceReference(sourceUrl, "capture");
}

function isMatchingHistoryItem(left: LocalHistoryItem, right: LocalHistoryItem): boolean {
  if (left.id === right.id) return true;
  if (left.remoteJobId || right.remoteJobId) {
    return left.remoteJobId !== undefined && left.remoteJobId === right.remoteJobId;
  }
  return left.kind === right.kind && left.sourceUrl === right.sourceUrl;
}

function historySourceReference(sourceUrl: string, kind: LocalHistoryItem["kind"]): string {
  try {
    const parsed = new URL(sourceUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) return "";
    if (kind === "docferry-import") {
      parsed.search = "";
      parsed.hash = "";
      return parsed.toString();
    }
    return `${parsed.protocol}//${parsed.host}/`;
  } catch {
    return "";
  }
}

function isDocFerryShareUrl(sourceUrl: string): boolean {
  try {
    const parsed = new URL(sourceUrl);
    return parsed.hostname === "docferry.bondie.io" && parsed.pathname.startsWith("/s/");
  } catch {
    return false;
  }
}

function createHistoryId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function isLocalHistoryStatus(value: unknown): value is LocalHistoryItem["status"] {
  return (
    value === "draft" ||
    value === "parsed" ||
    value === "saved" ||
    value === "shared" ||
    value === "failed"
  );
}
