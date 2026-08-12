import assert from "node:assert/strict";
import test from "node:test";

import {
  DOCFERRY_SHARE_DELETE_CAPABILITY,
  DOCFERRY_SHARE_STOP_CAPABILITY,
  DOCFERRY_SHARE_UPDATE_CAPABILITY,
  shareCanDeleteRecord,
  shareCanManageAccess,
  shareCanStop,
  supportsShareCapability,
} from "../src/shares/lifecyclePolicy.ts";

test("exposes lifecycle actions only for compatible Share states", () => {
  assert.equal(shareCanManageAccess("published"), true);
  assert.equal(shareCanManageAccess("password_protected"), true);
  assert.equal(shareCanManageAccess("expired"), false);
  assert.equal(shareCanStop("published"), true);
  assert.equal(shareCanStop("stopped"), false);
  assert.equal(shareCanDeleteRecord("stopped"), true);
  assert.equal(shareCanDeleteRecord("expired"), true);
  assert.equal(shareCanDeleteRecord("published"), false);
});

test("keeps unapproved lifecycle controls hidden by exact capability", () => {
  const capabilities = new Set([DOCFERRY_SHARE_UPDATE_CAPABILITY]);
  assert.equal(
    supportsShareCapability(capabilities, DOCFERRY_SHARE_UPDATE_CAPABILITY),
    true,
  );
  assert.equal(
    supportsShareCapability(capabilities, DOCFERRY_SHARE_STOP_CAPABILITY),
    false,
  );
  assert.equal(
    supportsShareCapability(capabilities, DOCFERRY_SHARE_DELETE_CAPABILITY),
    false,
  );
});
