import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { craftAffixCapacities } from './affixCapacity'
import { readBaseSkillVariants } from './baseSkillVariants'
import { required } from './beltTestFixture'
import { applyBoneCraft } from './boneCraft'
import type { CraftCatalog } from './catalog'
import { catalystQualityLimit } from './catalystQuality'
import { analyzeEssencePreparation } from './essencePreparation'
import { inspectItem } from './export'
import { fluxEligibleModIds } from './fluxes'
import { craftImplicitTargetCandidates } from './implicitTargets'
import { parseItem } from './parse'
import { inspectPerfectFluxCraft } from './perfectFlux'
import {
  applyCraftOperation,
  type CraftState,
  craftCandidates,
  createCraftState,
  prepareCraftOperation,
} from './rehearsal'
import { importCraftState } from './rehearsalImport'
import { inspectSkillSocketsCraft } from './skillSockets'
import {
  buildInitialSkillVariantLines,
  isSkillVariantAmulet,
  resolveSkillVariantImplicitPatterns,
} from './skillVariantAmulets'
import { socketCapacity } from './sockets'
import { craftTargetDefinitionCandidates } from './targetDefinitions'
import { analyzeCraftTargets, craftTargetCandidates } from './targets'

const catalog = JSON.parse(
  readFileSync(new URL('../../../data/craft/catalog.json', import.meta.url), 'utf8'),
) as CraftCatalog
const base = (name: string) => required(catalog.bases.find((b) => b.id === `${name} Amulet`))
function state(name: string): CraftState {
  const lines = buildInitialSkillVariantLines(base(name), 1, 10)
  if (!lines.ok) throw new Error(lines.error)
  return {
    baseId: base(name).id,
    itemLevel: 80,
    rarity: 'normal',
    sourceText: null,
    affixes: [],
    implicitLines: lines.value,
  }
}
describe('技能变体项链制作边界', () => {
  it.each(['Lament', 'Portent', 'Absent'])('%s 唯一技能保留等级且完整匹配', (name) => {
    expect(isSkillVariantAmulet(base(name))).toBe(true)
    const initial = state(name)
    expect(createCraftState(catalog, initial)).toEqual({ ok: true, value: initial })
    expect(
      resolveSkillVariantImplicitPatterns(base(name), required(initial.implicitLines)).ok,
    ).toBe(true)
    for (const lines of [
      [],
      required(initial.implicitLines).slice(1),
      [...required(initial.implicitLines), required(required(initial.implicitLines).at(-1))],
    ])
      expect(createCraftState(catalog, { ...initial, implicitLines: lines }).ok).toBe(false)
    const { implicitLines: _lines, ...missing } = initial
    expect(createCraftState(catalog, missing).ok).toBe(false)
    expect(buildInitialSkillVariantLines(base(name), 0).ok).toBe(false)
    expect(buildInitialSkillVariantLines(base(name), 1, 21).ok).toBe(false)
    expect(prepareCraftOperation(catalog, initial, 'divine').ok).toBe(false)
  })
  it('目录身份与共同容量必须精确', () => {
    for (const change of [
      { id: 'Other' },
      { name: 'Other' },
      { hidden: true },
      { runeforged: true },
      { type: 'Ring' },
      { spirit: 1 },
      { implicit: required(base('Lament').implicit).replace('-1 Prefix', '-2 Prefix') },
    ])
      expect(isSkillVariantAmulet({ ...base('Lament'), ...change })).toBe(false)
  })
  it.each([
    ['Lament', 0, 1, 2, 3],
    ['Portent', 1, 0, 3, 2],
    ['Absent', 0, 0, 2, 2],
  ] as const)('%s 按稀有度减少容量', (name, mp, ms, rp, rs) => {
    const initial = state(name)
    expect(craftAffixCapacities(catalog, initial)).toEqual({ prefix: 0, suffix: 0 })
    expect(craftAffixCapacities(catalog, { ...initial, rarity: 'magic' })).toEqual({
      prefix: mp,
      suffix: ms,
    })
    expect(craftAffixCapacities(catalog, { ...initial, rarity: 'rare' })).toEqual({
      prefix: rp,
      suffix: rs,
    })
  })
  it('Absent 普通蜕变独立升级零词缀，高级档拒绝，富豪随后添加', () => {
    const initial = state('Absent')
    expect(prepareCraftOperation(catalog, initial, 'transmutation')).toMatchObject({
      ok: true,
      value: { count: 0, state: { rarity: 'magic' } },
    })
    for (const currency of ['greater_transmutation', 'perfect_transmutation'] as const)
      expect(prepareCraftOperation(catalog, initial, currency).ok).toBe(false)
    const result = applyCraftOperation(catalog, initial, { currency: 'transmutation', modIds: [] })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.implicitLines).toEqual(initial.implicitLines)
    expect(prepareCraftOperation(catalog, result.value, 'augmentation').ok).toBe(false)
    expect(prepareCraftOperation(catalog, result.value, 'regal')).toMatchObject({
      ok: true,
      value: { count: 1, state: { rarity: 'rare' } },
    })
  })
})

