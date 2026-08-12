import assert from "node:assert/strict";
import test from "node:test";

import {
  CONNECTION_INTERRUPTED_MESSAGE,
  isTransientTransportError,
  retryIdempotentTransport,
} from "../src/api/transportRetry.ts";

test("recognizes Android TLS connection interruptions", () => {
  assert.equal(
    isTransientTransportError(new Error("Request Failed. SSLHandshakeException connection closed")),
    true,
  );
  assert.equal(isTransientTransportError(new Error("Server returned 403.")), false);
});

test("retries an idempotent request once after a transport interruption", async () => {
  let attempts = 0;
  const result = await retryIdempotentTransport(
    async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("connection closed");
      return "ok";
    },
    async () => undefined,
  );

  assert.equal(result, "ok");
  assert.equal(attempts, 2);
});

test("does not retry API failures and replaces repeated transport errors", async () => {
  let apiAttempts = 0;
  await assert.rejects(
    retryIdempotentTransport(
      async () => {
        apiAttempts += 1;
        throw new Error("Server returned 403.");
      },
      async () => undefined,
    ),
    /Server returned 403/,
  );
  assert.equal(apiAttempts, 1);

  await assert.rejects(
    retryIdempotentTransport(
      async () => {
        throw new Error("SSLHandshakeException connection closed");
      },
      async () => undefined,
    ),
    new Error(CONNECTION_INTERRUPTED_MESSAGE),
  );
});
