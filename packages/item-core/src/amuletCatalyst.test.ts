import { expect, it } from 'vitest'
import { required } from './beltTestFixture'
import { catalystChoices, estimateCatalystEffects } from './catalystEffects'
import {
  catalystActiveQualityLimit,
  catalystQualityLimit,
  catalystStoredQualityLimit,
} from './catalystQuality'
import { catalog, dictionary } from './catalystTestFixture'
import { exportCraftItemText } from './craftItemText'
import { applyCraftStep } from './craftSteps'
import { evaluateDefinitionCraftStrategy } from './definitionStrategy'
import { inspectItem } from './export'
import { parseItem } from './parse'
import { type CraftResult, type CraftState, createCraftState } from './rehearsal'
import { importCraftState } from './rehearsalImport'
import { buildInitialSkillVariantLines } from './skillVariantAmulets'

function must<T>(value: CraftResult<T>): T {
  if (!value.ok) throw Error(value.error)
  return value.value
}
function initial(name: string, breach = false): CraftState {
  const base = required(catalog.bases.find((b) => b.id === `${name} Amulet`))
  return {
    baseId: base.id,
    itemLevel: 86,
    rarity: 'rare',
    sourceText: null,
    nextAffixId: 4,
    implicitLines: must(buildInitialSkillVariantLines(base, 2, 10)).reverse(),
    catalyst: { id: 'Flesh', quality: 50, declared: true },
    affixes: [
      { affixId: 'a1', modId: 'IncreasedLife1', lines: ['+19(10-19) to maximum Life'] },
      ...(breach
        ? [
            {
              affixId: 'a2',
              modId: 'EssenceBreach',
              crafted: true as const,
              lines: ['+20% to Maximum Quality'],
            },
          ]
        : []),
      { affixId: 'a3', modId: 'FireResist1', lines: ['+9(6-10)% to Fire Resistance'] },
    ],
  }
}
it.each(['Lament', 'Portent', 'Absent'])('%s 已有50与当前20/40分离，全部固有行不缩放', (name) => {
  const state = must(createCraftState(catalog, initial(name)))
  const base = required(catalog.bases.find((b) => b.id === state.baseId))
  expect(catalystQualityLimit(base)).toBe(20)
  expect(catalystStoredQualityLimit(catalog, base)).toBe(50)
  expect(must(catalystActiveQualityLimit(catalog, state))).toBe(20)
  expect(must(catalystActiveQualityLimit(catalog, initial(name, true)))).toBe(40)
  const estimate = must(estimateCatalystEffects(catalog, state, 'Flesh', 50))
  expect(estimate.groups.filter((group) => group.kind === 'implicit')).toEqual(
    required(state.implicitLines).map((line, index) => ({
      id: `implicit:${index}`,
      kind: 'implicit',
      matched: false,
      lines: [{ before: line, after: null, status: 'unaffected', reason: expect.any(String) }],
    })),
  )
  expect(estimate.groups.find((g) => g.id === 'IncreasedLife1')?.lines[0]?.after).toBe(
    '+28 to maximum Life',
  )
  expect(estimateCatalystEffects(catalog, state, 'Neural', 50).ok).toBe(false)
  expect(estimateCatalystEffects(catalog, state, 'Flesh', 49).ok).toBe(false)
  expect(must(catalystChoices(catalog, state)).maxQuality).toBe(20)
})
it('缺Breach来源只允许已有30，伪造变体与来源仍拒绝', () => {
  const state = initial('Absent')
  const plain = { ...catalog, essences: [] }
  const base = required(catalog.bases.find((b) => b.id === state.baseId))
  expect(catalystStoredQualityLimit(plain, base)).toBe(30)
  expect(createCraftState(plain, state).ok).toBe(false)
  expect(createCraftState(plain, { ...state, catalyst: { id: 'Flesh', quality: 30 } }).ok).toBe(
    true,
  )
  for (const patch of [
    { hidden: true },
    { runeforged: true },
    { id: 'Unknown' },
    { sourceQuality: 1 },
    { variantList: ['Fake'] },
  ])
    expect(catalystQualityLimit({ ...base, ...patch })).toBeNull()
  for (const implicitLines of [
    [],
    required(state.implicitLines).slice(1),
    [...required(state.implicitLines), required(state.implicitLines)[0] as string],
  ])
    expect(createCraftState(catalog, { ...state, implicitLines }).ok).toBe(false)
  expect(createCraftState(catalog, { ...state, catalyst: { id: 'Flesh', quality: 51 } }).ok).toBe(
    false,
  )
})
it('移除Breach保留50与技能等级/孔，合法混沌与催化消费贯通有效目标', () => {
  const state = must(
    createCraftState(catalog, {
      ...initial('Absent', true),
      declaredSkillLevel: 13,
      grantedSkillLevel: 20,
      declaredSkillSockets: 2,
      grantedSkillSockets: 3,
    }),
  )
  const removed = must(
    applyCraftStep(catalog, state, {
      currency: 'annulment',
      modIds: [],
      removeModId: 'EssenceBreach',
      removeAffixId: 'a2',
    }),
  )
  expect(removed.catalyst).toEqual(state.catalyst)
  expect(must(catalystActiveQualityLimit(catalog, removed))).toBe(20)
  expect(applyCraftStep(catalog, removed, { currency: 'divine', modIds: [] }).ok).toBe(false)
  const rerolled = must(
    applyCraftStep(catalog, removed, {
      currency: 'chaos',
      removeModId: 'FireResist1',
      removeAffixId: 'a3',
      modIds: ['ColdResist1'],
      rolls: [{ modId: 'ColdResist1', affixId: 'a4', values: [8] }],
    }),
  )
  const strategy = {
    maxSteps: 5,
    rules: [
      {
        conditions: [{ kind: 'targets-met' as const, value: true }],
        action: { kind: 'stop' as const },
      },
    ],
  }
  const context = {
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
  expect(evaluateDefinitionCraftStrategy(catalog, rerolled, strategy, 0, context)).toMatchObject({
    ok: true,
    value: { kind: 'stop' },
  })
  const spent = must(
    applyCraftStep(catalog, rerolled, {
      currency: 'exalted',
      omen: 'catalysing_exaltation',
      modIds: ['IncreasedMana1'],
      rolls: [{ modId: 'IncreasedMana1', affixId: 'a5', values: [12] }],
    }),
  )
  expect(spent.catalyst).toEqual({ id: 'Flesh', quality: 0, declared: true })
  expect(spent).toMatchObject({
    declaredSkillLevel: 13,
    grantedSkillLevel: 20,
    declaredSkillSockets: 2,
    grantedSkillSockets: 3,
    implicitLines: state.implicitLines,
  })
  expect(evaluateDefinitionCraftStrategy(catalog, spent, strategy, 1, context)).toMatchObject({
    ok: true,
    value: { kind: 'unmatched' },
  })
  expect(exportCraftItemText(catalog, spent).ok).toBe(false)
})
it.each(['Lament', 'Portent', 'Absent'])(
  '%s 高级文本保留品质与技能尾注，回读基础值只缩放一次',
  (name) => {
    const initialState = initial(name)
    const state = {
      ...initialState,
      implicitLines: required(initialState.implicitLines).map((line) =>
        line.startsWith('Grants Skill:') ? `${line} (Max Level 13)` : line,
      ),
    }
    const text = must(exportCraftItemText(catalog, state)).text
    const parsed = parseItem(text)
    if (!parsed.ok) throw Error(parsed.error)
    const imported = must(
      importCraftState(catalog, state.baseId, parsed.item, inspectItem(parsed.item, dictionary)),
    )
    expect(imported.catalyst).toEqual({ id: 'Flesh', quality: 50 })
    expect(imported.implicitLines).toEqual(expect.arrayContaining(required(state.implicitLines)))
    expect(imported.affixes[0]?.lines).toEqual(['+19(10-19) to maximum Life'])
    expect(
      must(estimateCatalystEffects(catalog, imported, 'Flesh', 50)).groups.find(
        (g) => g.id === 'IncreasedLife1',
      )?.lines[0]?.after,
    ).toBe('+28 to maximum Life')
  },
)
it.each(['en', 'zh-CN', 'zh-TW'] as const)(
  '%s 高级催化原文未知描述符须确认，增效头与基础范围核验',
  (locale) => {
    const cn = locale === 'zh-CN'
    const tw = locale === 'zh-TW'
    const translated = cn || tw
    const state = initial('Absent')
    const text = [
      translated ? (tw ? '物品種類: 項鍊' : '物品类别: 项链') : 'Item Class: Amulets',
      translated ? '稀有度: 稀有' : 'Rarity: Rare',
      'Synthetic',
      'Absent Amulet',
      '--------',
      translated
        ? tw
          ? '品質（待核對類型）: +50%'
          : '品质（待核对类型）: +50%'
        : 'Quality (Life Modifiers): +50%',
      '--------',
      translated ? (tw ? '物品等級: 86' : '物品等级: 86') : 'Item Level: 86',
      '--------',
      'Grants Skill: Level 10 Cast on Critical (Max Level 13)',
      '--------',
      '{ Implicit Modifier }',
      '-1 Suffix Modifier allowed',
      '-1 Prefix Modifier allowed',
      '--------',
      '{ Prefix Modifier "Hale" — Life — 50% Increased }',
      '+19(10-19) to maximum Life',
    ].join('\n')
    function read(raw: string, id?: string) {
      const parsed = parseItem(raw)
      if (!parsed.ok) throw Error(parsed.error)
      return importCraftState(
        catalog,
        state.baseId,
        parsed.item,
        inspectItem(parsed.item, dictionary),
        undefined,
        undefined,
        dictionary.stats?.entries,
        id,
      )
    }
    if (translated)
      expect(read(text)).toMatchObject({ ok: false, error: expect.stringContaining('类型') })
    const imported = must(read(text, translated ? 'Flesh' : undefined))
    expect(imported.catalyst).toMatchObject({ id: 'Flesh', quality: 50 })
    expect(imported.implicitLines).toContain(
      'Grants Skill: Level 10 Cast on Critical (Max Level 13)',
    )
    expect(
      must(estimateCatalystEffects(catalog, imported, 'Flesh', 50)).groups.find(
        (g) => g.id === 'IncreasedLife1',
      )?.lines[0]?.after,
    ).toBe('+28 to maximum Life')
    expect(
      read(text.replace('50% Increased', '40% Increased'), translated ? 'Flesh' : undefined).ok,
    ).toBe(false)
    expect(read(text.replace('+19(10-19)', '+28'), translated ? 'Flesh' : undefined).ok).toBe(false)
    expect(
      read(
        text.replace('{ Implicit Modifier }', '{ Implicit Modifier — 50% Increased }'),
        translated ? 'Flesh' : undefined,
      ).ok,
    ).toBe(false)
  },
)
it('裸基础掷值导出必须补全高级范围与50%增效头，才能回读而不叠乘', () => {
  const state = initial('Absent')
  state.affixes[0] = { affixId: 'a1', modId: 'IncreasedLife1', lines: ['+19 to maximum Life'] }
  state.affixes[1] = { affixId: 'a3', modId: 'FireResist1', lines: ['+9% to Fire Resistance'] }
  const output = must(exportCraftItemText(catalog, state)).text
  expect(output).toContain('+19(10-19) to maximum Life')
  expect(output).toContain('50% Increased')
  const parsed = parseItem(output)
  if (!parsed.ok) throw Error(parsed.error)
  const imported = must(
    importCraftState(catalog, state.baseId, parsed.item, inspectItem(parsed.item, dictionary)),
  )
  expect(
    must(estimateCatalystEffects(catalog, imported, 'Flesh', 50)).groups.find(
      (g) => g.id === 'IncreasedLife1',
    )?.lines[0]?.after,
  ).toBe('+28 to maximum Life')
})
