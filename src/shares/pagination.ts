export interface SharePageState {
  hasNext: boolean;
  hasPrevious: boolean;
  nextOffset: number;
  page: number;
  pageCount: number;
  previousOffset: number;
}

export function getSharePageState(total: number, offset: number, limit: number): SharePageState {
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new Error("Share page size must be positive.");
  }
  const safeTotal = Number.isSafeInteger(total) && total > 0 ? total : 0;
  const safeOffset = Number.isSafeInteger(offset) && offset > 0 ? offset : 0;
  const pageCount = Math.max(1, Math.ceil(safeTotal / limit));
  const page = Math.min(pageCount, Math.floor(safeOffset / limit) + 1);
  return {
    hasNext: safeOffset + limit < safeTotal,
    hasPrevious: safeOffset > 0,
    nextOffset: safeOffset + limit,
    page,
    pageCount,
    previousOffset: Math.max(0, safeOffset - limit),
  };
}
