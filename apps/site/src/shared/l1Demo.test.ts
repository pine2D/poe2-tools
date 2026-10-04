// @vitest-environment node
// 搜索候选示意的示例名称（首页对照带右段与扩展介绍页共用）必须能在正式 zh-CN 词典里查到，
// 演示的“中文 → 英文”与扩展实际给出的候选一致（写法仿照 features/build-l10n/example.test.ts）
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { L1_DEMO_CANDIDATES, L1_DEMO_LABEL, L1_DEMO_QUERY } from './l1Demo'

const items = JSON.parse(
  readFileSync(new URL('../../../../data/dict/zh-CN/items.json', import.meta.url), 'utf8'),
) as { bases: Record<string, string> }

// 扩展对原站界面的手工译文（data/l10n/coe-beta/ui.zh-CN.json，扩展构建时随包）
const ui = JSON.parse(
  readFileSync(new URL('../../../../data/l10n/coe-beta/ui.zh-CN.json', import.meta.url), 'utf8'),
) as { entries: Record<string, string> }

describe('L1_DEMO_CANDIDATES', () => {
  it('每个候选的英文基底名在 items.json 的 bases 里，且译名与词典逐字一致', () => {
    expect(L1_DEMO_CANDIDATES.length).toBeGreaterThan(0)
    for (const [zh, en] of L1_DEMO_CANDIDATES) expect(items.bases[en], en).toBe(zh)
  })

  it('每个候选的中文名都包含示例输入“水晶”，第一项是选中项“水晶法器 → Crystal Focus”', () => {
    for (const [zh] of L1_DEMO_CANDIDATES) expect(zh).toContain(L1_DEMO_QUERY)
    expect(L1_DEMO_CANDIDATES[0]).toEqual(['水晶法器', 'Crystal Focus'])
  })
})

describe('L1_DEMO_LABEL', () => {
  it('是扩展生效时原站搜索框标签 “Search for a craftable item” 的译名，与 ui.zh-CN.json 逐字一致', () => {
    expect(L1_DEMO_LABEL).toBe('搜索可制作的物品')
    expect(ui.entries['Search for a craftable item']).toBe(L1_DEMO_LABEL)
  })
})
