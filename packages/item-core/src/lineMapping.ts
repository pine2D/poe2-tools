/** 完整二分匹配；移除每条已选边再求匹配，检测歧义而不依赖原文顺序。 */
export function uniqueMapping(
  edges: number[][],
  uniqueRows?: ReadonlySet<number>,
): number[] | null {
  const match = (forbiddenRow = -1, forbiddenColumn = -1): number[] | null => {
    const columns = new Map<number, number>()
    const visit = (row: number, seen: Set<number>): boolean => {
      for (const column of edges[row] ?? []) {
        if ((row === forbiddenRow && column === forbiddenColumn) || seen.has(column)) continue
        seen.add(column)
        const previous = columns.get(column)
        if (previous === undefined || visit(previous, seen)) {
          columns.set(column, row)
          return true
        }
      }
      return false
    }
    for (let row = 0; row < edges.length; row++) if (!visit(row, new Set())) return null
    const result: number[] = []
    for (const [column, row] of columns) result[row] = column
    return result
  }
  const first = match()
  return first?.every(
    (column, row) =>
      (uniqueRows !== undefined && !uniqueRows.has(row)) || match(row, column) === null,
  )
    ? first
    : null
}
