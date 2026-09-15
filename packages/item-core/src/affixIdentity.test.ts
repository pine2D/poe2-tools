import { describe, expect, it } from 'vitest'
import * as core from './index'
import type { CraftState } from './rehearsal'

function state(): CraftState {
  return {
    baseId: 'test',
    itemLevel: 70,
    rarity: 'rare',
    sourceText: null,
    nextAffixId: 4,
    affixes: [
      { modId: 'resistance', affixId: 'a1', lines: ['+10% resistance'], fractured: true },
      { modId: 'resistance', affixId: 'a3', lines: ['+20% resistance'] },
    ],
  }
}

describe('词缀实例选择', () => {
  it('无 ID 在完整列表检查歧义，不能因另一条已锁定而取唯一可移除条目', () => {
    expect(core.resolveCraftAffix).toBeTypeOf('function')
    expect(core.resolveCraftAffix(state(), { modId: 'resistance' }).ok).toBe(false)
  })

  it('有 ID 只定位该实例并核对类型，缺失或不一致不回退', () => {
    expect(core.resolveCraftAffix).toBeTypeOf('function')
    const input = state()
    expect(core.resolveCraftAffix(input, { modId: 'resistance', affixId: 'a3' })).toEqual({
      ok: true,
      value: { index: 1, affix: input.affixes[1] },
    })
    for (const selector of [
      { modId: 'resistance', affixId: 'a2' },
      { modId: 'other', affixId: 'a1' },
      { modId: 'resistance', affixId: undefined },
      { modId: 'resistance', affixId: 'a01' },
    ])
      expect(core.resolveCraftAffix(input, selector as core.CraftAffixSelector).ok).toBe(false)
  })

  it('唯一旧 selector 对两种模式可用，指定 ID 不能匹配旧实例', () => {
    expect(core.resolveCraftAffix).toBeTypeOf('function')
    const input = state()
    input.affixes.splice(0, 1)
    expect(core.resolveCraftAffix(input, { modId: 'resistance' })).toMatchObject({
      ok: true,
      value: { index: 0, affix: { affixId: 'a3' } },
    })
    const legacy: CraftState = { ...input, affixes: [{ modId: 'resistance', lines: [] }] }
    delete legacy.nextAffixId
    expect(core.resolveCraftAffix(legacy, { modId: 'resistance' }).ok).toBe(true)
    expect(core.resolveCraftAffix(legacy, { modId: 'resistance', affixId: 'a3' }).ok).toBe(false)
  })
})
