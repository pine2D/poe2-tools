import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { isArmourIdol, isHelmetBootIdolId, scaleArmourIdol } from './armourIdols'
import type { CatalogAugment, CraftCatalog } from './catalog'
import { catalog } from './catalystTestFixture'
import { socketLimitWarnings } from './conditionalArmourRunes'
import { createCraftItemDictionary } from './craftDictionary'
import { exportCraftItemText } from './craftItemText'
import { applyCraftStep } from './craftSteps'
import { inspectItem } from './export'
import { isGloveIdol, isGloveIdolId } from './gloveIdols'
import { parseItem } from './parse'
import { type CraftState, createCraftState } from './rehearsal'
import { importCraftState } from './rehearsalImport'
import { parseRuneEffectTotals } from './runeEffects'
import { runeSocketContributionError } from './runeImport'
import { socketCandidates, socketEffects } from './sockets'

const idols = (catalog.augments ?? []).filter(
  (a) => a.type === 'Idol' && ['helmet', 'boots'].includes(a.category),
)
const state = (category: string): CraftState => ({
  baseId:
    catalog.bases.find(
      (b) =>
        b.type === (category === 'helmet' ? 'Helmet' : 'Boots') &&
        !b.hidden &&
        !b.runeforged &&
        !b.variantList,
    )?.id ?? 'missing base',
  rarity: 'rare',
  itemLevel: 86,
  sourceText: null,
  quality: 0,
  sockets: [null, null],
  affixes: [],
})
const withIdol = (a: CatalogAugment): CraftState => ({
  ...state(a.category),
  sockets: [a.id, null],
})
const horror = (s: CraftState) => {
  const result = applyCraftStep(
    catalog,
    { ...s, affixes: [{ modId: 'IncreasedLife1', lines: ['+15 to maximum Life'] }] },
    {
      kind: 'essence',
      essenceId: 'Metadata/Items/Currency/CurrencyCorruptedEssenceHorror',
      removeModId: 'IncreasedLife1',
      values: [],
    },
  )
  if (!result.ok) throw Error(result.error)
  return result.value
}
it('固定10头盔6鞋雕像进入各自普通孔，旧手套识别不扩权', () => {
  expect(idols).toHaveLength(16)
  for (const [category, count] of [
    ['helmet', 10],
    ['boots', 6],
  ] as const)
    expect(
      socketCandidates(catalog, state(category)).filter((a) => a.type === 'Idol'),
    ).toHaveLength(count)
  for (const a of idols) {
    expect(isArmourIdol(a)).toBe(true)
    expect(isHelmetBootIdolId(a.id)).toBe(true)
    expect(isGloveIdol(a)).toBe(false)
    expect(isGloveIdolId(a.id)).toBe(false)
    expect(createCraftState(catalog, withIdol(a)).ok).toBe(true)
    expect(
      createCraftState(catalog, {
        ...state(a.category === 'helmet' ? 'boots' : 'helmet'),
        sockets: [a.id],
      }).ok,
    ).toBe(false)
    expect(
      Object.values(parseRuneEffectTotals(a.lines) ?? { unsupported: 1 }).every((v) => v === 0),
    ).toBe(true)
  }
})
it('所有雕像与Rune、SoulCore、条件Rune完整混合核对，拒绝缺行重复与未知', () => {
  for (const a of idols) {
    const partners = socketCandidates(catalog, state(a.category)).filter(
      (p) =>
        p.id === 'pob2:augment:["Iron Rune","armour"]' ||
        p.id === 'pob2:augment:["Soul Core of Tacati","armour"]' ||
        p.name === 'Warding Rune of Protection',
    )
    expect(partners).toHaveLength(3)
    for (const p of partners) {
      const s = { ...withIdol(a), sockets: [a.id, p.id], runeSourceLines: [...a.lines, ...p.lines] }
      expect(runeSocketContributionError(catalog, s), a.id).toBe(null)
      for (const lines of [
        a.lines,
        p.lines,
        [...s.runeSourceLines, ...a.lines],
        [...s.runeSourceLines, 'Damage is Lucky'],
      ])
        expect(runeSocketContributionError(catalog, { ...s, runeSourceLines: lines })).not.toBe(
          null,
        )
      expect(socketEffects(catalog, s).flatMap((e) => e.augment.lines)).toEqual(s.runeSourceLines)
    }
  }
})
it('两个无限量精确合计，14限量允许观察修复并拒绝新增超限', () => {
  for (const a of idols) {
    const s = { ...withIdol(a), sockets: [a.id, a.id] }
    expect(createCraftState(catalog, s).ok).toBe(true)
    if (a.limit === undefined) {
      expect(
        runeSocketContributionError(catalog, {
          ...s,
          runeSourceLines: a.lines.map((l) => l.replace(/\d+/, (n) => String(Number(n) * 2))),
        }),
      ).toBe(null)
      expect(runeSocketContributionError(catalog, { ...s, runeSourceLines: a.lines })).not.toBe(
        null,
      )
    } else {
      expect(socketLimitWarnings(catalog, s)).toContainEqual({
        name: a.limitId ?? a.name,
        count: 2,
        limit: 1,
        exceeded: true,
      })
      expect(
        applyCraftStep(catalog, withIdol(a), { kind: 'socket', socketIndex: 1, augmentId: a.id })
          .ok,
      ).toBe(false)
      expect(
        applyCraftStep(catalog, withIdol(a), { kind: 'socket', socketIndex: 0, augmentId: a.id })
          .ok,
      ).toBe(true)
    }
  }
  for (const category of ['helmet', 'boots']) {
    const carved = idols.filter((a) => a.category === category && a.limitId === 'AncientAugment')
    expect(carved).toHaveLength(3)
    const s = {
      ...state(category),
      sockets: [carved[0]?.id ?? 'missing', carved[1]?.id ?? 'missing'],
    }
    expect(
      applyCraftStep(catalog, s, {
        kind: 'socket',
        socketIndex: 1,
        augmentId: carved[2]?.id ?? 'missing',
      }).ok,
    ).toBe(false)
    expect(
      applyCraftStep(catalog, s, {
        kind: 'socket',
        socketIndex: 1,
        augmentId: 'pob2:augment:["Iron Rune","armour"]',
      }).ok,
    ).toBe(true)
  }
})
it('鞋真实恐惧60%逐项取整，头盔无伪造工艺', () => {
  const expected: Record<string, string> = {
    'Idol of Grold': '80% increased total Power counted by Warcries',
    'Idol of Yeena': '48% increased Skill Effect Duration with Plant Skills',
    'Idol of Oak':
      '24% chance when you gain an Endurance Charge to gain an additional Endurance Charge',
    'Carved Cunning': 'Gain Onslaught for 6 seconds when your Marks Activate',
    'Carved Majesty': '1% increased Movement Speed while Sprinting per Persistent Minion',
    'Carved Tenacity': 'Your speed is Unaffected by Slows while Sprinting',
  }
  for (const a of idols.filter((a) => a.category === 'boots')) {
    const s = horror(withIdol(a))
    expect(socketEffects(catalog, s)[0]?.augment.lines).toEqual([expected[a.name]])
    expect(
      runeSocketContributionError(catalog, {
        ...s,
        runeSourceLines: [expected[a.name] ?? 'missing'],
      }),
    ).toBe(null)
  }
  expect(() => horror(state('helmet'))).toThrow()
})
it('metadata、重复记录、双hash与资格不能伪造，圣化不支持', () => {
  for (const a of idols) {
    for (const patch of [
      { localMod: true },
      { limit: 2 },
      { bonded: undefined },
      { statOrder: [1] },
      { tradeHashes: {} },
      { canSocketInUniqueItems: false },
    ]) {
      const forged = {
        ...catalog,
        augments: catalog.augments?.map((p) => (p.id === a.id ? { ...p, ...patch } : p)),
      } as CraftCatalog
      expect(createCraftState(forged, withIdol(a)).ok).toBe(false)
    }
    expect(createCraftState({ ...catalog, augments: [a, a] }, withIdol(a)).ok).toBe(false)
    for (const path of ['src/Data/ModRunes.lua', 'src/Data/ModScalability.lua']) {
      const forged = {
        ...catalog,
        _meta: {
          ...catalog._meta,
          sources: catalog._meta.sources.map((s) =>
            s.path === path ? { ...s, sha256: '0'.repeat(64) } : s,
          ),
        },
      }
      expect(createCraftState(forged, withIdol(a)).ok).toBe(false)
    }
    expect(createCraftState(catalog, { ...withIdol(a), sourceText: 'Sanctified' }).ok).toBe(false)
  }
})
it.each(['en', 'zh-CN', 'zh-TW'] as const)('%s 真词典完整16效果导出回读', (locale) => {
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
  for (const a of idols)
    for (const amplified of a.category === 'boots' ? [false, true] : [false]) {
      const s = { ...withIdol(a), sockets: [a.id, 'pob2:augment:["Iron Rune","armour"]'] }
      const input = amplified ? horror(s) : s
      const exported = exportCraftItemText(catalog, input, { locale, dictionary })
      if (!exported.ok) throw Error(exported.error)
      const line = socketEffects(catalog, input)[0]?.augment.lines[0]
      if (!line) throw Error('missing effect')
      // 当前台服官方词典确实缺少这一项；必须保留原文并明确警告。
      const missing = locale === 'zh-TW' && a.category === 'helmet' && a.name === 'Carved Cunning'
      if (missing) {
        expect(exported.value.text).toContain(line)
        expect(exported.value.warnings.some((w) => w.includes(line))).toBe(true)
      } else if (locale !== 'en') {
        expect(exported.value.text, `${locale} ${a.id}`).not.toContain(line)
        expect(exported.value.warnings.some((w) => w.includes(line))).toBe(false)
      }
      const parsed = parseItem(exported.value.text)
      if (!parsed.ok) throw Error(parsed.error)
      const result = importCraftState(
        catalog,
        input.baseId,
        parsed.item,
        inspectItem(parsed.item, dictionary),
        input.sockets,
      )
      if (!result.ok) throw Error(`${locale} ${a.id}: ${result.error}`)
      expect(result.value.runeSourceLines).toEqual(
        socketEffects(catalog, input).flatMap((e) => e.augment.lines),
      )
      expect(result.value.sourceText).toBe(exported.value.text)
      const replaced = applyCraftStep(catalog, result.value, {
        kind: 'socket',
        socketIndex: 0,
        augmentId: 'pob2:augment:["Iron Rune","armour"]',
      })
      if (!replaced.ok) throw Error(replaced.error)
      expect(replaced.value.sourceText).toBe(result.value.sourceText)
      expect(replaced.value.runeSourceLines).toEqual(result.value.runeSourceLines)
    }
})

