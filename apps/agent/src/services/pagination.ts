export function toCursorPage<T extends { id: string }>(rows: T[], limit: number) {
  const hasNextPage = rows.length > limit;
  const items = hasNextPage ? rows.slice(0, limit) : rows;
  return {
    items,
    next_cursor: hasNextPage ? items.at(-1)?.id ?? null : null,
  };
}
