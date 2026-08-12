import { requestBondieJson } from "./auth";

export interface EntitlementSummaryResponse {
  plan: "docferry_pro" | "free";
  membership_key: string | null;
  membership_status: "active" | "inactive";
  media_note_enabled: boolean;
  manage_membership_url: string;
  usage_source: "docferry";
  monthly_media_limit: number | null;
  monthly_media_used: number | null;
}

export async function fetchEntitlementSummary(
  serverUrl: string,
  token: string,
): Promise<EntitlementSummaryResponse> {
  return requestBondieJson<EntitlementSummaryResponse>(
    serverUrl,
    "/v0/entitlements/summary",
    { Authorization: `Bearer ${token}` },
  );
}
