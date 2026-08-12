import assert from "node:assert/strict";
import test from "node:test";

import {
  joinVaultPath,
  MAX_VAULT_PATH_SEGMENT_BYTES,
  validateVaultRelativePath,
} from "../src/vault/vaultPath.ts";

test("accepts and joins safe vault-relative paths without rewriting them", () => {
  assert.equal(validateVaultRelativePath("Bondie Docferry/Notes"), "Bondie Docferry/Notes");
  assert.equal(
    joinVaultPath("Bondie Docferry/Imports", "images/cover.png"),
    "Bondie Docferry/Imports/images/cover.png",
  );
});

test("rejects absolute, traversal, backslash, empty, and control-character paths", () => {
  const unsafePaths = [
    "/Bondie Docferry",
    "C:/Bondie Docferry",
    "Bondie Docferry\\Notes",
    ".",
    "..",
    "Bondie Docferry/./Notes",
    "Bondie Docferry/../Notes",
    "Bondie Docferry//Notes",
    "Bondie Docferry/Notes/",
    "Bondie Docferry/\0note.md",
    "Bondie Docferry/\u001fnote.md",
    "Bondie Docferry/\u007fnote.md",
  ];

  for (const path of unsafePaths) {
    assert.throws(() => validateVaultRelativePath(path), path);
  }
});

test("rejects unsafe and overlong path segments", () => {
  const unsafeSegments = [
    "NUL",
    "con.md",
    "LPT1.txt",
    "note.",
    " note",
    "note ",
    "note?.md",
    "note[1].md",
    "a".repeat(MAX_VAULT_PATH_SEGMENT_BYTES + 1),
    "\u4e2d".repeat(86),
  ];

  for (const segment of unsafeSegments) {
    assert.throws(() => validateVaultRelativePath(`Imports/${segment}`), segment);
  }
});

test("join rejects an unsafe folder or child before constructing a write path", () => {
  assert.throws(() => joinVaultPath("../outside", "note.md"));
  assert.throws(() => joinVaultPath("Imports", "/outside.md"));
});
