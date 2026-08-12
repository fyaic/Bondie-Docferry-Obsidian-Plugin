const SESSION_TOKEN_KEY = "bondie-docferry.session-token";
const SESSION_SECRET_ID = "bondie-docferry-session-token";
const LOGIN_STATE_KEY = "bondie-docferry.login-state";
const LOGIN_STATE_SECRET_ID = "bondie-docferry-login-state";
const LOGIN_STATE_SECRET_STALE_KEY = "bondie-docferry.login-state-secret-stale";
const LOGIN_STATE_TRANSIENT_STALE_KEY = "bondie-docferry.login-state-transient-stale";
const COMPLETED_LOGIN_STATE_KEY = "bondie-docferry.completed-login-state";
const SESSION_SECRET_STALE_KEY = "bondie-docferry.session-secret-stale";
const SESSION_TRANSIENT_STALE_KEY = "bondie-docferry.session-transient-stale";
const COMPLETED_LOGIN_STATE_TTL_MS = 2 * 60 * 1000;

export interface SessionSecretStorage {
  getSecret(id: string): string | null;
  setSecret(id: string, secret: string): void;
}

let cachedSessionToken: string | null = null;
let secretStorage: SessionSecretStorage | null = null;

export function configureSessionStorage(storage: SessionSecretStorage | null | undefined): void {
  secretStorage = storage ?? null;
  const transient = readPersistentFlag(SESSION_TRANSIENT_STALE_KEY)
    ? null
    : readTransientSessionToken();
  const persistedSecretIsStale = readPersistentFlag(SESSION_SECRET_STALE_KEY);
  let persisted: string | null = null;
  try {
    persisted = normalizeStoredToken(secretStorage?.getSecret(SESSION_SECRET_ID));
  } catch {
    secretStorage = null;
  }

  cachedSessionToken = transient ?? (persistedSecretIsStale ? null : persisted);
  if (secretStorage && transient) {
    try {
      secretStorage.setSecret(SESSION_SECRET_ID, transient);
      clearPersistentFlag(SESSION_SECRET_STALE_KEY);
    } catch {
      writePersistentFlag(SESSION_SECRET_STALE_KEY);
      secretStorage = null;
      return;
    }
    writePersistentFlag(SESSION_TRANSIENT_STALE_KEY);
    try {
      window.sessionStorage.removeItem(SESSION_TOKEN_KEY);
      clearPersistentFlag(SESSION_TRANSIENT_STALE_KEY);
    } catch {
      writeTransientSessionToken(transient);
    }
  }
}

export function getSessionToken(): string | null {
  if (cachedSessionToken) return cachedSessionToken;
  return readPersistentFlag(SESSION_TRANSIENT_STALE_KEY) ? null : readTransientSessionToken();
}

export function setSessionToken(token: string): boolean {
  const normalized = normalizeStoredToken(token);
  if (!normalized) return false;
  cachedSessionToken = normalized;
  if (secretStorage) {
    try {
      secretStorage.setSecret(SESSION_SECRET_ID, normalized);
      clearPersistentFlag(SESSION_SECRET_STALE_KEY);
    } catch {
      writePersistentFlag(SESSION_SECRET_STALE_KEY);
      secretStorage = null;
      return writeTransientSessionToken(normalized);
    }
    writePersistentFlag(SESSION_TRANSIENT_STALE_KEY);
    try {
      window.sessionStorage.removeItem(SESSION_TOKEN_KEY);
      clearPersistentFlag(SESSION_TRANSIENT_STALE_KEY);
    } catch {
      writeTransientSessionToken(normalized);
    }
    return true;
  }
  return writeTransientSessionToken(normalized);
}

export function clearSessionToken(): void {
  cachedSessionToken = null;
  if (secretStorage) {
    try {
      secretStorage.setSecret(SESSION_SECRET_ID, "");
      clearPersistentFlag(SESSION_SECRET_STALE_KEY);
    } catch {
      writePersistentFlag(SESSION_SECRET_STALE_KEY);
      secretStorage = null;
    }
  } else {
    writePersistentFlag(SESSION_SECRET_STALE_KEY);
  }
  writePersistentFlag(SESSION_TRANSIENT_STALE_KEY);
  try {
    window.sessionStorage.removeItem(SESSION_TOKEN_KEY);
    clearPersistentFlag(SESSION_TRANSIENT_STALE_KEY);
  } catch {
    writePersistentFlag(SESSION_TRANSIENT_STALE_KEY);
  }
}

export function normalizeLoginCode(value: string): string {
  return value.trim();
}

export function createPendingLoginState(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const state = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  if (secretStorage) {
    try {
      secretStorage.setSecret(LOGIN_STATE_SECRET_ID, state);
      clearPersistentFlag(LOGIN_STATE_SECRET_STALE_KEY);
    } catch {
      writePersistentFlag(LOGIN_STATE_SECRET_STALE_KEY);
      writeTransientLoginState(state);
    }
  } else {
    writeTransientLoginState(state);
  }
  cachedLoginState = state;
  recentlyCompletedLogin = null;
  clearCompletedLoginStateRecord();
  return state;
}

export function matchesPendingLoginState(value: string): boolean {
  const normalized = normalizeLoginState(value);
  const expected = cachedLoginState ?? readPendingLoginState();
  return Boolean(normalized && expected && normalized === expected);
}

export function getPendingLoginState(): string | null {
  return cachedLoginState ?? readPendingLoginState();
}

