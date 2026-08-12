import { requestUrl } from "obsidian";

import {
  parseDocFerryShareUrl,
  resolveDocFerryAssetUrl,
} from "../docferry/importContract";
import { requestBondieJson } from "./auth";
import { retryIdempotentTransport } from "./transportRetry";

export interface DocFerryShareResponse {
  share_id: string;
  slug: string;
  status: string;
  url: string;
}

export interface DocFerryShareListItem {
  share_id: string;
  title: string;
  status: string;
  url: string;
  updated_at: string;
  last_published_at: string;
}

export interface DocFerryShareListResponse {
  shares: DocFerryShareListItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface DocFerryShareDetailResponse {
  share_id: string;
  title: string;
  status: string;
  url: string;
  theme_mode: "reader" | "full";
  password_enabled: boolean;
  expires_at: string | null;
  stopped_at: string | null;
  updated_at: string;
  last_published_at: string;
}

export interface DocFerryShareAccessUpdate {
  title?: string;
  password?: string;
  password_mode: "keep" | "set" | "clear";
  expiration_mode: "keep" | "set" | "clear";
  expires_at?: string;
}

export interface DocFerryImportAsset {
  asset_id: string;
  role: string;
  original_path?: string | null;
  filename: string;
  content_type: string;
  byte_length: number;
  url: string;
}

export interface DocFerryImportPayload {
  slug: string;
  title: string;
  markdown: string;
  source_hash: string;
  assets: DocFerryImportAsset[];
  updated_at: string;
}

export interface DocFerryImportSession {
  baseUrl: string;
  payload: DocFerryImportPayload;
}

export interface DocFerryUsageResponse {
  media_to_note: {
    used: number;
    remaining: number;
    resets_at: string;
  };
}

export async function fetchDocFerryUsage(
  serverUrl: string,
  token: string,
): Promise<DocFerryUsageResponse> {
  return requestBondieJson<DocFerryUsageResponse>(
    serverUrl,
    "/v0/docferry/usage",
    { Authorization: `Bearer ${token}` },
  );
}

export async function fetchDocFerryShares(
  serverUrl: string,
  token: string,
  limit = 10,
  offset = 0,
): Promise<DocFerryShareListResponse> {
  return requestBondieJson<DocFerryShareListResponse>(
    serverUrl,
    `/v0/docferry/shares?limit=${limit}&offset=${offset}`,
    { Authorization: `Bearer ${token}` },
  );
}

export async function publishDocFerryShare(
  serverUrl: string,
  token: string,
  parseJobId: string,
  idempotencyKey: string,
): Promise<DocFerryShareResponse> {
  return retryIdempotentTransport(() =>
    requestBondieJson<DocFerryShareResponse>(
      serverUrl,
      "/v0/docferry/share",
      {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      "POST",
      JSON.stringify({ parse_job_id: parseJobId }),
    ),
  );
}

export async function fetchDocFerryShareDetail(
  serverUrl: string,
  token: string,
  shareId: string,
): Promise<DocFerryShareDetailResponse> {
  return requestBondieJson<DocFerryShareDetailResponse>(
    serverUrl,
    `/v0/docferry/shares/${encodeURIComponent(shareId)}`,
    { Authorization: `Bearer ${token}` },
  );
}

export async function updateDocFerryShareAccess(
  serverUrl: string,
  token: string,
  shareId: string,
  update: DocFerryShareAccessUpdate,
): Promise<DocFerryShareDetailResponse> {
  return requestBondieJson<DocFerryShareDetailResponse>(
    serverUrl,
    `/v0/docferry/shares/${encodeURIComponent(shareId)}/access`,
    {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    "PATCH",
    JSON.stringify(update),
  );
}

export async function stopDocFerryShare(
  serverUrl: string,
  token: string,
  shareId: string,
): Promise<void> {
  await requestBondieJson(
    serverUrl,
    `/v0/docferry/shares/${encodeURIComponent(shareId)}`,
    { Authorization: `Bearer ${token}` },
    "DELETE",
  );
}

export async function deleteDocFerryShareRecord(
  serverUrl: string,
  token: string,
  shareId: string,
): Promise<void> {
  await requestBondieJson(
    serverUrl,
    `/v0/docferry/shares/${encodeURIComponent(shareId)}/record`,
    { Authorization: `Bearer ${token}` },
    "DELETE",
  );
}

export async function fetchDocFerryImportPayload(shareUrl: string): Promise<DocFerryImportSession> {
  const parsed = parseDocFerryShareUrl(shareUrl);
  const response = await requestUrl({
    method: "GET",
    throw: false,
    url: parsed.importUrl,
  });

  if (response.status < 200 || response.status >= 300) {
    if (response.status === 401) {
      throw new Error("This DocFerry share requires a password and cannot be imported yet.");
    }
    if (response.status === 404 || response.status === 410) {
      throw new Error("This DocFerry share is no longer available.");
    }
    throw new Error(`DocFerry import returned ${response.status}.`);
  }

  const payload = parseImportPayload(response.json);
  if (payload.slug !== parsed.slug) {
    throw new Error("DocFerry import response did not match the requested share.");
  }
  return { baseUrl: parsed.baseUrl, payload };
}

export async function downloadDocFerryImportAsset(
  assetUrl: string,
  baseUrl: string,
): Promise<ArrayBuffer> {
  const response = await requestUrl({
    method: "GET",
    throw: false,
    url: resolveDocFerryAssetUrl(assetUrl, baseUrl),
  });
  if (response.status >= 200 && response.status < 300) {
    return response.arrayBuffer;
  }
  throw new Error(`DocFerry asset download returned ${response.status}.`);
}

function parseImportPayload(value: unknown): DocFerryImportPayload {
  if (!isRecord(value) || !Array.isArray(value.assets)) {
    throw new Error("DocFerry import returned an invalid payload.");
  }
  if (
    typeof value.slug !== "string" ||
    typeof value.title !== "string" ||
    typeof value.markdown !== "string" ||
    typeof value.source_hash !== "string" ||
    typeof value.updated_at !== "string"
  ) {
    throw new Error("DocFerry import returned an invalid payload.");
  }

  const assets = value.assets.map((asset) => parseImportAsset(asset));
  return {
    assets,
    markdown: value.markdown,
    slug: value.slug,
    source_hash: value.source_hash,
    title: value.title,
    updated_at: value.updated_at,
  };
}

function parseImportAsset(value: unknown): DocFerryImportAsset {
  if (
    !isRecord(value) ||
    typeof value.asset_id !== "string" ||
    typeof value.role !== "string" ||
    typeof value.filename !== "string" ||
    typeof value.content_type !== "string" ||
    typeof value.byte_length !== "number" ||
    typeof value.url !== "string" ||
    (value.original_path !== undefined && value.original_path !== null && typeof value.original_path !== "string")
  ) {
    throw new Error("DocFerry import returned invalid asset metadata.");
  }
  return {
    asset_id: value.asset_id,
    byte_length: value.byte_length,
    content_type: value.content_type,
    filename: value.filename,
    original_path: value.original_path,
    role: value.role,
    url: value.url,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
