import assert from "node:assert/strict";
import test from "node:test";

import { getSharePageState } from "../src/shares/pagination.ts";

test("builds stable share pagination for first, middle, and final pages", () => {
  assert.deepEqual(getSharePageState(24, 0, 10), {
    hasNext: true,
    hasPrevious: false,
    nextOffset: 10,
    page: 1,
    pageCount: 3,
    previousOffset: 0,
  });
  assert.deepEqual(getSharePageState(24, 10, 10), {
    hasNext: true,
    hasPrevious: true,
    nextOffset: 20,
    page: 2,
    pageCount: 3,
    previousOffset: 0,
  });
  assert.deepEqual(getSharePageState(24, 20, 10), {
    hasNext: false,
    hasPrevious: true,
    nextOffset: 30,
    page: 3,
    pageCount: 3,
    previousOffset: 10,
  });
});

test("keeps empty share lists on a single stable page", () => {
  assert.deepEqual(getSharePageState(0, 0, 10), {
    hasNext: false,
    hasPrevious: false,
    nextOffset: 10,
    page: 1,
    pageCount: 1,
    previousOffset: 0,
  });
});
