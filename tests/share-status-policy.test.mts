import assert from "node:assert/strict";
import test from "node:test";

import {
  shareLinkIsAvailable,
  shareRequestMatchesActiveResult,
} from "../src/shares/statusPolicy.ts";

test("keeps actions only for share links that may still be opened", () => {
  assert.equal(shareLinkIsAvailable("published"), true);
  assert.equal(shareLinkIsAvailable("password_protected"), true);
  assert.equal(shareLinkIsAvailable("stopped"), false);
  assert.equal(shareLinkIsAvailable("expired"), false);
  assert.equal(shareLinkIsAvailable("future_status"), false);
});

test("binds a Share response only to the result that started the request", () => {
  assert.equal(shareRequestMatchesActiveResult("bdf_parse_1", "bdf_parse_1"), true);
  assert.equal(shareRequestMatchesActiveResult("bdf_parse_1", "bdf_parse_2"), false);
  assert.equal(shareRequestMatchesActiveResult("bdf_parse_1", null), false);
});
