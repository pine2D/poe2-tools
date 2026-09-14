import { expect, it } from 'vitest'
import { catalystChoices, estimateCatalystEffects } from './catalystEffects'
import { catalystQualityLimit } from './catalystQuality'
import { catalog, dictionary, parse } from './catalystTestFixture'
import { exportCraftItemText } from './craftItemText'
import { CRAFT_RULES_VERSION, parseCraftProject } from './craftProject'
import { applyCraftStep } from './craftSteps'
import { inspectItem } from './export'
import { estimateCraftAffixEffects } from './jewelEffects'
import { estimateJewelRadius } from './jewelRadius'
import { JEWEL_SOURCE } from './jewels'
import { LIQUID_EMOTION_SOURCE } from './liquidEmotions'
import { type CraftState, createCraftState } from './rehearsal'
import { importCraftState } from './rehearsalImport'
import { STAT_SCALABILITY_SOURCE } from './statScalability'
import { analyzeCraftTargets } from './targets'

const modId = 'JewelRadiusMinionCriticalMultiplier'
const state: CraftState = {
  baseId: 'Time-Lost Sapphire',
  itemLevel: 86,
  rarity: 'rare',
  sourceText: null,
  catalyst: { id: 'Necrotic', quality: 20, declared: true },
  affixes: [
    {
      modId,
      lines: [
        'Notable Passive Skills in Radius also grant Minions have 12(6-12)% increased Critical Damage Bonus',
      ],
    },
  ],
}
function imported(text: string, declaration?: string) {
  const item = parse(text)
  return importCraftState(
    catalog,
    state.baseId,
    item,
    inspectItem(item, dictionary),
    undefined,
    undefined,
    dictionary.stats?.entries,
    declaration,
  )
}
function project(initialState = state) {
  const output = exportCraftItemText(catalog, initialState, { locale: 'zh-CN', dictionary })
  if (!output.ok) throw Error(output.error)
  const source = imported(output.value.text)
  if (!source.ok) throw Error(source.error)
  return {
    schemaVersion: 1,
    sourceCommit: catalog._meta.sourceCommit,
    rulesVersion: CRAFT_RULES_VERSION,
    initialState: source.value,
    operations: [{ currency: 'divine', modIds: [], rolls: [{ modId, values: [6] }] }],
    cursor: 1,
    jewelSourceHash: JEWEL_SOURCE.sha256,
    scalabilitySourceHash: STAT_SCALABILITY_SOURCE.sha256,
  }
}

it.each(['Time-Lost Ruby', 'Time-Lost Sapphire', 'Time-Lost Emerald', 'Time-Lost Diamond'])(
  '%s 接收已有催化品质，使用13类精炼材料与20上限',
  (baseId) => {
    const base = catalog.bases.find((b) => b.id === baseId)
    if (!base) throw Error('缺少基底')
    const input = { ...state, baseId, affixes: [] }
    expect(catalystQualityLimit(base)).toBe(20)
    expect(createCraftState(catalog, input).ok).toBe(true)
    const choices = catalystChoices(catalog, input)
    if (!choices.ok) throw Error(choices.error)
    expect(choices.value.maxQuality).toBe(20)
    expect(choices.value.choices).toHaveLength(13)
    expect(choices.value.choices.every((c) => c.name.startsWith('Refined '))).toBe(true)
    expect(
      createCraftState(catalog, { ...input, catalyst: { id: 'Necrotic', quality: 21 } }).ok,
    ).toBe(false)
    expect(catalystQualityLimit({ ...base, id: 'Other Jewel' })).toBeNull()
  },
)

it('范围词缀仅提供标明显示精度的预览，不把缺失缩放资料转为有效目标', () => {
  const before = JSON.stringify(state)
  const result = estimateCatalystEffects(catalog, state, 'Necrotic', 20)
  expect(result).toMatchObject({
    ok: true,
    value: {
      catalystName: 'Refined Necrotic Catalyst',
      groups: [
        {
          matched: true,
          lines: [
            {
              after:
                'Notable Passive Skills in Radius also grant Minions have 14% increased Critical Damage Bonus',
              basis: 'display',
            },
          ],
        },
      ],
    },
  })
  expect(estimateCraftAffixEffects(catalog, state)).toMatchObject({
    ok: true,
    value: { groups: [{ lines: [{ after: null }] }] },
  })
  const target = analyzeCraftTargets(
    catalog,
    state,
    [modId],
    [{ modId, basis: 'effective', bounds: [{ index: 0, min: 14 }] }],
  )
  expect(target.ok && target.value.targets[0]?.matched).not.toBe(true)
  expect(JSON.stringify(state)).toBe(before)
})

