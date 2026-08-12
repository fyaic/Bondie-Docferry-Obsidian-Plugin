export const DOCFERRY_CONNECTION_PENDING_MESSAGE =
  "DocFerry is still connecting. Reopen Bondie-Docferry in a moment to continue.";

export type ParseInterruption = {
  kind: "docferry-connecting" | "connection-interrupted";
  message: string;
};

export function parseInterruption(error: unknown): ParseInterruption | null {
  const apiError = asApiError(error);
  if (
    apiError &&
    ["MEDIA_CONNECTION_NOT_READY", "MEDIA_DOCFERRY_NOT_READY"].includes(apiError.code)
  ) {
    return {
      kind: "docferry-connecting",
      message: DOCFERRY_CONNECTION_PENDING_MESSAGE,
    };
  }
  if (
    error instanceof TypeError ||
    (apiError && (apiError.retryable || apiError.status >= 500))
  ) {
    return {
      kind: "connection-interrupted",
      message: "Connection interrupted. Reopen Bondie-Docferry to continue your note.",
    };
  }
  return null;
}

function asApiError(error: unknown): { code: string; retryable: boolean; status: number } | null {
  if (!error || typeof error !== "object") return null;
  const candidate = error as Record<string, unknown>;
  if (
    typeof candidate.code !== "string" ||
    typeof candidate.retryable !== "boolean" ||
    typeof candidate.status !== "number"
  ) {
    return null;
  }
  return {
    code: candidate.code,
    retryable: candidate.retryable,
    status: candidate.status,
  };
}
