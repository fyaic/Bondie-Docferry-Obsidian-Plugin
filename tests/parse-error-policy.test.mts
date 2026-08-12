import assert from "node:assert/strict";
import test from "node:test";

import {
  DOCFERRY_CONNECTION_PENDING_MESSAGE,
  parseInterruption,
} from "../src/parse/errorPolicy.ts";

function apiError(code: string, retryable: boolean, status: number) {
  return {
    code,
    retryable,
    status,
  };
}

test("prioritizes DocFerry connection setup over a generic retryable failure", () => {
  assert.deepEqual(
    parseInterruption(apiError("MEDIA_DOCFERRY_NOT_READY", true, 409)),
    {
      kind: "docferry-connecting",
      message: DOCFERRY_CONNECTION_PENDING_MESSAGE,
    },
  );
  assert.deepEqual(
    parseInterruption(apiError("MEDIA_CONNECTION_NOT_READY", false, 409)),
    {
      kind: "docferry-connecting",
      message: DOCFERRY_CONNECTION_PENDING_MESSAGE,
    },
  );
});

test("keeps transport failures recoverable and terminal API errors terminal", () => {
  assert.equal(parseInterruption(apiError("MEDIA_RESULT_NOT_FOUND", false, 404)), null);
  assert.equal(parseInterruption(apiError("MEDIA_SOURCE_UNSUPPORTED", false, 422)), null);
  assert.equal(
    parseInterruption(apiError("MEDIA_DOCFERRY_UNAVAILABLE", true, 502))?.kind,
    "connection-interrupted",
  );
  assert.equal(parseInterruption(new TypeError("offline"))?.kind, "connection-interrupted");
});
