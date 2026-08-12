export const CONNECTION_INTERRUPTED_MESSAGE =
  "The connection was interrupted. Check your network and try again.";

const TRANSIENT_TRANSPORT_MARKERS = [
  "sslhandshakeexception",
  "connection closed",
  "connection reset",
  "network error",
  "network request failed",
  "socket closed",
  "timed out",
  "timeout",
];

export function isTransientTransportError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  return TRANSIENT_TRANSPORT_MARKERS.some((marker) => normalized.includes(marker));
}

export async function retryIdempotentTransport<T>(
  request: () => Promise<T>,
  wait: () => Promise<void> = () => new Promise((resolve) => window.setTimeout(resolve, 400)),
): Promise<T> {
  try {
    return await request();
  } catch (error) {
    if (!isTransientTransportError(error)) {
      throw error;
    }
  }

  await wait();
  try {
    return await request();
  } catch (error) {
    if (isTransientTransportError(error)) {
      throw new Error(CONNECTION_INTERRUPTED_MESSAGE);
    }
    throw error;
  }
}
