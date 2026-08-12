import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyLinkIntent,
  linkIntentRequiresSession,
} from "../src/docferry/importContract.ts";

test("classifies the single input as empty, DocFerry import, or web capture", () => {
  assert.deepEqual(classifyLinkIntent("  "), { kind: "empty" });
  assert.deepEqual(
    classifyLinkIntent("https://docferry.bondie.io/s/share_123"),
    {
      kind: "docferry-share",
      url: "https://docferry.bondie.io/s/share_123",
    },
  );
  assert.deepEqual(
    classifyLinkIntent("https://www.youtube.com/watch?v=abc"),
    {
      kind: "web",
      url: "https://www.youtube.com/watch?v=abc",
    },
  );
});

test("does not downgrade malformed DocFerry URLs into web capture", () => {
  assert.deepEqual(
    classifyLinkIntent("https://docferry.bondie.io/s/share_123?next=evil"),
    { kind: "invalid" },
  );
  assert.deepEqual(
    classifyLinkIntent("https://docferry.bondie.io/account"),
    { kind: "invalid" },
  );
  assert.deepEqual(classifyLinkIntent("obsidian://open?vault=Notes"), { kind: "invalid" });
});

test("allows public Share import without a product session", () => {
  assert.equal(
    linkIntentRequiresSession(classifyLinkIntent("https://docferry.bondie.io/s/share_123")),
    false,
  );
  assert.equal(
    linkIntentRequiresSession(classifyLinkIntent("https://www.youtube.com/watch?v=abc")),
    true,
  );
});
