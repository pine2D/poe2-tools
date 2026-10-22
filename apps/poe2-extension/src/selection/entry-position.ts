interface Point {
  x: number
  y: number
}
interface Size {
  width: number
  height: number
}
interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

/** 在已有译文外选择最靠近选区的位置；空间不足时选择遮挡最少的位置。 */
export function entryPosition(
  preferred: Point,
  size: Size,
  viewport: Size,
  blocked: readonly Rect[],
): Point {
  const clampX = (x: number) => Math.max(12, Math.min(x, viewport.width - size.width - 12))
  const clampY = (y: number) => Math.max(12, Math.min(y, viewport.height - size.height - 12))
  const origin = { x: clampX(preferred.x), y: clampY(preferred.y) }
  const xs = new Set([origin.x, clampX(12), clampX(viewport.width)])
  const ys = new Set([origin.y, clampY(12), clampY(viewport.height)])
  for (const rect of blocked) {
    xs.add(clampX(rect.left - size.width - 8))
    xs.add(clampX(rect.right + 8))
    ys.add(clampY(rect.top - size.height - 8))
    ys.add(clampY(rect.bottom + 8))
  }
  let best = origin,
    bestOverlap = Number.POSITIVE_INFINITY,
    bestDistance = Number.POSITIVE_INFINITY
  for (const x of xs)
    for (const y of ys) {
      const overlap = blocked.reduce(
        (sum, rect) =>
          sum +
          Math.max(0, Math.min(x + size.width, rect.right) - Math.max(x, rect.left)) *
            Math.max(0, Math.min(y + size.height, rect.bottom) - Math.max(y, rect.top)),
        0,
      )
      const distance = (x - origin.x) ** 2 + (y - origin.y) ** 2
      if (overlap < bestOverlap || (overlap === bestOverlap && distance < bestDistance)) {
        best = { x, y }
        bestOverlap = overlap
        bestDistance = distance
      }
    }
  return best
}
