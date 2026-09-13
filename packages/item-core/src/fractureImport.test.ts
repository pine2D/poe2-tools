import { expect, it } from 'vitest'
import { required } from './beltTestFixture'
import { boneCatalog, boneState } from './boneTestFixture'
import { compareCraftStates } from './comparison'
import { exportCraftItemText } from './craftItemText'
import { inspectItem } from './export'
import { parseItem } from './parse'
import { createCraftState } from './rehearsal'
import { importCraftState } from './rehearsalImport'

it.each(['en', 'zh-CN', 'zh-TW'] as const)(
  '%s 低词缀数稀有、同组双状态和完整多行往返',
  (locale) => {
    const catalog = boneCatalog()
    required(catalog.bases[0]).socketLimit = null
    required(catalog.modifiers[0]).lines = [
      'Minions deal (1-10)% increased Damage',
      '+(11-20) to maximum Life',
    ]
    const state = boneState(['prefix1'])
    delete state.sockets
    state.affixes = [
      {
        modId: 'prefix1',
        lines: ['Minions deal 5(1-10)% increased Damage', '+15(11-20) to maximum Life'],
        crafted: true,
        fractured: true,
      },
    ]
    const tw = locale === 'zh-TW'
    const dictionary = {
      items: { bases: { 'Synthetic Base': tw ? '合成頭盔' : '合成头盔' }, uniques: {} },
      stats: {
        entries: [
          {
            id: 'a',
            en: 'Minions deal #% increased Damage',
            text: tw ? '召喚物增加 #% 傷害' : '召唤生物伤害提高 #%',
          },
          { id: 'b', en: '+# to maximum Life', text: tw ? '+# 最大生命' : '+# 生命上限' },
        ],
      },
    }
    const output = exportCraftItemText(catalog, state, { locale, dictionary })
    expect(output.ok).toBe(true)
    if (!output.ok) return
    expect(output.value.text.match(/\(crafted\) \(fractured\)/g)).toHaveLength(2)
    expect(output.value.text).toContain('Fractured Item')
    const parsed = parseItem(output.value.text)
    if (!parsed.ok) throw new Error(parsed.error)
    const imported = importCraftState(
      catalog,
      state.baseId,
      parsed.item,
      inspectItem(parsed.item, dictionary),
      undefined,
      undefined,
      dictionary.stats.entries,
    )
    expect(imported).toMatchObject({ ok: true, value: { affixes: state.affixes } })
    const noFlag = parseItem(output.value.text.replace('--------\nFractured Item\n', ''))
    if (!noFlag.ok) throw new Error(noFlag.error)
    expect(
      importCraftState(
        catalog,
        state.baseId,
        noFlag.item,
        inspectItem(noFlag.item, dictionary),
        undefined,
        undefined,
        dictionary.stats.entries,
      ).ok,
    ).toBe(true)
  },
)

it('比较新增锁定只显示状态差异，不伪造数值变化', () => {
  const catalog = boneCatalog()
  const before = boneState(['prefix1'])
  const after = structuredClone(before)
  required(after.affixes[0]).fractured = true
  expect(compareCraftStates(catalog, before, after)).toMatchObject({
    ok: true,
    value: {
      affixes: [
        {
          modId: 'prefix1',
          kind: 'changed',
          numeric: [],
          fractured: { before: false, after: true },
        },
      ],
    },
  })
})

it('非法双来源、魔法、重复锁定及未知实际值在核心入口拒绝', () => {
  const catalog = boneCatalog()
  const state = boneState(['prefix1', 'suffix1'])
  required(state.affixes[0]).fractured = true
  expect(createCraftState(catalog, { ...state, rarity: 'magic' }).ok).toBe(false)
  expect(
    createCraftState(catalog, {
      ...state,
      affixes: state.affixes.map((a) => ({ ...a, fractured: true })),
    }).ok,
  ).toBe(false)
  expect(
    createCraftState(catalog, {
      ...state,
      affixes: [{ ...required(state.affixes[0]), desecrated: true }],
    }).ok,
  ).toBe(false)
  expect(
    createCraftState(catalog, {
      ...state,
      affixes: [{ ...required(state.affixes[0]), lines: ['prefix1 (1-10)'] }],
    }).ok,
  ).toBe(false)
  for (const fractured of [false, undefined, 1])
    expect(
      createCraftState(catalog, {
        ...state,
        affixes: [{ ...required(state.affixes[0]), fractured }],
      } as never).ok,
    ).toBe(false)
})

it('尾旗无定位、隐式破裂、不完整组、原文和检查结果篡改均拒绝', () => {
  const catalog = boneCatalog()
  required(catalog.bases[0]).socketLimit = null
  const dictionary = { items: { bases: { 'Synthetic Base': 'Synthetic Base' }, uniques: {} } }
  const prefix =
    'Item Class: Helmets\nRarity: Rare\nSynthetic Name\nSynthetic Base\n--------\nItem Level: 64\n--------\n'
  const text = `${prefix}{ Prefix Modifier "prefix1" }\nprefix1 5 (fractured)`
  const run = (raw: string) => {
    const parsed = parseItem(raw)
    if (!parsed.ok) return false
    return importCraftState(
      catalog,
      'Synthetic Base',
      parsed.item,
      inspectItem(parsed.item, dictionary),
    ).ok
  }
  expect(run(text)).toBe(true)
  expect(run(`${text.replace('(fractured)', '')}\n--------\nFractured Item`)).toBe(false)
  expect(run(text.replace('Prefix Modifier "prefix1"', 'Implicit Modifier'))).toBe(false)
  expect(run(text.replace('(fractured)', '(fractured) (fractured)'))).toBe(false)
  expect(run(text.replace('Rarity: Rare\nSynthetic Name', 'Rarity: Magic'))).toBe(false)
  const parsed = parseItem(text)
  if (!parsed.ok) throw new Error(parsed.error)
  const inspection = inspectItem(parsed.item, dictionary)
  required(required(inspection.mods[0]).stats[0]).resolution.english = 'prefix1 8 (fractured)'
  expect(importCraftState(catalog, 'Synthetic Base', parsed.item, inspection).ok).toBe(false)
  delete required(parsed.item.mods[0]).states
  expect(
    importCraftState(catalog, 'Synthetic Base', parsed.item, inspectItem(parsed.item, dictionary))
      .ok,
  ).toBe(false)
  required(catalog.modifiers[0]).lines.push('Extra (1-10)')
  expect(run(`${text}\nExtra 5`)).toBe(false)
  expect(run(`${text}\nExtra 5 (fractured)`)).toBe(true)
})
