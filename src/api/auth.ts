import { requestUrl } from "obsidian";

export interface AuthConfigResponse {
  provider: string;
  product_key: string;
  environment: string;
  auth_profile: string;
  configured: boolean;
  auth_configured: boolean;
  login_available: boolean;
  exchange_available: boolean;
  auth_config_source: string;
  auth_config_synced: boolean;
  auth_config_fetch_error: string | null;
  synapsehub: SynapseHubLinksResponse;
  issuer_configured: boolean;
  audience_configured: boolean;
  client_configured: boolean;
  callback_configured: boolean;
  client_secret_configured: boolean;
  session_secret_configured: boolean;
}

export interface AuthSelfCheckResponse extends AuthConfigResponse {
  missing_config_keys: string[];
}

export interface SynapseHubLinksResponse {
  base_url: string;
  auth_config_url: string;
  product_context_url: string;
  account_center_url: string;
  account_security_url: string;
  profile_settings_url: string;
  devices_url: string;
  privacy_url: string;
  session_state_url: string;
  global_session_revoke_url: string;
  bondie_logout_url: string;
}

export interface WhoamiResponse {
  authenticated: boolean;
  display_user: DisplayUser | null;
  product_subject_id: string | null;
  product_instance_id: string | null;
  auth_source: string;
  product: Record<string, unknown> | null;
}

export interface DisplayUser {
  email?: string | null;
  name?: string | null;
  picture?: string | null;
}

export interface TokenExchangeResponse {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  product_subject_id: string;
  product_instance_id: string | null;
  product_key: string;
  product: Record<string, unknown>;
}

interface PendingTokenExchangeResponse {
  status: "pending";
}

export interface ApiErrorBody {
  request_id: string;
  code: string;
  message: string;
  retryable: boolean;
}

export class BondieApiError extends Error {
  code: string;
  requestId: string;
  retryable: boolean;
  status: number;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.code = body.code;
    this.requestId = body.request_id;
    this.retryable = body.retryable;
    this.status = status;
  }
}

export async function fetchAuthSelfCheck(serverUrl: string): Promise<AuthSelfCheckResponse> {
  return requestBondieJson<AuthSelfCheckResponse>(serverUrl, "/v0/auth/self-check");
}

export async function fetchWhoami(serverUrl: string, token: string): Promise<WhoamiResponse> {
  return requestBondieJson<WhoamiResponse>(serverUrl, "/v0/auth/whoami", {
    Authorization: `Bearer ${token}`,
  });
}

export function buildLoginUrl(
  serverUrl: string,
  options: { clientState?: string; prompt?: "login"; screenHint?: "signup" } = {},
): string {
  const base = `${serverUrl.replace(/\/+$/, "")}/v0/auth/login`;
  const query = new URLSearchParams();
  if (options.clientState) query.set("client_state", options.clientState);
  if (options.prompt === "login") query.set("prompt", "login");
  if (options.screenHint === "signup") query.set("screen_hint", "signup");
  const encoded = query.toString();
  return encoded ? `${base}?${encoded}` : base;
}

export async function exchangeLoginCode(
  serverUrl: string,
  code: string,
  state: string,
): Promise<TokenExchangeResponse> {
  return requestBondieJson<TokenExchangeResponse>(
    serverUrl,
    "/v0/auth/exchange",
    { "Content-Type": "application/json" },
    "POST",
    JSON.stringify({ code, state }),
  );
}

export async function exchangePendingLogin(
  serverUrl: string,
  state: string,
): Promise<TokenExchangeResponse | null> {
  const response = await requestBondieJson<TokenExchangeResponse | PendingTokenExchangeResponse>(
    serverUrl,
    "/v0/auth/exchange/pending",
    { "Content-Type": "application/json" },
    "POST",
    JSON.stringify({ state }),
  );
  if ("status" in response) return null;
  return response;
}

export async function logoutSession(serverUrl: string, token: string | null): Promise<void> {
  await requestBondieJson<{ ok: boolean; client_should_clear_session: boolean }>(
    serverUrl,
    "/v0/auth/logout",
    token ? { Authorization: `Bearer ${token}` } : undefined,
    "POST",
  );
}

export async function globalLogoutSession(
  serverUrl: string,
  token: string,
): Promise<{ ok: boolean; client_should_clear_session: boolean; continue_logout_url: string }> {
  return requestBondieJson(
    serverUrl,
    "/v0/auth/global-logout",
    { Authorization: `Bearer ${token}` },
    "POST",
  );
}

export async function requestBondieJson<T>(
  serverUrl: string,
  path: string,
  headers?: Record<string, string>,
  method = "GET",
  body?: string,
): Promise<T> {
  const url = `${serverUrl.replace(/\/+$/, "")}${path}`;
  const response = await requestUrl({
    body,
    headers,
    method,
    throw: false,
    url,
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
    request_id: error.request_id,
    code: error.code,
    message: error.message,
    retryable: error.retryable,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
