export type LocalParseStage =
  | "received"
  | "metadata"
  | "transcript"
  | "structure"
  | "template"
  | "preview"
  | "saving"
  | "saved"
  | "cancelled"
  | "failed";

export interface LocalParseJob {
  id: string;
  sourceUrl: string;
  remoteJobId?: string;
  stage: LocalParseStage;
  statusText: string;
  updatedAt: string;
}

export function createLocalParseJob(sourceUrl: string): LocalParseJob {
  return {
    id: createJobId(),
    sourceUrl,
    stage: "received",
    statusText: "Link received.",
    updatedAt: new Date().toISOString(),
  };
}

export function advanceLocalParseJob(
  job: LocalParseJob,
  stage: LocalParseStage,
  statusText: string,
): LocalParseJob {
  return {
    ...job,
    stage,
    statusText,
    updatedAt: new Date().toISOString(),
  };
}

function createJobId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