it.each(['en', 'zh-CN', 'zh-TW'] as const)('三种项链的 %s 合成来源保留原文与技能', (locale) => {
  const tw = locale === 'zh-TW'
  for (const name of ['Lament', 'Portent', 'Absent']) {
    const b = base(name)
    const variants = required(readBaseSkillVariants(b))
    const skill = required(variants.variants[1])
    const entries = [
      {
        id: 'skill.synthetic',
        en: `Grants Skill: Level # ${skill.name}`,
        text: `${tw ? '賦予技能: 等級' : '获得技能: 等级'} # 合成技能`,
      },
      {
        id: 'prefix',
        en: '# Prefix Modifier allowed',
        text: tw ? '可擁有 # 個前綴詞綴' : '可拥有 # 个前缀词缀',
      },
      {
        id: 'suffix',
        en: '# Suffix Modifier allowed',
        text: tw ? '可擁有 # 個後綴詞綴' : '可拥有 # 个后缀词缀',
      },
    ]
    const english = locale === 'en'
    const common = variants.commonLines.map((line) =>
      english ? line : required(entries[line.includes('Prefix') ? 1 : 2]).text.replace('#', '-1'),
    )
    const text = [
      english ? 'Item Class: Amulets' : tw ? '物品種類: 項鍊' : '物品类别: 项链',
      english ? 'Rarity: Normal' : '稀有度: 普通',
      english ? b.name : '合成项链',
      '--------',
      english ? 'Item Level: 80' : tw ? '物品等級: 80' : '物品等级: 80',
      '--------',
      english
        ? `Grants Skill: Level 10 ${skill.name} (Max Level 15)`
        : `${required(entries[0]).text.replace('#', '10')}${tw ? '（最高等級 15）' : '（最高等级 15）'}`,
      '--------',
      english ? '{ Implicit Modifier }' : tw ? '{ 基底屬性 }' : '{ 基底属性 }',
      ...common,
    ].join('\n')
    const dictionary = {
      items: { bases: { [b.name]: '合成项链' }, uniques: {} },
      stats: { entries },
    }
    const parsed = parseItem(text)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) continue
    const imported = importCraftState(
      catalog,
      b.id,
      parsed.item,
      inspectItem(parsed.item, dictionary),
      undefined,
      undefined,
      entries,
    )
    expect(imported).toMatchObject({
      ok: true,
      value: {
        sourceText: text,
        implicitLines: [
          ...variants.commonLines,
          `Grants Skill: Level 10 ${skill.name} (Max Level 15)`,
        ],
      },
    })
  }
})

