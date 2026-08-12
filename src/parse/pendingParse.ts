export type PendingParseIdentity = {
  jobId?: string;
  sourceUrl: string;
};

export type RemoteParseIdentity = {
  parse_job_id: string;
  source_url: string;
};

export function pendingParseMatchesRemoteJob(
  pending: PendingParseIdentity | null,
  job: RemoteParseIdentity,
): boolean {
  if (!pending) return false;
  if (pending.jobId) return pending.jobId === job.parse_job_id;
  return pending.sourceUrl === job.source_url;
}
