import assert from "node:assert/strict";
import test from "node:test";

import {
  createLocalHistoryItem,
  normalizeLocalHistory,
  removeLocalHistoryItem,
  type LocalHistoryItem,
  upsertLocalHistoryItem,
} from "../src/state/localHistory.ts";

function historyItem(
  overrides: Partial<LocalHistoryItem> = {},
): LocalHistoryItem {
  return {
    id: "history-1",
    kind: "capture",
    sourceUrl: "https://example.com/note",
    status: "saved",
    title: "Saved note",
    updatedAt: "2026-07-14T00:00:00.000Z",
    ...overrides,
  };
}

test("upsert preserves the saved file path when a later status omits it", () => {
  const result = upsertLocalHistoryItem(
    [historyItem({ filePath: "Bondie Docferry/Saved note.md" })],
    historyItem({
      id: "history-2",
      status: "shared",
      title: "Shared note",
      updatedAt: "2026-07-14T01:00:00.000Z",
    }),
  );

  assert.equal(result.length, 1);
  assert.equal(result[0].status, "shared");
  assert.equal(result[0].filePath, "Bondie Docferry/Saved note.md");
});

test("capture history removes sensitive paths and query strings", () => {
  const item = createLocalHistoryItem({
    remoteJobId: "bdf_parse_private",
    sourceUrl: "https://media.example/private/video?token=secret#part",
    status: "parsed",
    title: "Private source",
  });

  assert.equal(item.sourceUrl, "https://media.example/");
  assert.equal(item.remoteJobId, "bdf_parse_private");
});

test("normalization minimizes legacy capture URLs but keeps DocFerry share identity", () => {
  const normalized = normalizeLocalHistory([
    historyItem({ sourceUrl: "https://media.example/private/path?token=secret" }),
    historyItem({
      id: "history-share",
      sourceUrl: "https://docferry.bondie.io/s/public-slug?tracking=1",
    }),
  ]);

  assert.equal(normalized[0].sourceUrl, "https://media.example/");
  assert.equal(normalized[0].kind, "capture");
  assert.equal(normalized[1].sourceUrl, "https://docferry.bondie.io/s/public-slug");
  assert.equal(normalized[1].kind, "docferry-import");
});

test("remove deletes only the selected local history row", () => {
  const items = [historyItem(), historyItem({ id: "history-2" })];

  assert.deepEqual(removeLocalHistoryItem(items, "history-1"), [items[1]]);
});

test("upsert keeps separate cloud activities from the same host", () => {
  const first = historyItem({ remoteJobId: "bdf_parse_one", sourceUrl: "https://example.com/" });
  const second = historyItem({
    id: "history-2",
    remoteJobId: "bdf_parse_two",
    sourceUrl: "https://example.com/",
  });

  assert.equal(upsertLocalHistoryItem([first], second).length, 2);
});

test("upsert uses an explicitly supplied replacement file path", () => {
  const result = upsertLocalHistoryItem(
    [historyItem({ filePath: "Bondie Docferry/Old.md" })],
    historyItem({ filePath: "Bondie Docferry/New.md", status: "shared" }),
  );

  assert.equal(result[0].filePath, "Bondie Docferry/New.md");
});