it.each(['Lament', 'Portent', 'Absent'])('%s 点金/崇高到实际容量上限且不替换技能', (name) => {
  let current = state(name)
  for (const currency of ['alchemy', 'exalted', 'exalted'] as const) {
    const prepared = prepareCraftOperation(catalog, current, currency)
    if (!prepared.ok) {
      expect(current.affixes).toHaveLength(name === 'Absent' ? 4 : 5)
      continue
    }
    let draft = prepared.value.state
    const ids: string[] = []
    for (let i = 0; i < prepared.value.count; i++) {
      const mod = required(craftCandidates(catalog, draft, currency)[0])
      ids.push(mod.id)
      draft = { ...draft, affixes: [...draft.affixes, { modId: mod.id, lines: [...mod.lines] }] }
    }
    const next = applyCraftOperation(catalog, current, { currency, modIds: ids })
    expect(next.ok).toBe(true)
    if (next.ok) current = next.value
  }
  expect(current.affixes).toHaveLength(name === 'Absent' ? 4 : 5)
  expect(current.implicitLines).toEqual(state(name).implicitLines)
})

it('技能变体没有通用固有数值目标，但查询仍有效', () => {
  expect(craftImplicitTargetCandidates(catalog, state('Lament'))).toMatchObject({
    ok: true,
    value: [
      { kind: 'granted-skill', lineIndex: 1, actual: [null] },
      { kind: 'granted-skill-sockets', lineIndex: 1, actual: [null] },
    ],
  })
})

it('Absent 显式目标建议保留零词缀蜕变准备步', () => {
  const initial = state('Absent')
  const target = required(craftCandidates(catalog, { ...initial, rarity: 'rare' }, 'exalted')[0])
  const result = analyzeCraftTargets(catalog, initial, [target.id])
  if (!result.ok) throw new Error(result.error)
  expect(result).toMatchObject({
    ok: true,
    value: {
      steps: expect.arrayContaining([
        expect.objectContaining({ currency: 'transmutation', remainingChoices: 0 }),
      ]),
    },
  })
})

it('Absent 精华准备路线保留零词缀蜕变与富豪', () => {
  const initial = state('Absent')
  const source = {
    ...catalog,
    essences:
      catalog.essences?.filter((entry) => entry.id.includes('PerfectEssenceDefences')) ?? [],
  }
  const target = required(source.essences[0]?.mods.Amulet)
  const result = analyzeEssencePreparation(source, initial, [target])
  expect(result).toMatchObject({
    ok: true,
    value: {
      routes: expect.arrayContaining([
        expect.objectContaining({
          preparations: [
            expect.objectContaining({ currency: 'transmutation', modIds: [] }),
            expect.objectContaining({ currency: 'regal' }),
          ],
        }),
      ]),
    },
  })
})

it.each(['Lament', 'Portent', 'Absent'])(
  '%s 骨骼保留所选技能，未经核对的高级机制仍拒绝',
  (name) => {
    const initial = { ...state(name), rarity: 'rare' as const }
    const result = applyBoneCraft(catalog, initial, {
      kind: 'desecrate',
      boneId: 'preserved_collarbone',
      affixKind: 'prefix',
    })
    expect(result).toMatchObject({
      ok: true,
      value: { implicitLines: initial.implicitLines, pendingDesecration: { kind: 'prefix' } },
    })
    expect(catalystQualityLimit(base(name))).toBe(20)
    expect(inspectPerfectFluxCraft(catalog, initial).ok).toBe(true)
    expect(inspectSkillSocketsCraft(catalog, initial).ok).toBe(true)
    expect(socketCapacity(catalog, initial)).toBe(0)
  },
)

it.each(['Lament', 'Portent', 'Absent'])('%s 现有转换关系不增加仅转换可达目标', (name) => {
  const initial = state(name)
  const source: CraftCatalog = {
    ...catalog,
    fluxes: JSON.parse(
      readFileSync(new URL('../../../data/craft/fluxes.json', import.meta.url), 'utf8'),
    ),
  }
  const ordinary = new Set(
    craftTargetCandidates(source, initial.baseId, initial).map((mod) => mod.id),
  )
  const flux = fluxEligibleModIds(source, base(name))
  expect([...flux.ordinary, ...flux.desecrated].filter((id) => !ordinary.has(id))).toEqual([])
  const native = craftTargetDefinitionCandidates(source, initial.baseId, initial).map(
    (mod) => mod.id,
  )
  expect(native).toEqual([...ordinary])
})
