export function remoteParseCanRetry(stage: string): boolean {
  return stage === "failed" || stage === "cancelled";
}
