import {
  App,
  TFile,
  TFolder,
} from "obsidian";

import {
  downloadDocFerryImportAsset,
  fetchDocFerryImportPayload,
  type DocFerryImportAsset,
} from "../api/docferry";
import {
  importAssetRelativePath,
  safeImportSegment,
} from "../docferry/importContract";
import type { BondieDocferrySettings } from "../settings";
import {
  joinVaultPath,
  validateVaultRelativePath,
} from "./vaultPath";
import { removeMatchingLeadingTitle } from "./noteContent";

const MAX_MOBILE_IMPORT_BYTES = 50 * 1024 * 1024;

export interface ImportedDocFerryShare {
  file: TFile;
  importedAssets: number;
  path: string;
  title: string;
}

interface DownloadedAsset {
  body: ArrayBuffer;
  path: string;
}

export async function importDocFerryShareToVault(
  app: App,
  settings: BondieDocferrySettings,
  shareUrl: string,
): Promise<ImportedDocFerryShare> {
  const folder = validateVaultRelativePath(settings.importFolder, "Import folder");
  const session = await fetchDocFerryImportPayload(shareUrl);
  const notePath = await nextAvailableImportPath(
    app,
    joinVaultPath(
      folder,
      `${safeImportSegment(session.payload.title)}.md`,
      "Import note path",
    ),
  );
  const assetPlans = await planAssets(app, folder, notePath, session.payload.assets);

  const downloads: DownloadedAsset[] = [];
  let downloadedBytes = 0;
  for (const plan of assetPlans) {
    const body = await downloadDocFerryImportAsset(plan.asset.url, session.baseUrl);
    if (body.byteLength !== plan.asset.byte_length) {
      throw new Error(`DocFerry asset size mismatch: ${plan.path}`);
    }
    downloadedBytes += body.byteLength;
    if (downloadedBytes > MAX_MOBILE_IMPORT_BYTES) {
      throw new Error("DocFerry import is too large for the mobile import limit.");
    }
    downloads.push({ body, path: plan.path });
  }

  await ensureFolder(app, folder);
  const createdPaths: string[] = [];
  try {
    const file = await app.vault.create(
      notePath,
      removeMatchingLeadingTitle(session.payload.markdown, session.payload.title),
    );
    createdPaths.push(notePath);
    for (const asset of downloads) {
      await ensureParentFolder(app, asset.path);
      await app.vault.createBinary(asset.path, asset.body);
      createdPaths.push(asset.path);
    }
    return {
      file,
      importedAssets: downloads.length,
      path: notePath,
      title: session.payload.title,
    };
  } catch (error) {
    await rollbackCreatedPaths(app, createdPaths);
    throw error;
  }
}

async function planAssets(
  app: App,
  folder: string,
  notePath: string,
  assets: DocFerryImportAsset[],
): Promise<Array<{ asset: DocFerryImportAsset; path: string }>> {
  const seen = new Set<string>([notePath]);
  const result: Array<{ asset: DocFerryImportAsset; path: string }> = [];
  let declaredBytes = 0;

  for (const asset of assets) {
    if (!Number.isSafeInteger(asset.byte_length) || asset.byte_length < 0) {
      throw new Error("DocFerry import returned an invalid asset size.");
    }
    declaredBytes += asset.byte_length;
    if (declaredBytes > MAX_MOBILE_IMPORT_BYTES) {
      throw new Error("DocFerry import is too large for the mobile import limit.");
    }

    const path = joinVaultPath(
      folder,
      importAssetRelativePath(asset),
      "Import asset path",
    );
    if (seen.has(path)) {
      throw new Error(`DocFerry import contains a duplicate path: ${path}`);
    }
    if (app.vault.getAbstractFileByPath(path)) {
      throw new Error(`Import asset already exists: ${path}`);
    }
    seen.add(path);
    result.push({ asset, path });
  }
  return result;
}

async function nextAvailableImportPath(app: App, requestedPath: string): Promise<string> {
  const safeRequestedPath = validateVaultRelativePath(requestedPath, "Import note path");
  const basePath = safeRequestedPath.endsWith(".md")
    ? safeRequestedPath.slice(0, -3)
    : safeRequestedPath;
  if (!app.vault.getAbstractFileByPath(safeRequestedPath)) {
    return safeRequestedPath;
  }
  for (let index = 2; index < 1000; index += 1) {
    const candidate = validateVaultRelativePath(
      `${basePath}-${index}.md`,
      "Import note path",
    );
    if (!app.vault.getAbstractFileByPath(candidate)) {
      return candidate;
    }
  }
  throw new Error("Could not find an available DocFerry import path.");
}

async function ensureParentFolder(app: App, path: string): Promise<void> {
  const safePath = validateVaultRelativePath(path, "Import asset path");
  const parts = safePath.split("/");
  parts.pop();
  await ensureFolder(app, parts.join("/"));
}

async function ensureFolder(app: App, folderPath: string): Promise<void> {
  const safeFolderPath = validateVaultRelativePath(folderPath, "Vault folder");
  let current = "";
  for (const part of safeFolderPath.split("/")) {
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

async function rollbackCreatedPaths(app: App, paths: string[]): Promise<void> {
  for (const path of [...paths].reverse()) {
    try {
      const file = app.vault.getAbstractFileByPath(path);
      if (file instanceof TFile) {
        await app.fileManager.trashFile(file);
      }
    } catch {
      // Preserve the original import failure; cleanup is best-effort.
    }
  }
}
