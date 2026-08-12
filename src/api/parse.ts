import { requestUrl } from "obsidian";

import { BondieApiError, type ApiErrorBody } from "./auth";

export type RemoteParseStage =
  | "received"
  | "metadata"
  | "transcript"
  | "structure"
  | "template"
  | "complete"
  | "failed"
  | "cancelled";

export interface RemoteParseJob {
  completed_at: string | null;
  created_at: string;
  failed_reason: string | null;
  language: string;
  parse_job_id: string;
  progress: number;
  result_available: boolean;
  source_host: string;
  source_url: string;
  stage: RemoteParseStage;
  status_text: string;
  template: string;
  title: string | null;
  updated_at: string;
}

export interface RemoteParseJobDeleteResponse {
  deleted: boolean;
  parse_job_id: string;
}

export interface RemoteParseJobList {
  jobs: RemoteParseJob[];
}

export interface RemoteParseResult {
  created_at: string;
  markdown: string;
  parse_job_id: string;
  source_host: string;
  source_url: string;
  summary: string;
  template: string;
  title: string;
}

export interface RemoteParseJobCreateInput {
  language: string;
  sourceUrl: string;
  template: string;
}

export async function createRemoteParseJob(
  serverUrl: string,
  token: string,
  input: RemoteParseJobCreateInput,
  idempotencyKey: string,
): Promise<RemoteParseJob> {
  return requestJson<RemoteParseJob>(
    serverUrl,
    "/v0/parse/jobs",
    token,
    "POST",
    JSON.stringify({
      language: input.language,
      source_url: input.sourceUrl,
      template: input.template,
    }),
    { "Idempotency-Key": idempotencyKey },
  );
}

export async function fetchRemoteParseJobs(serverUrl: string, token: string): Promise<RemoteParseJobList> {
  return requestJson<RemoteParseJobList>(serverUrl, "/v0/parse/jobs", token);
}

export async function fetchRemoteParseJob(
  serverUrl: string,
  token: string,
  parseJobId: string,
): Promise<RemoteParseJob> {
  return requestJson<RemoteParseJob>(serverUrl, `/v0/parse/jobs/${encodeURIComponent(parseJobId)}`, token);
}

export async function fetchRemoteParseResult(
  serverUrl: string,
  token: string,
  parseJobId: string,
): Promise<RemoteParseResult> {
  return requestJson<RemoteParseResult>(
    serverUrl,
    `/v0/parse/jobs/${encodeURIComponent(parseJobId)}/result`,
    token,
  );
}

export async function cancelRemoteParseJob(
  serverUrl: string,
  token: string,
  parseJobId: string,
): Promise<RemoteParseJob> {
  return requestJson<RemoteParseJob>(
    serverUrl,
    `/v0/parse/jobs/${encodeURIComponent(parseJobId)}/cancel`,
    token,
    "POST",
  );
}

export async function retryRemoteParseJob(
  serverUrl: string,
  token: string,
  parseJobId: string,
): Promise<RemoteParseJob> {
  return requestJson<RemoteParseJob>(
    serverUrl,
    `/v0/parse/jobs/${encodeURIComponent(parseJobId)}/retry`,
    token,
    "POST",
  );
}

export async function deleteRemoteParseJob(
  serverUrl: string,
  token: string,
  parseJobId: string,
): Promise<RemoteParseJobDeleteResponse> {
  return requestJson<RemoteParseJobDeleteResponse>(
    serverUrl,
    `/v0/parse/jobs/${encodeURIComponent(parseJobId)}`,
    token,
    "DELETE",
  );
}

async function requestJson<T>(
  serverUrl: string,
  path: string,
  token: string,
  method = "GET",
  body?: string,
  extraHeaders: Record<string, string> = {},
): Promise<T> {
  const response = await requestUrl({
    body,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...extraHeaders,
    },
    method,
    throw: false,
    url: `${serverUrl.replace(/\/+$/, "")}${path}`,
  });

  if (response.status >= 200 && response.status < 300) {
    return response.json as T;
  }

  const error = parseErrorEnvelope(response.json);
  if (error) {
    throw new BondieApiError(response.status, error);
  }

  throw new Error(`Server returned ${response.status}.`);
}

function parseErrorEnvelope(value: unknown): ApiErrorBody | null {
  if (!isRecord(value) || !isRecord(value.error)) {
    return null;
  }

  const error = value.error;
  if (
    typeof error.request_id !== "string" ||
    typeof error.code !== "string" ||
    typeof error.message !== "string" ||
    typeof error.retryable !== "boolean"
  ) {
    return null;
  }

  return {
    code: error.code,
    message: error.message,
    request_id: error.request_id,
    retryable: error.retryable,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
