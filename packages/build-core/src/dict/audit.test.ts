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

  it('order 下标越界、为负、非整数 → 各记 problem', () => {
    const cases: Array<readonly number[]> = [
      [2, 0],
      [-1, 0],
      [0.5, 1],
    ]
    for (const order of cases) {
      const bundle: DictBundle = {
        locale: 'zh-CN',
        stats: {
          _meta: meta(1),
          entries: [
            {
              id: 'bad.order',
              en: 'Recover #% of Life over # seconds',
              text: '在 # 秒内回复 #% 生命',
              order,
            },
          ],
        },
      }
      const problems = auditDictBundle(bundle)
      expect(problems).toHaveLength(1)
      expect(problems[0]).toMatchObject({ table: 'stats', key: 'bad.order' })
    }
  })

  it('order 长度必须同时等于 en 与 text 的 # 数', () => {
    const bundle: DictBundle = {
      locale: 'zh-CN',
      stats: {
        _meta: meta(1),
        // en 2 个 #，text 1 个 #，order 长度 1：与 text 相符但与 en 不符 → 运行期恒 fail-closed，审计必须报
        entries: [{ id: 'short.order', en: 'Adds # to # Damage', text: '附加 # 伤害', order: [0] }],
      },
    }
    expect(auditDictBundle(bundle)).toHaveLength(1)
  })

  it('合法的 order 不报 problem', () => {
    const bundle: DictBundle = {
      locale: 'zh-CN',
      stats: {
        _meta: meta(1),
        entries: [
          {
            id: 'ok.order',
            en: 'Recover #% of Life over # seconds',
            text: '在 # 秒内回复 #% 生命',
            order: [1, 0],
          },
        ],
      },
    }
    expect(auditDictBundle(bundle)).toEqual([])
  })

  it('order 下标重复 → 记 problem', () => {
    const bundle: DictBundle = {
      locale: 'zh-CN',
      stats: {
        _meta: meta(1),
        // 长度与范围都合法，只有重复不合法
        entries: [
          {
            id: 'dup.order',
            en: 'Recover #% of Life over # seconds',
            text: '在 # 秒内回复 #% 生命',
            order: [0, 0],
          },
        ],
      },
    }
    expect(auditDictBundle(bundle)).toHaveLength(1)
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
      classes: { _meta: meta(1), entries: { EmptyClass: '' } },
    }
    const problems = auditDictBundle(bundle)
    expect(problems.map((p) => p.table).sort()).toEqual(
      ['ascendancies', 'classes', 'gems', 'inventories', 'items.bases', 'passives'].sort(),
    )
  })
})