it('仅沿已核对锻造基底资格，隐藏变体与特殊孔不能扩权', () => {
  for (const category of ['helmet', 'boots']) {
    const a = idols.find((a) => a.category === category)
    const type = category === 'helmet' ? 'Helmet' : 'Boots'
    const base = catalog.bases.find(
      (b) =>
        b.type === type &&
        b.runeforged &&
        !b.hidden &&
        !b.variantList &&
        b.tags.includes('runeforged'),
    )
    if (!a || !base) throw Error(`missing ${category}`)
    expect(createCraftState(catalog, { ...withIdol(a), baseId: base.id }).ok).toBe(true)
    const s = state(category)
    for (const patch of [
      { hidden: true },
      { variantList: ['unknown'] },
      { runeforged: true },
      { implicit: 'Has 2 Sockets' },
    ]) {
      const forged = {
        ...catalog,
        bases: catalog.bases.map((b) => (b.id === s.baseId ? { ...b, ...patch } : b)),
      }
      expect(socketCandidates(forged, s)).toEqual([])
    }
  }
})
it('对象、阈值、周期、条件与冲刺单位不能省略或混用，Bonded不激活', () => {
  const mutations = [
    ['helmet', 'Idol of Egrin', 'Enemies take 6% increased Damage'],
    ['helmet', 'Primate Idol', '15% increased maximum Life'],
    ['helmet', 'Bear Idol', '10% increased Area of Effect of Curses'],
    ['helmet', 'Carved Cunning', 'Enemies cannot Evade your Hits'],
    [
      'helmet',
      'Carved Mischief',
      'Gain Guard equal to 10% of maximum Runic Ward for 4 seconds on taking Savage Hit',
    ],
    [
      'helmet',
      'Carved Mischief',
      'Gain Guard equal to 10% of maximum Life for 6 seconds on taking Savage Hit',
    ],
    ['helmet', 'Carved Tenacity', 'Enemies have no Critical Damage Bonus for 4 seconds'],
    ['boots', 'Idol of Yeena', '30% increased Skill Effect Duration'],
    ['boots', 'Carved Cunning', 'Gain Onslaught for 4 seconds'],
    ['boots', 'Carved Majesty', '1% increased Movement Speed while Sprinting'],
    ['boots', 'Carved Tenacity', 'Your speed is Unaffected by Slows'],
  ]
  for (const [category, name, line] of mutations) {
    const a = idols.find((a) => a.category === category && a.name === name)
    if (!a || !line) throw Error('missing mutation')
    expect(
      runeSocketContributionError(catalog, { ...withIdol(a), runeSourceLines: [line] }),
    ).not.toBe(null)
  }
  for (const a of idols) {
    expect(socketEffects(catalog, withIdol(a))[0]?.augment.lines).toEqual(a.lines)
    expect(
      runeSocketContributionError(catalog, {
        ...withIdol(a),
        runeSourceLines: a.bonded?.lines ?? [],
      }),
    ).not.toBe(null)
  }
})

it('固定逐占位metadata不容改写，头盔Guard比例与时长分开', () => {
  for (const a of idols) {
    const line = a.lines[0]
    if (!line) throw Error('missing line')
    expect(
      scaleArmourIdol(
        {
          ...catalog,
          scalability: {
            ...catalog.scalability,
            [line]: [{ scalable: false, formats: ['unknown'] }],
          },
        },
        a,
        0,
      ),
    ).toBe(null)
    expect(scaleArmourIdol(catalog, a, 0)?.lines).toEqual(a.lines)
  }
  const guard = idols.find((a) => a.category === 'helmet' && a.name === 'Carved Mischief')
  if (!guard) throw Error('missing guard')
  // 只核对静态缩放模型；当前头盔没有恐惧60%工艺入口。
  expect(scaleArmourIdol(catalog, guard, 60)?.lines).toEqual([
    'Gain Guard equal to 16% of maximum Life for 4 seconds on taking Savage Hit',
  ])
})
