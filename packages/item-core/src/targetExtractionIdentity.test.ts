import { describe, expect, it } from 'vitest'
import { enableCraftAffixIdentity } from './affixIdentity'
import { boneCatalog, boneState } from './boneTestFixture'
import { applyCraftStep } from './craftSteps'
import { extractCraftTargets } from './targetExtraction'

const catalog = boneCatalog()
function current() {
  const result = enableCraftAffixIdentity(catalog, boneState(['prefix1', 'suffix1']))
  if (!result.ok) throw Error(result.error)
  return result.value
}
describe('目标提取按词缀实例定位', () => {
  it('完整选择器提取对应数值和破裂条件，输出不绑定来源实例', () => {
    const state = current()
    state.affixes = state.affixes.map((affix, index) =>
      index === 1 ? { ...affix, fractured: true, lines: ['suffix1 8'] } : affix,
    )
    const before = structuredClone(state)
    expect(
      extractCraftTargets(catalog, state, [{ modId: 'suffix1', affixId: 'a2' }], true, true),
    ).toEqual({
      ok: true,
      value: {
        targetModIds: ['suffix1'],
        targetValues: [{ modId: 'suffix1', bounds: [{ index: 0, min: 8, max: 8 }] }],
        targetFracturedModId: 'suffix1',
      },
    })
    expect(state).toEqual(before)
  })
  it('同类型重获后拒绝旧实例，不能回退到类型查找', () => {
    const state = current()
    const replaced = applyCraftStep(catalog, state, {
      currency: 'chaos',
      removeModId: 'prefix1',
      removeAffixId: 'a1',
      modIds: ['prefix1'],
      rolls: [{ modId: 'prefix1', affixId: 'a3', values: [8] }],
    })
    if (!replaced.ok) throw Error(replaced.error)
    expect(
      extractCraftTargets(
        catalog,
        replaced.value,
        [{ modId: 'prefix1', affixId: 'a1' }],
        false,
        false,
      ).ok,
    ).toBe(false)
    expect(
      extractCraftTargets(
        catalog,
        replaced.value,
        [{ modId: 'prefix1', affixId: 'a3' }],
        true,
        false,
      ),
    ).toMatchObject({
      ok: true,
      value: { targetValues: [{ modId: 'prefix1', bounds: [{ index: 0, min: 8, max: 8 }] }] },
    })
  })
  it('类型断言、未知身份与选择器结构严格核对，重复选择仍拒绝', () => {
    for (const selectors of [
      [{ modId: 'suffix1', affixId: 'a1' }],
      [{ modId: 'prefix1', affixId: 'a9' }],
      [{ modId: 'prefix1', affixId: undefined }],
      [{ modId: 'prefix1', extra: true }],
      [null],
      ['prefix1', { modId: 'prefix1', affixId: 'a1' }],
    ])
      expect(extractCraftTargets(catalog, current(), selectors as never, false, false).ok).toBe(
        false,
      )
  })
  it('旧类型选择和无身份选择器保持原输出，不能给旧状态伪造身份', () => {
    const legacy = boneState(['prefix1'])
    const expected = extractCraftTargets(catalog, legacy, ['prefix1'], true, false)
    expect(extractCraftTargets(catalog, legacy, [{ modId: 'prefix1' }], true, false)).toEqual(
      expected,
    )
    expect(extractCraftTargets(catalog, current(), ['prefix1'], true, false)).toEqual(expected)
    expect(
      extractCraftTargets(catalog, legacy, [{ modId: 'prefix1', affixId: 'a1' }], true, false).ok,
    ).toBe(false)
  })
})
