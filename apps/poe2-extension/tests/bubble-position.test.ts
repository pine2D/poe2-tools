import { describe, expect, it } from 'vitest'
import { entryPosition } from '../src/selection/entry-position'

describe('划词入口避让已有译文', () => {
  it('窄屏选区靠近已置顶结果时，把新入口放在结果外且留在视口内', () => {
    const result = entryPosition(
      { x: 12, y: 240 },
      { width: 240, height: 68 },
      { width: 360, height: 720 },
      [{ left: 12, top: 220, right: 348, bottom: 560 }],
    )
    expect(result.x).toBeGreaterThanOrEqual(12)
    expect(result.x + 240).toBeLessThanOrEqual(348)
    expect(result.y + 68 <= 212 || result.y >= 568).toBe(true)
  })
  it('无冲突时保留选区旁的位置', () => {
    expect(
      entryPosition({ x: 20, y: 220 }, { width: 240, height: 68 }, { width: 900, height: 720 }, [
        { left: 500, top: 200, right: 880, bottom: 650 },
      ]),
    ).toEqual({ x: 20, y: 220 })
  })
  it('结果覆盖整个可用视口时仍返回可见位置，不产生溢出', () => {
    const result = entryPosition(
      { x: 1000, y: 900 },
      { width: 240, height: 68 },
      { width: 360, height: 720 },
      [{ left: 0, top: 0, right: 360, bottom: 720 }],
    )
    expect(result.x).toBeGreaterThanOrEqual(12)
    expect(result.x + 240).toBeLessThanOrEqual(348)
    expect(result.y).toBeGreaterThanOrEqual(12)
    expect(result.y + 68).toBeLessThanOrEqual(708)
  })
})
