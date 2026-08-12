import { requestBondieJson } from "./auth";

export interface InterconnectBootstrapRequest {
  client_instance_id: string;
  platform: string;
  plugin_version: string;
}

export interface InterconnectStatusResponse {
  source_registered: boolean;
  source_product_instance_id: string | null;
  docferry_available: boolean;
  docferry_target_count: number;
  grant_contract_ready: boolean;
  receiver_configured: boolean;
  supported_business_capabilities: string[];
}

export async function bootstrapInterconnect(
  serverUrl: string,
  token: string,
  body: InterconnectBootstrapRequest,
): Promise<InterconnectStatusResponse> {
  return requestBondieJson<InterconnectStatusResponse>(
    serverUrl,
    "/v0/interconnect/bootstrap",
    {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    "POST",
    JSON.stringify(body),
  );
}

export async function fetchInterconnectStatus(
  serverUrl: string,
  token: string,
): Promise<InterconnectStatusResponse> {
  return requestBondieJson<InterconnectStatusResponse>(
    serverUrl,
    "/v0/interconnect/status",
    { Authorization: `Bearer ${token}` },
  );
}
