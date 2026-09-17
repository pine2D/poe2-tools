import { expect, it } from 'vitest'
import { catalog } from './catalystTestFixture'
import { socketLimitWarnings } from './conditionalArmourRunes'
import { applyCraftStep } from './craftSteps'
import { type CraftState, createCraftState } from './rehearsal'
import { runeSocketContributionError } from './runeImport'
import { artificerSocketLimit, socketCandidates, socketCapacity } from './sockets'

const id = (name: string) => `pob2:augment:${JSON.stringify([name, 'sceptre'])}`
const state = (): CraftState => ({
  baseId: 'Rattling Sceptre',
  rarity: 'rare',
  itemLevel: 86,
  sourceText: null,
  quality: 0,
  sockets: [null, null],
  affixes: [],
})
it('普通权杖支持1基础/2已有/腐化3孔及36精确镶嵌身份', () => {
  expect(artificerSocketLimit(catalog, state())).toBe(1)
  expect(socketCapacity(catalog, state())).toBe(2)
  expect(socketCapacity(catalog, { ...state(), corrupted: true })).toBe(3)
  expect(socketCandidates(catalog, state())).toHaveLength(36)
  for (const base of catalog.bases.filter((b) => b.type === 'Sceptre')) {
    expect(createCraftState(catalog, { ...state(), baseId: base.id }).ok).toBe(true)
  }
})
it('八种不限量效果可同模板累加，主体/符号/条件完整核对', () => {
  for (const name of ['Snake Idol', 'Boar Idol', 'Bear Idol', 'Ox Idol']) {
    const a = catalog.augments?.find((a) => a.id === id(name))
    if (!a) throw Error(name)
    const lines = a.lines.map((l) => l.replace(/\d+(?:\.\d+)?/g, (n) => String(Number(n) * 2)))
    const s = { ...state(), sockets: [a.id, a.id], runeSourceLines: lines }
    expect(runeSocketContributionError(catalog, s)).toBe(null)
    expect(
      runeSocketContributionError(catalog, {
        ...s,
        runeSourceLines: lines.map((l) => l.replace('Allies', 'Minions')),
      }),
    ).not.toBe(null)
  }
})
it('限量插入拒绝重复，已有超限可显示并替换修复', () => {
  const s = { ...state(), sockets: [id('Rabbit Idol'), null] }
  expect(
    applyCraftStep(catalog, s, { kind: 'socket', socketIndex: 1, augmentId: id('Rabbit Idol') }).ok,
  ).toBe(false)
  const old = { ...state(), sockets: [id('Rabbit Idol'), id('Rabbit Idol')] }
  expect(createCraftState(catalog, old).ok).toBe(true)
  expect(socketLimitWarnings(catalog, old)).toContainEqual({
    name: 'Rabbit Idol',
    limit: 1,
    count: 2,
    exceeded: true,
  })
  expect(
    applyCraftStep(catalog, old, { kind: 'socket', socketIndex: 1, augmentId: id('Snake Idol') })
      .ok,
  ).toBe(true)
})

import { readFileSync } from 'node:fs'
import { createCraftItemDictionary } from './craftDictionary'
import { exportCraftItemText } from './craftItemText'
import { inspectItem } from './export'
import { parseItem } from './parse'
import type { CraftResult } from './rehearsal'
import { importCraftState } from './rehearsalImport'
import {
  isSceptreAugment,
  isSupportedSceptreBase,
  scaleSceptreAugment,
  sceptreSourceMatches,
} from './sceptreAugments'
import { effectiveSocketAugment } from './socketAmplification'

