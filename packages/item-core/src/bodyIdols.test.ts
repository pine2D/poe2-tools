import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { isBodyIdolId, isHelmetBootIdolId } from './armourIdols'
import { catalog } from './catalystTestFixture'
import { createCraftItemDictionary } from './craftDictionary'
import { exportCraftItemText } from './craftItemText'
import { applyCraftStep } from './craftSteps'
import { inspectItem } from './export'
import { parseItem } from './parse'
import { type CraftState, createCraftState } from './rehearsal'
import { importCraftState } from './rehearsalImport'
import { estimateResistances } from './resistances'
import { runeSocketContributionError } from './runeImport'
import { socketCandidates, socketEffects } from './sockets'

function required<T>(value: T | null | undefined): T {
  if (value == null) throw Error('missing fixture')
  return value
}
const idols = required(catalog.augments).filter(
  (a) => a.type === 'Idol' && a.category === 'body armour',
)
const state = (names: string[]): CraftState => ({
  baseId: required(
    catalog.bases.find(
      (b) => b.type === 'Body Armour' && !b.hidden && !b.runeforged && !b.variantList,
    ),
  ).id,
  rarity: 'rare',
  itemLevel: 86,
  quality: 0,
  affixes: [],
  sourceText: null,
  sockets: names.map(
    (name) =>
      required(
        required(catalog.augments).find(
          (a) => a.name === name && ['body armour', 'armour'].includes(a.category),
        ),
      ).id,
  ),
})
it('十种胸甲雕像支持真实孔位及完整混合来源', () => {
  expect(idols).toHaveLength(10)
  expect(
    socketCandidates(catalog, { ...state([]), sockets: [null] }).filter((a) => a.type === 'Idol'),
  ).toHaveLength(10)
  for (const a of idols) {
    const s = state([a.name, 'Iron Rune'])
    expect(createCraftState(catalog, s).ok, a.name).toBe(true)
    const lines = [
      ...a.lines,
      ...required(
        required(catalog.augments).find((a) => a.name === 'Iron Rune' && a.category === 'armour'),
      ).lines,
    ]
    expect(runeSocketContributionError(catalog, { ...s, runeSourceLines: lines }), a.name).toBe(
      null,
    )
    expect(
      runeSocketContributionError(catalog, { ...s, runeSourceLines: lines.slice(1) }),
    ).not.toBe(null)
  }
})
it('Fox只激活本件Idol含自身，不激活普通Rune；移除立即失效', () => {
  const effects = socketEffects(catalog, state(['Fox Idol', 'Panther Idol', 'Desert Rune']))
  expect(effects).toHaveLength(3)
  expect(effects.map((e) => e.bondedActive)).toEqual([true, true, false])
  expect(effects[0]?.activeBondedLines).toEqual([' +5% to Quality of all Skills'.trim()])
  expect(effects[1]?.activeBondedLines).toEqual(['+8% to Chaos Resistance'])
  expect(socketEffects(catalog, state(['Panther Idol']))[0]?.activeBondedLines).toEqual([])
})