export async function markLoginStateCompleted(value: string): Promise<void> {
  const state = normalizeLoginState(value);
  if (!state) return;
  try {
    const completed = {
      digest: await sha256(state),
      expiresAt: Date.now() + COMPLETED_LOGIN_STATE_TTL_MS,
    };
    recentlyCompletedLogin = completed;
    writeCompletedLoginStateRecord(completed);
  } catch {
    // A missing Web Crypto digest must not invalidate an otherwise successful exchange.
  }
}

export async function matchesCompletedLoginState(value: string): Promise<boolean> {
  const state = normalizeLoginState(value);
  if (!state) return false;
  const completed = recentlyCompletedLogin ?? readCompletedLoginStateRecord();
  if (!completed) return false;
  if (completed.expiresAt <= Date.now()) {
    recentlyCompletedLogin = null;
    clearCompletedLoginStateRecord();
    return false;
  }
  recentlyCompletedLogin = completed;
  try {
    return completed.digest === await sha256(state);
  } catch {
    return false;
  }
}

export function clearPendingLoginState(): void {
  cachedLoginState = null;
  if (secretStorage) {
    try {
      secretStorage.setSecret(LOGIN_STATE_SECRET_ID, "");
      clearPersistentFlag(LOGIN_STATE_SECRET_STALE_KEY);
    } catch {
      writePersistentFlag(LOGIN_STATE_SECRET_STALE_KEY);
    }
  } else {
    writePersistentFlag(LOGIN_STATE_SECRET_STALE_KEY);
  }
  writePersistentFlag(LOGIN_STATE_TRANSIENT_STALE_KEY);
  try {
    window.sessionStorage.removeItem(LOGIN_STATE_KEY);
    clearPersistentFlag(LOGIN_STATE_TRANSIENT_STALE_KEY);
  } catch {
    // The tombstone prevents a consumed transient state from being revived.
  }
}

export function normalizeLoginState(value: string): string {
  const normalized = value.trim();
  return /^[A-Za-z0-9_-]{16,128}$/.test(normalized) ? normalized : "";
}

let cachedLoginState: string | null = null;
let recentlyCompletedLogin: CompletedLoginStateRecord | null = null;

interface CompletedLoginStateRecord {
  digest: string;
  expiresAt: number;
}

function readPendingLoginState(): string | null {
  if (secretStorage && !readPersistentFlag(LOGIN_STATE_SECRET_STALE_KEY)) {
    try {
      const persisted = normalizeLoginState(secretStorage.getSecret(LOGIN_STATE_SECRET_ID) ?? "");
      if (persisted) return persisted;
    } catch {
      // Fall back to transient storage.
    }
  }
  try {
    if (readPersistentFlag(LOGIN_STATE_TRANSIENT_STALE_KEY)) return null;
    return normalizeLoginState(window.sessionStorage.getItem(LOGIN_STATE_KEY) ?? "") || null;
  } catch {
    return null;
  }
}

function writeTransientLoginState(state: string): void {
  writePersistentFlag(LOGIN_STATE_TRANSIENT_STALE_KEY);
  try {
    window.sessionStorage.setItem(LOGIN_STATE_KEY, state);
    clearPersistentFlag(LOGIN_STATE_TRANSIENT_STALE_KEY);
  } catch {
    // The in-memory value remains available while this WebView stays alive.
  }
}

function readTransientSessionToken(): string | null {
  try {
    return normalizeStoredToken(window.sessionStorage.getItem(SESSION_TOKEN_KEY));
  } catch {
    return null;
  }
}

function writeTransientSessionToken(token: string): boolean {
  writePersistentFlag(SESSION_TRANSIENT_STALE_KEY);
  try {
    window.sessionStorage.setItem(SESSION_TOKEN_KEY, token);
    clearPersistentFlag(SESSION_TRANSIENT_STALE_KEY);
  } catch {
    // The in-memory value remains available while this WebView stays alive.
  }
  return false;
}

function normalizeStoredToken(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function readCompletedLoginStateRecord(): CompletedLoginStateRecord | null {
  try {
    const value = JSON.parse(window.localStorage.getItem(COMPLETED_LOGIN_STATE_KEY) ?? "null") as unknown;
    if (!value || typeof value !== "object") return null;
    const record = value as Partial<CompletedLoginStateRecord>;
    if (typeof record.digest !== "string" || !/^[a-f0-9]{64}$/u.test(record.digest)) return null;
    if (typeof record.expiresAt !== "number" || !Number.isFinite(record.expiresAt)) return null;
    return { digest: record.digest, expiresAt: record.expiresAt };
  } catch {
    return null;
  }
}

function writeCompletedLoginStateRecord(record: CompletedLoginStateRecord): void {
  try {
    window.localStorage.setItem(COMPLETED_LOGIN_STATE_KEY, JSON.stringify(record));
  } catch {
    // The in-memory marker still handles the normal poll/deep-link race.
  }
}

function clearCompletedLoginStateRecord(): void {
  try {
    window.localStorage.removeItem(COMPLETED_LOGIN_STATE_KEY);
  } catch {
    // The in-memory marker is cleared separately.
  }
}

function readPersistentFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writePersistentFlag(key: string): void {
  try {
    window.localStorage.setItem(key, "1");
  } catch {
    // A failed secure write still cannot be recovered safely in this process.
  }
}

function clearPersistentFlag(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Secret storage remains the source of truth when this best-effort marker is unavailable.
  }
}
