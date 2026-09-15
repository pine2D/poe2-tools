import { describe, expect, it } from 'vitest'
import { catalystChoices, estimateCatalystEffects } from './catalystEffects'
import {
  catalystActiveQualityLimit,
  catalystQualityLimit,
  catalystStoredQualityLimit,
  readCatalystQuality,
} from './catalystQuality'
import { catalog, dictionary } from './catalystTestFixture'
import { exportCraftItemText } from './craftItemText'
import { applyCraftStep } from './craftSteps'
import { evaluateCraftStrategy } from './craftStrategy'
import { evaluateDefinitionCraftStrategy } from './definitionStrategy'
import { projectTargetValues } from './effectiveTargetValues'
import { inspectItem } from './export'
import { parseItem } from './parse'
import { type CraftState, createCraftState } from './rehearsal'
import { importCraftState } from './rehearsalImport'

const must = <T>(r: { ok: true; value: T } | { ok: false; error: string }): T => {
  if (!r.ok) throw Error(r.error)
  return r.value
}
function initial(baseId = 'Gold Ring', quality = 40): CraftState {
  return {
    baseId,
    itemLevel: 86,
    rarity: 'rare',
    sourceText: null,
    nextAffixId: 4,
    catalyst: { id: 'Flesh', quality, declared: true },
    affixes: [
      { affixId: 'a1', modId: 'IncreasedLife1', lines: ['+19(10-19) to maximum Life'] },
      { affixId: 'a2', modId: 'EssenceBreach', crafted: true, lines: ['+20% to Maximum Quality'] },
      { affixId: 'a3', modId: 'FireResist1', lines: ['+9(6-10)% to Fire Resistance'] },
    ],
  }
}
function removed(state: CraftState) {
  return must(
    applyCraftStep(catalog, state, {
      currency: 'annulment',
      modIds: [],
      removeModId: 'EssenceBreach',
      removeAffixId: 'a2',
    }),
  )
}

