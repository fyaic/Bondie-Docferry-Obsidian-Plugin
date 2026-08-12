import assert from "node:assert/strict";
import test from "node:test";

import { pendingParseMatchesRemoteJob } from "../src/parse/pendingParse.ts";

const job = {
  parse_job_id: "bdf_parse_test",
  source_url: "https://example.com/source",
};

test("matches a pending request by the assigned remote job id", () => {
  assert.equal(
    pendingParseMatchesRemoteJob(
      { jobId: "bdf_parse_test", sourceUrl: "https://example.com/other" },
      job,
    ),
    true,
  );
});

test("matches an early failed create by its source before a job id was returned", () => {
  assert.equal(
    pendingParseMatchesRemoteJob({ sourceUrl: "https://example.com/source" }, job),
    true,
  );
});

test("does not clear a different assigned request even when the source is reused", () => {
  assert.equal(
    pendingParseMatchesRemoteJob(
      { jobId: "bdf_parse_newer", sourceUrl: "https://example.com/source" },
      job,
    ),
    false,
  );
  assert.equal(pendingParseMatchesRemoteJob(null, job), false);
});
