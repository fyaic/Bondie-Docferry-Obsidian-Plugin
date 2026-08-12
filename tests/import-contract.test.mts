import assert from "node:assert/strict";
import test from "node:test";

import {
  importAssetRelativePath,
  parseDocFerryShareUrl,
  resolveDocFerryAssetUrl,
  safeImportSegment,
} from "../src/docferry/importContract.ts";

test("accepts the production DocFerry share URL", () => {
  assert.deepEqual(parseDocFerryShareUrl("https://docferry.bondie.io/s/share_123"), {
    baseUrl: "https://docferry.bondie.io",
    importUrl: "https://docferry.bondie.io/s/share_123/import",
    slug: "share_123",
  });
});

test("rejects non-production and decorated share URLs", () => {
  assert.throws(() => parseDocFerryShareUrl("http://docferry.bondie.io/s/share_123"));
  assert.throws(() => parseDocFerryShareUrl("https://example.com/s/share_123"));
  assert.throws(() => parseDocFerryShareUrl("https://docferry.bondie.io/s/share_123?next=evil"));
});

test("keeps imported paths inside the vault folder", () => {
  assert.equal(
    importAssetRelativePath({
      asset_id: "asset_1",
      filename: "fallback.png",
      original_path: "../../images/cover.png?download=1",
    }),
    "images/cover.png",
  );
  assert.equal(safeImportSegment("Quarterly: review/notes"), "Quarterly review notes");
});

test("allows only same-origin DocFerry asset URLs", () => {
  assert.equal(
    resolveDocFerryAssetUrl("/s/share_123/assets/asset_1", "https://docferry.bondie.io"),
    "https://docferry.bondie.io/s/share_123/assets/asset_1",
  );
  assert.throws(() =>
    resolveDocFerryAssetUrl("https://example.com/asset", "https://docferry.bondie.io"),
  );
});
