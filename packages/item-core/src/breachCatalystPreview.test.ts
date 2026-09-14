import { describe, expect, it } from 'vitest'
import { catalystChoices, estimateCatalystEffects } from './catalystEffects'
import { catalog, dictionary } from './catalystTestFixture'
import { exportCraftItemText } from './craftItemText'
import { CRAFT_RULES_VERSION, parseCraftProject } from './craftProject'
import { applyCraftStep } from './craftSteps'
import { essenceSourceHash } from './essences'
import { inspectItem } from './export'
import { parseItem } from './parse'
import type { CraftState } from './rehearsal'
import { importCraftState } from './rehearsalImport'

const essenceId = 'Metadata/Items/Currency/CurrencyCorruptedEssenceBreach'
const step = { kind: 'essence' as const, essenceId, removeModId: 'FireResist1', values: [] }
function initial(baseId: string): CraftState {
  return {
    baseId,
    itemLevel: 86,
    rarity: 'rare',
    sourceText: null,
    affixes: [
      { modId: 'IncreasedLife1', lines: ['+19(10-19) to maximum Life'] },
      { modId: 'FireResist1', lines: ['+9(6-10)% to Fire Resistance'] },
    ],
  }
}
function crafted(baseId: string) {
  const result = applyCraftStep(catalog, initial(baseId), step)
  if (!result.ok) throw new Error(result.error)
  return result.value
}

describe('裂隙精华制作后的催化预览', () => {
  it.each([
    ['Gold Ring', 40, 26],
    ['Jade Amulet', 40, 26],
    ['Breach Ring', 60, 30],
  ] as const)('%s 的上限按已有精华增加，预览不改变装备或消费', (baseId, maxQuality, life) => {
    const state = crafted(baseId)
    const snapshot = JSON.stringify(state)
    expect(estimateCatalystEffects(catalog, state, 'Flesh', maxQuality)).toMatchObject({
      ok: true,
      value: {
        maxQuality,
        groups: expect.arrayContaining([
          expect.objectContaining({
            id: 'IncreasedLife1',
            lines: [expect.objectContaining({ after: `+${life} to maximum Life` })],
          }),
          expect.objectContaining({
            id: 'EssenceBreach',
            matched: false,
            lines: [expect.objectContaining({ status: 'unaffected' })],
          }),
        ]),
      },
    })
    expect(estimateCatalystEffects(catalog, state, 'Flesh', maxQuality + 1).ok).toBe(false)
    expect(JSON.stringify(state)).toBe(snapshot)
  })

  it('移除与项目每个历史位置恢复后重新计算上限', () => {
    const text = exportCraftItemText(catalog, initial('Gold Ring'))
    if (!text.ok) throw new Error(text.error)
    const parsed = parseItem(text.value.text)
    if (!parsed.ok) throw new Error('无法解析样本')
    const imported = importCraftState(
      catalog,
      'Gold Ring',
      parsed.item,
      inspectItem(parsed.item, dictionary),
    )
    if (!imported.ok) throw new Error(imported.error)
    const restored = parseCraftProject(
      JSON.stringify({
        schemaVersion: 1,
        rulesVersion: CRAFT_RULES_VERSION,
        sourceCommit: catalog._meta.sourceCommit,
        essenceSourceHash: essenceSourceHash(catalog),
        initialState: imported.value,
        operations: [step, { currency: 'annulment', modIds: [], removeModId: 'EssenceBreach' }],
        cursor: 2,
      }),
      catalog,
      dictionary,
    )
    if (!restored.ok) throw new Error(restored.error)
    expect(
      restored.value.states.map((state) => {
        const result = catalystChoices(catalog, state)
        return result.ok ? result.value.maxQuality : result.error
      }),
    ).toEqual([20, 40, 20])
    expect(restored.value.states.every((state) => state.catalyst === undefined)).toBe(true)
  })

  it('未知品质、非精华来源或被改写的保证声明不能提高上限', () => {
    const state = crafted('Gold Ring')
    const variants = [
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
        modifiers: catalog.modifiers.map((mod) =>
          mod.id === 'EssenceBreach' ? { ...mod, group: 'UnknownQuality' } : mod,
        ),
      },
    ]
    for (const data of variants) expect(catalystChoices(data, state).ok).toBe(false)
    expect(
      catalystChoices(catalog, {
        ...state,
        affixes: state.affixes.map(({ modId, lines }) => ({ modId, lines })),
      }).ok,
    ).toBe(false)
    // 本次仅修复只读预览，不放宽已有催化品质状态的特殊规则。
    expect(catalystChoices(catalog, { ...state, catalyst: { id: 'Flesh', quality: 20 } })).toEqual({
      ok: false,
      error: '此装备另有尚未核对的品质或词缀增效规则。',
    })
    expect(catalystChoices(catalog, { ...state, catalyst: { id: 'Flesh', quality: 40 } }).ok).toBe(
      false,
    )
  })
})