const fullCatalog = {
  ...catalog,
  alloys: JSON.parse(
    readFileSync(new URL('../../../data/craft/alloys.json', import.meta.url), 'utf8'),
  ),
}
function must<T>(r: CraftResult<T>): T {
  if (!r.ok) throw Error(r.error)
  return r.value
}
const augments = (catalog.augments ?? []).filter((a) => a.category === 'sceptre')
it('固定目录Boar/Maxarius小数按源内部分钟值缩放，双hash/完整metadata受约束', () => {
  const s = {
    ...state(),
    affixes: [
      {
        modId: 'AlloyEffectOfSocketedAugments1',
        crafted: true as const,
        lines: ['30% increased effect of Socketed Augment Items'],
      },
    ],
  }
  for (const [name, line] of [
    ['Boar Idol', 'Allies in your Presence Regenerate 0.7% of your Maximum Life per second'],
    ['Idol of Maxarius', 'Flasks gain 0.25 charges per Second'],
    ['Idol of the Sycophant', 'Companions in your Presence have -26% to all Elemental Resistances'],
    ['Idol of the Martyr', '52% reduced Presence Area of Effect'],
  ]) {
    const a = augments.find((a) => a.name === name)
    if (!a) throw Error(name)
    expect(effectiveSocketAugment(fullCatalog, s, a)?.lines[0]).toBe(line)
    expect(scaleSceptreAugment({ ...catalog, scalability: {} }, a, 0)).toBe(null)
  }
  for (const a of augments) {
    expect(isSceptreAugment(a)).toBe(true)
    expect(isSceptreAugment({ ...a, lines: [...a.lines, 'Damage is Lucky'] })).toBe(false)
    expect(isSceptreAugment({ ...a, limit: 2 })).toBe(false)
    expect(
      createCraftState({ ...catalog, augments: [a, a] }, { ...state(), sockets: [a.id] }).ok,
    ).toBe(false)
  }
  const b = catalog.bases.find((b) => b.id === state().baseId)
  if (!b) throw Error('base')
  expect(isSupportedSceptreBase({ ...b, tags: [...b.tags, 'weapon'] })).toBe(false)
})
it.each(['en', 'zh-CN', 'zh-TW'] as const)('%s 全36材料含双行/无数字效果完整回读', (locale) => {
  const dictionary = createCraftItemDictionary(catalog, {
    items: JSON.parse(
      readFileSync(
        new URL(
          `../../../data/dict/${locale === 'en' ? 'zh-CN' : locale}/items.json`,
          import.meta.url,
        ),
        'utf8',
      ),
    ),
    stats: JSON.parse(
      readFileSync(
        new URL(
          `../../../data/dict/${locale === 'en' ? 'zh-CN' : locale}/stats.json`,
          import.meta.url,
        ),
        'utf8',
      ),
    ),
  })
  for (const a of augments) {
    const s = {
      ...state(),
      sockets: [a.id],
      implicitLines: ['Grants Skill: Level 12 Skeletal Warrior Minion'],
    }
    const text = must(exportCraftItemText(catalog, s, { locale, dictionary })).text
    const parsed = parseItem(text)
    if (!parsed.ok) throw Error(parsed.error)
    const imported = must(
      importCraftState(
        catalog,
        s.baseId,
        parsed.item,
        inspectItem(parsed.item, dictionary),
        s.sockets,
      ),
    )
    expect(imported.runeSourceLines).toEqual(a.lines)
    expect(imported.sourceText).toBe(text)
  }
})
it('所有非权杖类别拒绝专用材料，篡改来源/固定基底/目录声明均关闭能力', () => {
  const a = augments[0]
  if (!a) throw Error('augment')
  const changedSources = catalog._meta.sources.map((s) =>
    s.path === 'src/Data/ModRunes.lua' ? { ...s, sha256: '0'.repeat(64) } : s,
  )
  expect(
    socketCandidates({ ...catalog, _meta: { ...catalog._meta, sources: changedSources } }, state()),
  ).toEqual([])
  const changedScalars = catalog._meta.sources.map((s) =>
    s.path === 'src/Data/ModScalability.lua' ? { ...s, sha256: '0'.repeat(64) } : s,
  )
  expect(
    socketCandidates({ ...catalog, _meta: { ...catalog._meta, sources: changedScalars } }, state()),
  ).toEqual([])
  for (const type of ['Wand', 'Staff', 'One Hand Mace', 'Helmet', 'Ring']) {
    const base = catalog.bases.find(
      (b) => b.type === type && !b.hidden && !b.runeforged && !b.variantList,
    )
    if (!base) throw Error(type)
    expect(createCraftState(catalog, { ...state(), baseId: base.id, sockets: [a.id] }).ok).toBe(
      false,
    )
  }
  for (const patch of [
    { name: 'Faked' },
    { socketLimit: 9 },
    { hidden: true },
    { runeforged: true },
    { variantList: ['new'] },
  ]) {
    const bases = catalog.bases.map((b) => (b.id === state().baseId ? { ...b, ...patch } : b))
    expect(socketCandidates({ ...catalog, bases }, state())).toEqual([])
  }
})
it('真实君王合金操作在权杖生效，保留来源；八种无限量和28种限量逐项核对', () => {
  const start = {
    ...state(),
    sockets: [id('Boar Idol')],
    affixes: [{ modId: 'IncreasedMana1', lines: ['+12(10-14) to maximum Mana'] }],
  }
  const applied = must(
    applyCraftStep(fullCatalog, start, {
      kind: 'alloy',
      alloyId: 'Metadata/Items/Currency/CurrencyVerisiumAlloy9',
      removeModId: 'IncreasedMana1',
      values: [30],
    }),
  )
  const boar = augments.find((a) => a.name === 'Boar Idol')
  if (!boar) throw Error('Boar')
  expect(effectiveSocketAugment(fullCatalog, applied, boar)?.lines).toEqual([
    'Allies in your Presence Regenerate 0.7% of your Maximum Life per second',
  ])
  expect(augments.filter((a) => a.limit === undefined)).toHaveLength(8)
  expect(augments.filter((a) => a.limit === 1)).toHaveLength(28)
  for (const a of augments) {
    const s = { ...state(), sockets: [a.id, null] }
    const result = applyCraftStep(catalog, s, { kind: 'socket', socketIndex: 1, augmentId: a.id })
    expect(result.ok, a.name).toBe(a.limit === undefined)
    if (a.limit === undefined) {
      const combined = a.lines.map((l) => l.replace(/\d+(?:\.\d+)?/g, (n) => String(Number(n) * 2)))
      expect(
        runeSocketContributionError(catalog, {
          ...s,
          sockets: [a.id, a.id],
          runeSourceLines: combined,
        }),
      ).toBe(null)
    }
  }
})
it('条件/无数字/多行/负值不能漏行、变主体、改符号或忽略重复', () => {
  for (const a of augments.filter((a) => a.limit === 1)) {
    const s = { ...state(), sockets: [a.id], runeSourceLines: a.lines }
    expect(runeSocketContributionError(catalog, s)).toBe(null)
    expect(
      runeSocketContributionError(catalog, { ...s, runeSourceLines: [...a.lines, ...a.lines] }),
    ).not.toBe(null)
    expect(
      runeSocketContributionError(catalog, { ...s, runeSourceLines: a.lines.slice(1) }),
    ).not.toBe(null)
  }
  const s = {
    ...state(),
    sockets: [id('Idol of the Sycophant')],
    runeSourceLines: [
      'Companions in your Presence have +20% to all Elemental Resistances',
      'Companions in your Presence Gain 20% of Damage as Extra Damage of a random Element',
    ],
  }
  expect(runeSocketContributionError(catalog, s)).not.toBe(null)
})
it('固定2dp效果回读不受浮点乘100误差影响', () => {
  const a = augments.find((a) => a.name === 'Idol of Maxarius')
  if (!a) throw Error('Maxarius')
  const scaled = scaleSceptreAugment(catalog, a, 45)
  if (!scaled) throw Error('scaled')
  expect(scaled.lines).toEqual(['Flasks gain 0.28 charges per Second'])
  expect(sceptreSourceMatches(scaled.lines, scaled.lines)).toBe(true)
})
