const CLIENT_INSTANCE_PREFIX = "bdf_client_";
const CLIENT_INSTANCE_PATTERN = /^bdf_client_[0-9a-f]{32}$/;

export function createClientInstanceId(): string {
  const bytes = new Uint8Array(16);
  window.crypto.getRandomValues(bytes);
  const value = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${CLIENT_INSTANCE_PREFIX}${value}`;
}

export function normalizeClientInstanceId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const candidate = value.trim().toLowerCase();
  return CLIENT_INSTANCE_PATTERN.test(candidate) ? candidate : null;
}
