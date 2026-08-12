import assert from "node:assert/strict";
import test from "node:test";

import { remoteParseCanRetry } from "../src/parse/retryPolicy.ts";

test("offers retry only for failed or cancelled processing", () => {
  assert.equal(remoteParseCanRetry("failed"), true);
  assert.equal(remoteParseCanRetry("cancelled"), true);
  assert.equal(remoteParseCanRetry("received"), false);
  assert.equal(remoteParseCanRetry("complete"), false);
  assert.equal(remoteParseCanRetry("future_stage"), false);
});
