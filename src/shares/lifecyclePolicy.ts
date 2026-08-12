export const DOCFERRY_SHARE_UPDATE_CAPABILITY = "docferry.share.update";
export const DOCFERRY_SHARE_STOP_CAPABILITY = "docferry.share.stop";
export const DOCFERRY_SHARE_DELETE_CAPABILITY = "docferry.share.delete";

export function shareCanManageAccess(status: string): boolean {
  return status === "published" || status === "password_protected";
}

export function shareCanStop(status: string): boolean {
  return shareCanManageAccess(status);
}

export function shareCanDeleteRecord(status: string): boolean {
  return status === "stopped" || status === "expired";
}

export function supportsShareCapability(
  capabilities: ReadonlySet<string>,
  capability: string,
): boolean {
  return capabilities.has(capability);
}
