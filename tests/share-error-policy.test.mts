import assert from "node:assert/strict";
import test from "node:test";

import {
  shareFailureMessage,
  shareLifecycleFailureMessage,
} from "../src/shares/errorPolicy.ts";

test("explains a DocFerry share limit without exposing bridge internals", () => {
  assert.equal(
    shareFailureMessage({ code: "DOCFERRY_SHARE_LIMIT_REACHED", retryable: false, status: 409 }),
    "DocFerry could not create a public link right now. Your note is still safe in Obsidian.",
  );
});

test("keeps retryable share failures reassuring and actionable", () => {
  assert.equal(
    shareFailureMessage({ code: "DOCFERRY_RECEIVER_UNAVAILABLE", retryable: true, status: 502 }),
    "Public sharing is temporarily unavailable. Your note is still safe in Obsidian.",
  );
});

test("maps lifecycle conflicts without exposing capability internals", () => {
  assert.equal(
    shareLifecycleFailureMessage(
      { code: "DOCFERRY_SHARE_STILL_ACTIVE", retryable: false, status: 409 },
      "fallback",
    ),
    "Stop this public link before deleting its history.",
  );
  assert.equal(
    shareLifecycleFailureMessage(
      { code: "DOCFERRY_CAPABILITY_FORBIDDEN", retryable: false, status: 403 },
      "fallback",
    ),
    "Share management is not available for this account yet.",
  );
});