describe('已保留的裂隙精华催化品质', () => {
  it.each([
    ['Gold Ring', 40, 20, 26],
    ['Jade Amulet', 40, 20, 26],
    ['Breach Ring', 60, 40, 30],
  ] as const)(
    '%s 分开已有量与施加上限，移除工艺后只允许原类型原量的高品质估算',
    (baseId, quality, regular, life) => {
      const state = must(createCraftState(catalog, initial(baseId, quality)))
      const base = catalog.bases.find((b) => b.id === baseId)
      if (!base) throw Error('fixture')
      expect(catalystQualityLimit(base)).toBe(regular)
      expect(catalystStoredQualityLimit(catalog, base)).toBe(quality)
      expect(catalystActiveQualityLimit(catalog, state)).toEqual({ ok: true, value: quality })
      const after = removed(state)
      expect(after.catalyst).toEqual({ id: 'Flesh', quality, declared: true })
      expect(after.affixes.map((a) => a.affixId)).toEqual(['a1', 'a3'])
      expect(after.nextAffixId).toBe(4)
      expect(catalystChoices(catalog, after)).toMatchObject({
        ok: true,
        value: { maxQuality: regular },
      })
      expect(catalystActiveQualityLimit(catalog, after)).toEqual({ ok: true, value: regular })
      expect(estimateCatalystEffects(catalog, after, 'Flesh', quality)).toMatchObject({
        ok: true,
        value: {
          quality,
          maxQuality: regular,
          groups: expect.arrayContaining([
            expect.objectContaining({
              id: 'IncreasedLife1',
              lines: [expect.objectContaining({ after: `+${life} to maximum Life` })],
            }),
          ]),
        },
      })
      expect(estimateCatalystEffects(catalog, after, 'Neural', quality).ok).toBe(false)
      expect(estimateCatalystEffects(catalog, after, 'Flesh', quality - 1).ok).toBe(false)
      expect(estimateCatalystEffects(catalog, after, 'Flesh', quality + 1).ok).toBe(false)
      expect(estimateCatalystEffects(catalog, after, 'Neural', regular).ok).toBe(true)
      expect(estimateCatalystEffects(catalog, state, 'Flesh', quality)).toMatchObject({
        ok: true,
        value: {
          groups: expect.arrayContaining([
            expect.objectContaining({
              id: 'EssenceBreach',
              lines: [
                expect.objectContaining({
                  before: '+20% to Maximum Quality',
                  status: 'unaffected',
                }),
              ],
            }),
          ]),
        },
      })
      expect(state.affixes).toHaveLength(3)
      expect(state.catalyst?.quality).toBe(quality)
    },
  )

  it('重选工艺仍保留品质，神圣与有效值投影继续使用实际量，催化崇高消费全部且不回填', () => {
    const state = must(createCraftState(catalog, initial('Breach Ring', 60)))
    const replaced = must(
      applyCraftStep(catalog, state, {
        currency: 'chaos',
        removeModId: 'EssenceBreach',
        removeAffixId: 'a2',
        modIds: ['IncreasedMana1'],
        rolls: [{ modId: 'IncreasedMana1', affixId: 'a4', values: [12] }],
      }),
    )
    expect(replaced.catalyst).toEqual(state.catalyst)
    const divine = must(
      applyCraftStep(catalog, removed(state), {
        currency: 'divine',
        modIds: [],
        rolls: [
          { modId: 'IncreasedLife1', affixId: 'a1', values: [18] },
          { modId: 'FireResist1', affixId: 'a3', values: [8] },
        ],
      }),
    )
    const projection = must(
      projectTargetValues(catalog, divine.catalyst, ['+(10-19) to maximum Life'], [['life']]),
    )
    expect(projection.read(divine.affixes[0]?.lines ?? [])).toEqual({
      ok: true,
      value: [{ min: 28, max: 28 }],
    })
    expect(projection.baseBounds([{ index: 0, min: 30 }])).toEqual({
      ok: true,
      value: [{ index: 0, min: 19, max: 19 }],
    })
    expect(
      evaluateCraftStrategy(
        catalog,
        divine,
        {
          maxSteps: 5,
          rules: [
            {
              conditions: [{ kind: 'quality', source: 'catalyst', catalystId: 'Flesh', min: 60 }],
              action: { kind: 'stop' },
            },
          ],
        },
        0,
      ),
    ).toMatchObject({ ok: true, value: { kind: 'stop' } })
    const spent = must(
      applyCraftStep(catalog, divine, {
        currency: 'exalted',
        omen: 'catalysing_exaltation',
        modIds: ['IncreasedMana1'],
        rolls: [{ modId: 'IncreasedMana1', affixId: 'a4', values: [12] }],
      }),
    )
    expect(spent.catalyst).toEqual({ id: 'Flesh', quality: 0, declared: true })
    const strategy = {
      maxSteps: 5,
      rules: [
        {
          conditions: [{ kind: 'targets-met' as const, value: true }],
          action: { kind: 'stop' as const },
        },
      ],
    }
    const goals = {
      definitions: {
        nextTargetId: 2,
        targets: [{ targetId: 't1', modId: 'IncreasedLife1' }],
        alternatives: [],
        values: [
          {
            targetId: 't1',
            modId: 'IncreasedLife1',
            basis: 'effective' as const,
            bounds: [{ index: 0, min: 28 }],
          },
        ],
      },
    }
    expect(evaluateDefinitionCraftStrategy(catalog, divine, strategy, 0, goals)).toMatchObject({
      ok: true,
      value: { kind: 'stop' },
    })
    expect(evaluateDefinitionCraftStrategy(catalog, spent, strategy, 1, goals)).toMatchObject({
      ok: true,
      value: { kind: 'unmatched' },
    })
    expect(
      applyCraftStep(catalog, spent, {
        currency: 'exalted',
        omen: 'catalysing_exaltation',
        modIds: ['ColdResist1'],
      }).ok,
    ).toBe(false)
    expect(divine.catalyst?.quality).toBe(60)
  })

  it.each([
    ['Gold Ring', 40],
    ['Breach Ring', 60],
  ] as const)('%s 的高级文本保留基础值、工艺与品质，移除后可完整导出回读', (baseId, quality) => {
    for (const state of [
      must(createCraftState(catalog, initial(baseId, quality))),
      removed(initial(baseId, quality)),
    ]) {
      const text = must(exportCraftItemText(catalog, state)).text
      const parsed = parseItem(text)
      if (!parsed.ok) throw Error(parsed.error)
      expect(readCatalystQuality(parsed.item)).toMatchObject({
        ok: true,
        value: { id: 'Flesh', quality },
      })
      const imported = must(
        importCraftState(catalog, baseId, parsed.item, inspectItem(parsed.item, dictionary)),
      )
      expect(imported.catalyst).toEqual({ id: 'Flesh', quality })
      expect(imported.affixes.map(({ modId, lines, crafted }) => [modId, lines, crafted])).toEqual(
        state.affixes.map(({ modId, lines, crafted }) => [modId, lines, crafted]),
      )
      expect(text).toContain('+19(10-19) to maximum Life')
      expect(text).toContain(`Quality (Life Modifiers): +${quality}%`)
    }
  })

  it('无可信来源、畸形精华或特殊基底不能提升资格；珠宝保持原上限', () => {
    const state = initial()
    const plain = { ...state, affixes: state.affixes.filter((a) => a.modId !== 'EssenceBreach') }
    for (const source of [
      { ...catalog, essences: [] },
      {
        ...catalog,
        _meta: {
          ...catalog._meta,
          sources: catalog._meta.sources.filter((s) => s.path !== 'src/Data/Essence.lua'),
        },
      },
      {
        ...catalog,
        modifiers: catalog.modifiers.map((m) =>
          m.id === 'EssenceBreach' ? { ...m, group: 'unknown' } : m,
        ),
      },
    ]) {
      expect(createCraftState(source, state).ok).toBe(false)
      expect(createCraftState(source, plain).ok).toBe(false)
      expect(
        createCraftState(source, { ...plain, catalyst: { id: 'Flesh', quality: 20 } }).ok,
      ).toBe(true)
    }
    for (const quality of [-1, 40.5, 41, 60, 61, NaN])
      expect(createCraftState(catalog, { ...plain, catalyst: { id: 'Flesh', quality } }).ok).toBe(
        false,
      )
    for (const baseId of ['Ruby', 'Diamond', 'Iron Hat'])
      expect(createCraftState(catalog, { ...plain, baseId, affixes: [] }).ok).toBe(false)
    const base = catalog.bases.find((entry) => entry.id === 'Gold Ring')
    if (!base) throw Error('fixture')
    for (const patch of [
      { hidden: true },
      { runeforged: true },
      { variantList: ['Unknown'] },
      { implicit: '+40% to Maximum Quality' },
    ])
      expect(catalystStoredQualityLimit(catalog, { ...base, ...patch })).toBeNull()
    const malformed = {
      ...state,
      affixes: state.affixes.map((a) =>
        a.modId === 'EssenceBreach' ? { ...a, lines: ['+21% to Maximum Quality'] } : a,
      ),
    }
    expect(catalystActiveQualityLimit(catalog, malformed).ok).toBe(false)
    expect(
      createCraftState(catalog, { ...state, rarity: 'unique' } as unknown as CraftState).ok,
    ).toBe(false)
    const bad = parseItem(
      'Item Class: Rings\nRarity: Rare\nBad\nBreach Ring\n--------\nQuality (Life Modifiers): +61%\n--------\nItem Level: 86',
    )
    if (!bad.ok) throw Error(bad.error)
    expect(readCatalystQuality(bad.item).ok).toBe(false)
  })
})
