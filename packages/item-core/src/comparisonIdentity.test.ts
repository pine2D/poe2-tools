import { describe, expect, it } from 'vitest'
import { enableCraftAffixIdentity } from './affixIdentity'
import { required } from './beltTestFixture'
import { boneCatalog, boneState } from './boneTestFixture'
import { compareCraftStates } from './comparison'
import { type CraftResult, type CraftState, createCraftState } from './rehearsal'

const must = <T>(result: CraftResult<T>): T => {
  if (!result.ok) throw new Error(result.error)
  return result.value
}

describe('词缀实例对照', () => {
  it('同一实例换类型只产生一项变化，保留两侧类型和文本且不推测跨类型数值差', () => {
    const catalog = boneCatalog()
    required(catalog.modifiers.find((mod) => mod.id === 'prefix2')).lines = ['prefix1 (1-10)']
    const before = must(enableCraftAffixIdentity(catalog, boneState(['prefix1', 'suffix1'])))
    const after = must(
      createCraftState(catalog, {
        ...before,
        affixes: [
          required(before.affixes[1]),
          { modId: 'prefix2', affixId: 'a1', lines: ['prefix1 8'] },
        ],
      }),
    )
    const snapshot = structuredClone({ before, after })
    const result = must(compareCraftStates(catalog, before, after))
    expect(result).toEqual({
      rarity: null,
      implicit: null,
      affixes: [
        {
          affixId: 'a1',
          modId: 'prefix2',
          beforeModId: 'prefix1',
          afterModId: 'prefix2',
          kind: 'changed',
          beforeLines: ['prefix1 5'],
          afterLines: ['prefix1 8'],
          numeric: [],
        },
      ],
    })
    expect(result.affixes[0]?.beforeLines).not.toBe(before.affixes[0]?.lines)
    expect(result.affixes[0]?.afterLines).not.toBe(after.affixes[1]?.lines)
    expect({ before, after }).toEqual(snapshot)
    expect(must(compareCraftStates(catalog, after, before)).affixes).toEqual([
      {
        affixId: 'a1',
        modId: 'prefix1',
        beforeModId: 'prefix2',
        afterModId: 'prefix1',
        kind: 'changed',
        beforeLines: ['prefix1 8'],
        afterLines: ['prefix1 5'],
        numeric: [],
      },
    ])
  })

  it('同类型由新实例替换时记录移除与新增，即使数值完全相同', () => {
    const catalog = boneCatalog()
    const before = must(enableCraftAffixIdentity(catalog, boneState(['prefix1'])))
    const after: CraftState = {
      ...before,
      nextAffixId: 10,
      affixes: [{ modId: 'prefix1', affixId: 'a9', lines: ['prefix1 5'] }],
    }
    expect(compareCraftStates(catalog, before, after)).toEqual({
      ok: true,
      value: {
        rarity: null,
        implicit: null,
        affixes: [
          {
            affixId: 'a1',
            modId: 'prefix1',
            beforeModId: 'prefix1',
            afterModId: null,
            kind: 'removed',
            beforeLines: ['prefix1 5'],
            afterLines: null,
            numeric: [],
          },
          {
            affixId: 'a9',
            modId: 'prefix1',
            beforeModId: null,
            afterModId: 'prefix1',
            kind: 'added',
            beforeLines: null,
            afterLines: ['prefix1 5'],
            numeric: [],
          },
        ],
      },
    })
  })

  it.each(['crafted', 'fractured', 'desecrated'] as const)(
    '同实例同类型沿用数值与 %s 变化，单纯顺序或游标改变没有属性变化',
    (marker) => {
      const catalog = boneCatalog()
      const before = must(enableCraftAffixIdentity(catalog, boneState(['prefix1', 'suffix1'])))
      const after: CraftState = {
        ...before,
        nextAffixId: 20,
        affixes: [
          required(before.affixes[1]),
          { ...required(before.affixes[0]), lines: ['prefix1 8'], [marker]: true },
        ],
      }
      expect(must(compareCraftStates(catalog, before, after)).affixes).toEqual([
        {
          affixId: 'a1',
          modId: 'prefix1',
          beforeModId: 'prefix1',
          afterModId: 'prefix1',
          kind: 'changed',
          beforeLines: ['prefix1 5'],
          afterLines: ['prefix1 8'],
          numeric: [{ index: 0, before: 5, after: 8 }],
          [marker]: { before: false, after: true },
        },
      ])
      expect(
        must(
          compareCraftStates(catalog, before, {
            ...before,
            nextAffixId: 20,
            affixes: [...before.affixes].reverse(),
          }),
        ),
      ).toEqual({ rarity: null, affixes: [], implicit: null })
    },
  )

  it('拒绝新旧身份模式交叉比较，包括空装备与摧毁快照', () => {
    const catalog = boneCatalog()
    for (const legacy of [boneState(), boneState(['prefix1'])]) {
      const identified = must(enableCraftAffixIdentity(catalog, legacy))
      expect(compareCraftStates(catalog, legacy, identified)).toMatchObject({ ok: false })
      expect(compareCraftStates(catalog, identified, legacy)).toMatchObject({ ok: false })
      expect(compareCraftStates(catalog, legacy, { ...identified, destroyed: true })).toMatchObject(
        { ok: false },
      )
    }
  })
})
