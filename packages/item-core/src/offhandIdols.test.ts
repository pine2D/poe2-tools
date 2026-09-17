import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { isArmourIdol, isOffhandIdolId, scaleArmourIdol } from './armourIdols'
import type { CraftCatalog } from './catalog'
import { catalog, dictionary } from './catalystTestFixture'
import { createCraftItemDictionary } from './craftDictionary'
import { exportCraftItemText } from './craftItemText'
import { applyCraftStep } from './craftSteps'
import { inspectItem } from './export'
import { parseItem } from './parse'
import { type CraftState, createCraftState } from './rehearsal'
import { importCraftState } from './rehearsalImport'
import { runeSocketContributionError } from './runeImport'
import { socketCandidates, socketEffects } from './sockets'

const idols = (catalog.augments ?? []).filter(
  (a) => a.type === 'Idol' && ['focus', 'shield', 'buckler'].includes(a.category) && a.lines.length,
)
export function offhandState(category = 'shield'): CraftState {
  const base = catalog.bases.find(
    (b) =>
      !b.hidden &&
      !b.runeforged &&
      !b.variantList &&
      (category === 'focus'
        ? b.type === 'Focus'
        : b.type === 'Shield' && b.tags.includes('buckler') === (category === 'buckler')),
  )
  if (!base) throw Error(category)
  return {
    baseId: base.id,
    rarity: 'rare',
    itemLevel: 86,
    sourceText: null,
    quality: 0,
    sockets: [null, null],
    affixes: [],
  }
}
it('六条固定副手身份及部位，圆盾由Shield加buckler标签判别', () => {
  expect(idols).toHaveLength(6)
  for (const a of idols) {
    expect(isOffhandIdolId(a.id)).toBe(true)
    expect(isArmourIdol(a)).toBe(true)
    for (const category of ['focus', 'shield', 'buckler']) {
      const s = offhandState(category)
      expect(socketCandidates(catalog, s).some((p) => p.id === a.id)).toBe(category === a.category)
      expect(createCraftState(catalog, { ...s, sockets: [a.id] }).ok).toBe(category === a.category)
    }
  }
  for (const id of [
    null,
    {},
    'pob2:augment:["Idol of Silk","buckler"]',
    'pob2:augment:["Ox Idol","focus"]',
  ])
    expect(isOffhandIdolId(id)).toBe(false)
})
it('完整metadata、双hash、scalability和重复记录均严格校验', () => {
  for (const a of idols) {
    const s = { ...offhandState(a.category), sockets: [a.id] }
    for (const patch of [
      { localMod: !a.localMod },
      { bonded: undefined },
      { statOrder: [] },
      { tradeHashes: {} },
      { limit: 99 },
      { isSocketBound: true },
    ]) {
      expect(
        createCraftState(
          {
            ...catalog,
            augments: catalog.augments?.map((p) => (p.id === a.id ? { ...p, ...patch } : p)),
          } as CraftCatalog,
          s,
        ).ok,
      ).toBe(false)
    }
    expect(createCraftState({ ...catalog, augments: [a, a] }, s).ok).toBe(false)
    for (const path of ['src/Data/ModRunes.lua', 'src/Data/ModScalability.lua'])
      expect(
        createCraftState(
          {
            ...catalog,
            _meta: {
              ...catalog._meta,
              sources: catalog._meta.sources.map((p) =>
                p.path === path ? { ...p, sha256: '0'.repeat(64) } : p,
              ),
            },
          },
          s,
        ).ok,
      ).toBe(false)
    expect(
      scaleArmourIdol(
        { ...catalog, scalability: { ...catalog.scalability, [a.lines[0] ?? 'missing']: [] } },
        a,
        0,
      ),
    ).toBe(null)
    expect(createCraftState(catalog, { ...s, sourceText: 'Sanctified' }).ok).toBe(false)
  }
})
it('无限量合计、限量替换、未知与绑定效果不能冒充正常来源', () => {
  for (const a of idols) {
    const s = { ...offhandState(a.category), sockets: [a.id, a.id] }
    expect(createCraftState(catalog, s).ok).toBe(true)
    if (a.limit === undefined)
      expect(
        runeSocketContributionError(catalog, {
          ...s,
          runeSourceLines: a.lines.map((l) => l.replace(/\d+/, (n) => String(Number(n) * 2))),
        }),
      ).toBe(null)
    else
      expect(
        applyCraftStep(
          catalog,
          { ...s, sockets: [a.id, null] },
          { kind: 'socket', socketIndex: 1, augmentId: a.id },
        ).ok,
      ).toBe(false)
    const one = { ...s, sockets: [a.id, null] }
    expect(socketEffects(catalog, one)[0]?.bondedActive).toBe(false)
    for (const lines of [
      [],
      a.bonded?.lines ?? [],
      [...a.lines, 'Damage is Lucky'],
      a.lines.map((l) => l.replace(/\d+/, '99')),
    ])
      expect(runeSocketContributionError(catalog, { ...one, runeSourceLines: lines })).not.toBe(
        null,
      )
  }
})
it.each(['en', 'zh-CN', 'zh-TW'] as const)('%s 六条真实词典导出回读及来源完整核对', (locale) => {
  const localeDictionary =
    locale === 'zh-TW'
      ? createCraftItemDictionary(
          catalog,
          Object.fromEntries(
            ['items', 'stats'].map((kind) => [
              kind,
              JSON.parse(
                readFileSync(
                  new URL(`../../../data/dict/zh-TW/${kind}.json`, import.meta.url),
                  'utf8',
                ),
              ),
            ]),
          ),
        )
      : dictionary
  for (const a of idols) {
    const s = {
      ...offhandState(a.category),
      sockets: [a.id, 'pob2:augment:["Iron Rune","armour"]'],
    }
    const out = exportCraftItemText(catalog, s, { locale, dictionary: localeDictionary })
    if (!out.ok) throw Error(out.error)
    if (locale === 'zh-CN') expect(out.value.text).not.toContain(a.lines[0])
    const parsed = parseItem(out.value.text)
    if (!parsed.ok) throw Error(parsed.error)
    const back = importCraftState(
      catalog,
      s.baseId,
      parsed.item,
      inspectItem(parsed.item, localeDictionary),
      s.sockets,
      undefined,
      localeDictionary.stats?.entries,
    )
    if (!back.ok) throw Error(back.error)
    expect(back.value.runeSourceLines).toEqual(
      socketEffects(catalog, s).flatMap((e) => e.augment.lines),
    )
  }
})
