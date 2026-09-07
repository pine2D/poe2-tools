import { describe, expect, it } from 'vitest'
import { miniBundle } from '../testing/miniDict'
import { auditDictBundle } from './audit'
import type { DictBundle } from './types'

const meta = (count: number) => ({
  source: 'test',
  tier: 'manual' as const,
  gameVersion: '0.0.0',
  fetchedAt: '2026-09-07',
  count,
})

describe('auditDictBundle', () => {
  it('干净的微型词典没有问题', () => {
    expect(auditDictBundle(miniBundle)).toEqual([])
  })

  it('en 与 text 的 # 个数不一致且无 order → 记 problem', () => {
    const bundle: DictBundle = {
      locale: 'zh-CN',
      stats: {
        _meta: meta(1),
        entries: [{ id: 'bad.count', en: 'Adds # to # Physical Damage', text: '附加 # 物理伤害' }],
      },
    }
    const problems = auditDictBundle(bundle)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatchObject({ table: 'stats', key: 'bad.count' })
  })

  it('order 声明与占位符个数或下标不匹配 → 记 problem', () => {
    const bundle: DictBundle = {
      locale: 'zh-CN',
      stats: {
        _meta: meta(1),
        entries: [
          {
            id: 'bad.order',
            en: 'Recover #% of Life over # seconds',
            text: '在 # 秒内回复 #% 生命',
            // 下标 2 越界（en 只有 2 个 #）
            order: [2, 0],
          },
        ],
      },
    }
    const problems = auditDictBundle(bundle)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatchObject({ table: 'stats', key: 'bad.order' })
  })

  it('templateKey(en) 冲突：第二条起每条各记一条 problem', () => {
    const bundle: DictBundle = {
      locale: 'zh-CN',
      stats: {
        _meta: meta(3),
        entries: [
          { id: 'first.stat', en: '+# to maximum Life', text: '+# 最大生命' },
          { id: 'dup.stat', en: '+# to maximum Life', text: '+# 生命上限' },
          { id: 'third.stat', en: '-# to maximum Life', text: '-# 生命上限' },
        ],
      },
    }
    const problems = auditDictBundle(bundle)
    // 第 3 条 en 的前导符号不同但 templateKey 去掉符号后仍与第 1 条相同，一并冲突
    expect(problems).toHaveLength(2)
    expect(problems[0]).toMatchObject({ table: 'stats', problem: '与 first.stat 键冲突' })
    expect(problems[1]).toMatchObject({ table: 'stats', problem: '与 first.stat 键冲突' })
  })

  it('items/gems/passives/ascendancies/inventories：text 为空串 → 记 problem', () => {
    const bundle: DictBundle = {
      locale: 'zh-CN',
      items: { _meta: meta(1), bases: { 'Empty Base': '' }, uniques: {} },
      gems: { _meta: meta(1), entries: { EmptyGem: { en: 'Empty', text: '' } } },
      passives: { _meta: meta(1), entries: { EmptyPassive: { en: 'Empty', text: '' } } },
      ascendancies: { _meta: meta(1), entries: { EmptyAsc: '' } },
      inventories: { _meta: meta(1), entries: { EmptyInv: '' } },
    }
    const problems = auditDictBundle(bundle)
    expect(problems.map((p) => p.table).sort()).toEqual(
      ['ascendancies', 'gems', 'inventories', 'items.bases', 'passives'].sort(),
    )
  })
})