it('Fox激活的混沌/冰霜/闪电绑定抗性计入本件，无Fox为零', () => {
  for (const [name, key, value] of [
    ['Panther Idol', 'chaosResistance', 8],
    ['Hawk Idol', 'coldResistance', 12],
    ['Stoat Idol', 'lightningResistance', 12],
  ] as const) {
    expect(estimateResistances(catalog, state(['Fox Idol', name]))[key]).toEqual({
      ok: true,
      value,
    })
    expect(estimateResistances(catalog, state([name]))[key]).toEqual({ ok: true, value: 0 })
  }
  expect(estimateResistances(catalog, state(['Fox Idol', 'Desert Rune'])).fireResistance).toEqual({
    ok: true,
    value: 14,
  })
})
it.each(['en', 'zh-CN', 'zh-TW'] as const)(
  '%s 全部胸甲雕像混合导出回读保留绑定观察与历史',
  (locale) => {
    const dictionary = createCraftItemDictionary(
      catalog,
      Object.fromEntries(
        ['items', 'stats'].map((kind) => [
          kind,
          JSON.parse(
            readFileSync(
              new URL(
                `../../../data/dict/${locale === 'en' ? 'zh-CN' : locale}/${kind}.json`,
                import.meta.url,
              ),
              'utf8',
            ),
          ),
        ]),
      ),
    )
    for (const a of idols) {
      const input = state([a.name, 'Iron Rune'])
      const exported = exportCraftItemText(catalog, input, { locale, dictionary })
      if (!exported.ok) throw Error(exported.error)
      expect(exported.value.text).toContain('Bonded: ')
      const parsed = parseItem(exported.value.text)
      if (!parsed.ok) throw Error(parsed.error)
      const imported = importCraftState(
        catalog,
        input.baseId,
        parsed.item,
        inspectItem(parsed.item, dictionary),
        input.sockets,
      )
      if (!imported.ok)
        throw Error(`${locale} ${a.name}: ${imported.error}\n${exported.value.text}`)
      expect(imported.value.sourceText).toBe(exported.value.text)
      expect(imported.value.runeSourceLines?.some((l) => l.startsWith('Bonded: '))).toBe(true)
      const replaced = applyCraftStep(catalog, imported.value, {
        kind: 'socket',
        socketIndex: 0,
        augmentId: 'pob2:augment:["Fox Idol","body armour"]',
      })
      if (!replaced.ok) throw Error(replaced.error)
      expect(replaced.value.runeSourceLines).toEqual(imported.value.runeSourceLines)
      expect(replaced.value.sourceText).toBe(exported.value.text)
      const source = required(imported.value.runeSourceLines)
      for (const bad of [
        source.slice(1),
        [...source, 'Bonded: +99% to Chaos Resistance'],
        source.map((l) => (l.includes('Bonded: ') ? l.replace(/\d+/, '999') : l)),
      ])
        expect(runeSocketContributionError(catalog, { ...input, runeSourceLines: bad })).not.toBe(
          null,
        )
    }
  },
)
it('body精确ID、限量、双hash及绑定逐值metadata不能伪造', () => {
  expect(idols.every((a) => isBodyIdolId(a.id) && !isHelmetBootIdolId(a.id))).toBe(true)
  for (const a of idols) {
    const input = state([a.name])
    const line = required(required(a.bonded).lines[0])
    expect(
      createCraftState(
        {
          ...catalog,
          scalability: { ...catalog.scalability, [line]: [{ scalable: false, formats: [] }] },
        },
        input,
      ).ok,
    ).toBe(false)
    expect(createCraftState(catalog, { ...input, sockets: [a.id, a.id] }).ok).toBe(true)
    expect(
      applyCraftStep(
        catalog,
        { ...input, sockets: [a.id, null] },
        { kind: 'socket', socketIndex: 1, augmentId: a.id },
      ).ok,
    ).toBe(false)
    for (const path of ['src/Data/ModRunes.lua', 'src/Data/ModScalability.lua'])
      expect(
        createCraftState(
          {
            ...catalog,
            _meta: {
              ...catalog._meta,
              sources: catalog._meta.sources.map((s) =>
                s.path === path ? { ...s, sha256: '0'.repeat(64) } : s,
              ),
            },
          },
          input,
        ).ok,
      ).toBe(false)
  }
})
it('无绑定观察与完整观察均按固定Fox孔位推导，部分绑定缺失拒绝', () => {
  const input = state(['Fox Idol', 'Panther Idol', 'Iron Rune'])
  const augments = required(input.sockets).map((id) =>
    required(required(catalog.augments).find((a) => a.id === id)),
  )
  const main = augments.flatMap((a) => a.lines)
  const bonded = augments.flatMap((a) => required(a.bonded).lines.map((l) => `Bonded: ${l}`))
  expect(runeSocketContributionError(catalog, { ...input, runeSourceLines: main })).toBe(null)
  expect(
    runeSocketContributionError(catalog, { ...input, runeSourceLines: [...main, ...bonded] }),
  ).toBe(null)
  expect(
    runeSocketContributionError(catalog, {
      ...input,
      runeSourceLines: [...main, ...bonded.slice(1)],
    }),
  ).not.toBe(null)
  expect(estimateResistances(catalog, input).chaosResistance).toEqual({ ok: true, value: 8 })
  expect(input.sourceText).toBe(null)
})
it('混合魂核/条件Rune所有普通数字与完整条件必须对应', () => {
  for (const a of idols) {
    for (const name of ['Soul Core of Tacati', 'Warding Rune of Protection', 'Desert Rune']) {
      const input = state([a.name, name])
      const partners = required(input.sockets).map((id) =>
        required(required(catalog.augments).find((entry) => entry.id === id)),
      )
      const lines = partners.flatMap((entry) => entry.lines)
      expect(
        runeSocketContributionError(catalog, { ...input, runeSourceLines: lines }),
        `${a.name}/${name}`,
      ).toBe(null)
      for (const bad of [
        a.lines,
        [...lines, ...a.lines],
        lines.map((line) => line.replace(/\d+/, '999')),
      ])
        expect(runeSocketContributionError(catalog, { ...input, runeSourceLines: bad })).not.toBe(
          null,
        )
    }
  }
})
it('胸甲本件限量与三Carved共享上限，观察超限仍可修复', () => {
  const carved = idols.filter((a) => a.limitId === 'AncientAugment')
  expect(carved).toHaveLength(3)
  const input = state(carved.slice(0, 2).map((a) => a.name))
  expect(createCraftState(catalog, input).ok).toBe(true)
  expect(
    applyCraftStep(catalog, input, {
      kind: 'socket',
      socketIndex: 1,
      augmentId: required(carved[2]).id,
    }).ok,
  ).toBe(false)
  expect(
    applyCraftStep(catalog, input, {
      kind: 'socket',
      socketIndex: 1,
      augmentId: 'pob2:augment:["Iron Rune","armour"]',
    }).ok,
  ).toBe(true)
})
it('胸甲不伪造Horror资格，隐藏/变体/特殊孔/圣化仍拒绝', () => {
  const input = state(['Fox Idol'])
  expect(
    createCraftState(catalog, {
      ...input,
      affixes: [
        {
          modId: 'EssenceLocalRuneAndSoulCoreEffect1',
          crafted: true,
          lines: ['60% increased effect of Socketed Augment Items'],
        },
      ],
    }).ok,
  ).toBe(false)
  expect(createCraftState(catalog, { ...input, sourceText: 'Sanctified' }).ok).toBe(false)
  for (const patch of [
    { hidden: true },
    { variantList: ['unknown'] },
    { runeforged: true },
    { implicit: 'Has 2 Sockets' },
  ]) {
    expect(
      socketCandidates(
        {
          ...catalog,
          bases: catalog.bases.map((b) => (b.id === input.baseId ? { ...b, ...patch } : b)),
        },
        input,
      ),
    ).toEqual([])
  }
  for (const a of idols) {
    for (const patch of [
      { localMod: true },
      { limit: 2 },
      { bonded: { lines: [], statOrder: [] } },
      { statOrder: [1] },
      { tradeHashes: {} },
    ])
      expect(
        createCraftState(
          {
            ...catalog,
            augments: required(catalog.augments).map((entry) =>
              entry.id === a.id ? { ...entry, ...patch } : entry,
            ),
          },
          state([a.name]),
        ).ok,
      ).toBe(false)
  }
})
it('Fox加入/移除的来源观察保持原样，普通Rune绑定不进入任何本件抗性', () => {
  const input = state(['Panther Idol', 'Desert Rune'])
  const added = applyCraftStep(
    catalog,
    { ...input, sockets: [...required(input.sockets), null] },
    { kind: 'socket', socketIndex: 2, augmentId: 'pob2:augment:["Fox Idol","body armour"]' },
  )
  if (!added.ok) throw Error(added.error)
  expect(estimateResistances(catalog, added.value).chaosResistance).toEqual({ ok: true, value: 8 })
  expect(estimateResistances(catalog, added.value).fireResistance).toEqual({ ok: true, value: 14 })
  const removed = applyCraftStep(catalog, added.value, {
    kind: 'socket',
    socketIndex: 2,
    augmentId: 'pob2:augment:["Iron Rune","armour"]',
  })
  if (!removed.ok) throw Error(removed.error)
  expect(estimateResistances(catalog, removed.value).chaosResistance).toEqual({
    ok: true,
    value: 0,
  })
  expect(removed.value.sourceText).toBe(input.sourceText)
})
it('完整绑定观察与无绑定观察导入得到相同本件Fox贡献，历史不补造观察', () => {
  const input = state(['Fox Idol', 'Panther Idol', 'Iron Rune'])
  const exported = exportCraftItemText(catalog, input)
  if (!exported.ok) throw Error(exported.error)
  const dictionary = createCraftItemDictionary(catalog, {})
  for (const text of [
    exported.value.text,
    exported.value.text
      .split('\n')
      .filter((line) => !line.startsWith('Bonded: '))
      .join('\n'),
  ]) {
    const parsed = parseItem(text)
    if (!parsed.ok) throw Error(parsed.error)
    const imported = importCraftState(
      catalog,
      input.baseId,
      parsed.item,
      inspectItem(parsed.item, dictionary),
      input.sockets,
    )
    if (!imported.ok) throw Error(imported.error)
    expect(estimateResistances(catalog, imported.value).chaosResistance).toEqual({
      ok: true,
      value: 8,
    })
    expect(imported.value.sourceText).toBe(text)
    expect(imported.value.runeSourceLines?.some((line) => line.startsWith('Bonded: '))).toBe(
      text.includes('Bonded: '),
    )
    const replaced = applyCraftStep(catalog, imported.value, {
      kind: 'socket',
      socketIndex: 0,
      augmentId: 'pob2:augment:["Desert Rune","armour"]',
    })
    if (!replaced.ok) throw Error(replaced.error)
    expect(estimateResistances(catalog, replaced.value).chaosResistance).toEqual({
      ok: true,
      value: 0,
    })
    expect(replaced.value.runeSourceLines).toEqual(imported.value.runeSourceLines)
  }
})
