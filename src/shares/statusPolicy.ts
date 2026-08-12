export function shareLinkIsAvailable(status: string): boolean {
  return status === "published" || status === "password_protected";
}

export function shareRequestMatchesActiveResult(
  requestedParseJobId: string,
  activeParseJobId: string | null | undefined,
): boolean {
  return requestedParseJobId === activeParseJobId;
}
