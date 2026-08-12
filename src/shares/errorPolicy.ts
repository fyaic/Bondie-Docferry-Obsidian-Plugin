interface ShareApiError {
  code?: unknown;
  retryable?: unknown;
  status?: unknown;
}

export function shareFailureMessage(error: unknown): string {
  const candidate = error as ShareApiError | null;
  if (candidate?.code === "DOCFERRY_SHARE_LIMIT_REACHED") {
    return "DocFerry could not create a public link right now. Your note is still safe in Obsidian.";
  }
  if (candidate?.code === "DOCFERRY_GRANT_REJECTED") {
    return "DocFerry could not verify this account for sharing. Try again in a moment.";
  }
  if (candidate?.retryable === true || (typeof candidate?.status === "number" && candidate.status >= 500)) {
    return "Public sharing is temporarily unavailable. Your note is still safe in Obsidian.";
  }
  return "The public link could not be created. Review your DocFerry Shares and try again.";
}

export function shareLifecycleFailureMessage(error: unknown, fallback: string): string {
  const candidate = error as ShareApiError | null;
  switch (candidate?.code) {
    case "DOCFERRY_SHARE_NOT_FOUND":
      return "This Share is no longer in your history. Refresh Shares.";
    case "DOCFERRY_SHARE_NOT_EDITABLE":
      return "This public link has already been stopped. Refresh Shares.";
    case "DOCFERRY_SHARE_STILL_ACTIVE":
      return "Stop this public link before deleting its history.";
    case "DOCFERRY_CAPABILITY_FORBIDDEN":
    case "DOCFERRY_SOURCE_INSTANCE_UNAVAILABLE":
    case "DOCFERRY_TARGET_UNAVAILABLE":
      return "Share management is not available for this account yet.";
    default:
      if (
        candidate?.retryable === true ||
        (typeof candidate?.status === "number" && candidate.status >= 500)
      ) {
        return "Share management is temporarily unavailable. Try again in a moment.";
      }
      return fallback;
  }
}
