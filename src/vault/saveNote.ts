import {
  App,
  TFolder,
  type TFile,
} from "obsidian";

import type { ParseResult } from "../parse/result";
import type { BondieDocferrySettings } from "../settings";
import {
  joinVaultPath,
  validateVaultRelativePath,
} from "./vaultPath";
import {
  removeMatchingLeadingTitle,
  removeRemoteSourcePreview,
} from "./noteContent";

export interface SavedParseNote {
  file: TFile;
  path: string;
}

export async function saveParseResultToVault(
  app: App,
  settings: BondieDocferrySettings,
  result: ParseResult,
): Promise<SavedParseNote> {
  const folderPath = validateVaultRelativePath(settings.defaultFolder, "Default folder");
  await ensureFolder(app, folderPath);

  const filename = `${sanitizeFileName(result.fileStem)}.md`;
  const targetPath = await nextAvailablePath(
    app,
    joinVaultPath(folderPath, filename, "Note path"),
  );
  const file = await app.vault.create(
    targetPath,
    removeRemoteSourcePreview(removeMatchingLeadingTitle(result.markdown, result.title)),
  );

  return {
    file,
    path: targetPath,
  };
}

async function ensureFolder(app: App, folderPath: string): Promise<void> {
  const safeFolderPath = validateVaultRelativePath(folderPath, "Vault folder");
  const parts = safeFolderPath.split("/");
  let current = "";

  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    const existing = app.vault.getAbstractFileByPath(current);

    if (existing instanceof TFolder) {
      continue;
    }

    if (existing) {
      throw new Error(`${current} already exists and is not a folder.`);
    }

    await app.vault.createFolder(validateVaultRelativePath(current, "Vault folder"));
  }
}

async function nextAvailablePath(app: App, requestedPath: string): Promise<string> {
  const safeRequestedPath = validateVaultRelativePath(requestedPath, "Note path");
  const extension = safeRequestedPath.endsWith(".md") ? ".md" : "";
  const basePath = extension
    ? safeRequestedPath.slice(0, -extension.length)
    : safeRequestedPath;

  if (!app.vault.getAbstractFileByPath(safeRequestedPath)) {
    return safeRequestedPath;
  }

  for (let index = 2; index < 1000; index += 1) {
    const candidate = validateVaultRelativePath(
      `${basePath}-${index}${extension}`,
      "Note path",
    );
    if (!app.vault.getAbstractFileByPath(candidate)) {
      return candidate;
    }
  }

  throw new Error("Could not find an available note path.");
}
function sanitizeFileName(value: string): string {
  const cleaned = value
    .replace(/[\\/:*?"<>|#^[\]]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || "Bondie Docferry Capture";
}