it('神圣改变基础值并保留品质，半径与范围增效不被催化放大', () => {
  const input = {
    ...state,
    affixes: [
      ...state.affixes,
      {
        modId: 'JewelRadiusSmallNodeEffect',
        lines: ['20% increased Effect of Small Passive Skills in Radius'],
      },
    ],
  }
  const step = applyCraftStep(catalog, input, {
    currency: 'divine',
    modIds: [],
    rolls: [
      { modId, values: [6] },
      { modId: 'JewelRadiusSmallNodeEffect', values: [25] },
    ],
  })
  if (!step.ok) throw Error(step.error)
  expect(step.value.catalyst).toEqual(state.catalyst)
  expect(estimateCatalystEffects(catalog, step.value, 'Necrotic', 20)).toMatchObject({
    ok: true,
    value: {
      groups: [
        {
          lines: [
            {
              after:
                'Notable Passive Skills in Radius also grant Minions have 7% increased Critical Damage Bonus',
            },
          ],
        },
        { matched: false, lines: [{ status: 'unaffected' }] },
      ],
    },
  })
  expect(estimateJewelRadius(catalog, step.value)).toEqual(estimateJewelRadius(catalog, input))
})

it.each(['en', 'zh-CN', 'zh-TW'] as const)('%s 高级导出回读保留品质与基础范围', (locale) => {
  const output = exportCraftItemText(catalog, state, { locale, dictionary })
  if (!output.ok) throw Error(output.error)
  expect(output.value.text).toContain('Quality (Minion Modifiers): +20%')
  expect(output.value.text).toContain('12(6-12)')
  expect(imported(output.value.text)).toMatchObject({
    ok: true,
    value: {
      catalyst: { id: 'Necrotic', quality: 20 },
      affixes: state.affixes,
    },
  })
  expect(imported(output.value.text.replace('12(6-12)', '14'))).toMatchObject({ ok: false })
})

it('未知中文品质类型经核对后导入，重复品质与错误增效拒绝', () => {
  const output = exportCraftItemText(catalog, state, { locale: 'zh-CN', dictionary })
  if (!output.ok) throw Error(output.error)
  const text = output.value.text.replace('Quality (Minion Modifiers)', '品质（待核对类型）')
  expect(imported(text).ok).toBe(false)
  expect(imported(text, 'Necrotic')).toMatchObject({
    ok: true,
    value: { catalyst: state.catalyst },
  })
  expect(imported(text.replace('+20%', '+20%\n品质: +20%'), 'Necrotic').ok).toBe(false)
})

it('所有游标保存恢复；v68、品质与来源篡改拒绝，普通v68仍兼容', () => {
  for (const cursor of [0, 1]) {
    const result = parseCraftProject(JSON.stringify({ ...project(), cursor }), catalog, dictionary)
    if (!result.ok) throw Error(result.error)
    expect(result.value.states[cursor]?.catalyst).toEqual({ id: 'Necrotic', quality: 20 })
  }
  for (const change of [
    { rulesVersion: 'basic-2026-09-12-v68' },
    { scalabilitySourceHash: undefined },
    { jewelSourceHash: '0'.repeat(64) },
    { initialState: { ...state, catalyst: { id: 'Necrotic', quality: 20 } } },
  ])
    expect(
      parseCraftProject(JSON.stringify({ ...project(), ...change }), catalog, dictionary).ok,
    ).toBe(false)
  const { catalyst: _catalyst, ...plain } = state
  expect(
    parseCraftProject(
      JSON.stringify({ ...project(plain), rulesVersion: 'basic-2026-09-12-v68' }),
      catalog,
      dictionary,
    ).ok,
  ).toBe(true)
})

it('远古工艺继续保留已有品质，范围抗性不变成角色直接抗性', () => {
  const result = applyCraftStep(catalog, state, {
    kind: 'liquid-emotion',
    emotionId: 'Metadata/Items/Currency/EndgameDistilledEmotionTimeLost2',
    removeModId: modId,
    values: [7],
  })
  if (!result.ok) throw Error(result.error)
  expect(result.value.catalyst).toEqual(state.catalyst)
  expect(estimateCatalystEffects(catalog, result.value, "Tul's", 20)).toMatchObject({
    ok: true,
    value: {
      groups: [
        {
          lines: [
            {
              after: 'Notable Passive Skills in Radius also grant +8% to Cold Resistance',
              basis: 'display',
            },
          ],
        },
      ],
    },
  })
  const saved = {
    ...project(result.value),
    operations: [],
    cursor: 0,
    liquidEmotionSourceHash: LIQUID_EMOTION_SOURCE.sha256,
  }
  expect(parseCraftProject(JSON.stringify(saved), catalog, dictionary).ok).toBe(true)
})
