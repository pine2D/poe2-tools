import { astridSourceValid } from './astridRune'
import type { CatalogAugment, CraftCatalog } from './catalog'
import type { CraftState } from './rehearsal'
import { scaleStatLineByEffect, statScalabilitySourceHash } from './statScalability'
import { isBasicTalismanBase } from './talismans'

// 固定MIT ModRunes来源的六条部位记录。localMod是整条元字段，不代替逐行效果归属。
const RECORDS: readonly CatalogAugment[] = [
  {
    id: 'pob2:augment:["Ancient Rune of Animosity","talisman"]',
    name: 'Ancient Rune of Animosity',
    category: 'talisman',
    type: 'Rune',
    localMod: false,
    lines: ['Gain 2 Druidic Prowess when you Heavy Stun a Rare or Unique Enemy'],
    statOrder: [6710],
    tradeHashes: {
      '3444646646': ['Gain 2 Druidic Prowess when you Heavy Stun a Rare or Unique Enemy'],
    },
    levelReq: 30,
    limit: 1,
    canSocketInChakraSlots: true,
    canSocketInUniqueItems: true,
    canSocketInJewellery: true,
    canSocketInCorruptedSanctified: true,
    bonded: { lines: ['40% increased Stun Buildup'], statOrder: [1051] },
  },
  ...['one hand mace', 'two hand mace', 'talisman'].map(
    (category): CatalogAugment => ({
      id: `pob2:augment:${JSON.stringify(['Rune of Vital Flame', category])}`,
      name: 'Rune of Vital Flame',
      category,
      type: 'Rune',
      localMod: false,
      lines: ['Adds 13 to 16 Fire Damage', '15% of Skill Mana Costs Converted to Life Costs'],
      statOrder: [832, 4743],
      tradeHashes: {
        '709508406': ['Adds 13 to 16 Fire Damage'],
        '2480498143': ['15% of Skill Mana Costs Converted to Life Costs'],
      },
      levelReq: 15,
      limit: 1,
      canSocketInChakraSlots: true,
      canSocketInUniqueItems: true,
      canSocketInJewellery: true,
      canSocketInCorruptedSanctified: true,
      bonded: { lines: ['30% increased Ignite Magnitude'], statOrder: [1077] },
    }),
  ),
  {
    id: 'pob2:augment:["Legacy of Amor Mandragora","talisman"]',
    name: 'Legacy of Amor Mandragora',
    category: 'talisman',
    type: 'Rune',
    localMod: false,
    lines: ['Gain 1 Druidic Prowess for every 20 total Rage spent'],
    statOrder: [6772],
    tradeHashes: { '1273508088': ['Gain 1 Druidic Prowess for every 20 total Rage spent'] },
    levelReq: 65,
    limit: 1,
    limitId: 'AldursLegacyLimit1',
    canSocketInChakraSlots: true,
    canSocketInUniqueItems: true,
    canSocketInCorruptedSanctified: true,
    bonded: { lines: ['Enemies in your Presence are Hindered'], statOrder: [4694] },
  },
  {
    id: 'pob2:augment:["Legacy of Spiteful Floret","talisman"]',
    name: 'Legacy of Spiteful Floret',
    category: 'talisman',
    type: 'Rune',
    localMod: false,
    lines: ['Every 5 Rage also grants 5% of Damage taken Recouped as Life'],
    statOrder: [10571],
    tradeHashes: { '1895552497': ['Every 5 Rage also grants 5% of Damage taken Recouped as Life'] },
    levelReq: 65,
    limit: 1,
    limitId: 'AldursLegacyLimit1',
    canSocketInChakraSlots: true,
    canSocketInUniqueItems: true,
    canSocketInCorruptedSanctified: true,
    bonded: { lines: ['Attacks have 20% chance to cause Bleeding'], statOrder: [2270] },
  },
]
export const SPECIAL_MARTIAL_RUNE_NAMES: readonly string[] = [
  ...new Set(RECORDS.map((r) => r.name)),
]
const SCALABLE: Readonly<Record<string, readonly (readonly boolean[])[]>> = {
  'Ancient Rune of Animosity': [[true]],
  'Rune of Vital Flame': [[true, true], [true]],
  'Legacy of Amor Mandragora': [[false, false]],
  'Legacy of Spiteful Floret': [[false, true]],
}
export function isSpecialMartialRuneId(id: unknown): boolean {
  return RECORDS.some((r) => r.id === id)
}
const normalize = (line: string) => line.replace(/\d+/g, '#')
function sameData(actual: unknown, expected: unknown): boolean {
  if (actual === expected) return true
  if (!actual || !expected || typeof actual !== 'object' || typeof expected !== 'object')
    return false
  if (Array.isArray(actual) !== Array.isArray(expected)) return false
  const left = actual as Record<string, unknown>,
    right = expected as Record<string, unknown>
  return (
    Object.keys(left).length === Object.keys(right).length &&
    Object.keys(right).every((key) => Object.hasOwn(left, key) && sameData(left[key], right[key]))
  )
}
/** 默认核对原目录；有效副本只允许已声明可增效的数值变化，其余元字段仍需完整一致。 */
export function isSpecialMartialRune(augment: CatalogAugment, effective = false): boolean {
  const source = RECORDS.find((r) => r.id === augment.id)
  if (!source) return false
  const { lines, ...metadata } = augment
  const { lines: patterns, ...expected } = source
  if (!sameData(metadata, expected) || !Array.isArray(lines) || lines.length !== patterns.length)
    return false
  if (!effective) return sameData(lines, patterns)
  return patterns.every((pattern, i) => {
    const line = lines[i]
    if (typeof line !== 'string' || normalize(line) !== normalize(pattern)) return false
    const base = pattern.match(/\d+/g) ?? []
    const values = line.match(/\d+/g) ?? []
    return values.every(
      (value, j) =>
        Number.isSafeInteger(Number(value)) &&
        Number(value) >= Number(base[j]) &&
        (SCALABLE[source.name]?.[i]?.[j] === true || value === base[j]),
    )
  })
}

export function specialMartialRuneFits(
  catalog: CraftCatalog,
  state: CraftState,
  augment: CatalogAugment,
): boolean {
  if (
    !isSpecialMartialRune(augment) ||
    !astridSourceValid(catalog) ||
    catalog.augments?.filter((a) => a.id === augment.id).length !== 1 ||
    (typeof state.sourceText === 'string' &&
      state.sourceText.split(/\r?\n/).some((line) => line.trim() === 'Sanctified'))
  )
    return false
  const base = catalog.bases.find((b) => b.id === state.baseId)
  if (!base) return false
  if (augment.category === 'talisman') return isBasicTalismanBase(base)
  const one = augment.category === 'one hand mace'
  return (
    base.type === (one ? 'One Hand Mace' : 'Two Hand Mace') &&
    !base.hidden &&
    !base.runeforged &&
    base.variantList === undefined &&
    !base.tags.includes('not_for_sale') &&
    base.tags.includes('weapon') &&
    base.tags.includes(one ? 'onehand' : 'twohand') &&
    !base.tags.includes(one ? 'twohand' : 'onehand') &&
    !base.tags.some((tag) => ['wand', 'staff', 'warstaff'].includes(tag)) &&
    !(base.tags.includes('one_hand_weapon') && !one) &&
    !(base.tags.includes('two_hand_weapon') && one)
  )
}

export function scaleSpecialMartialRune(
  catalog: CraftCatalog,
  augment: CatalogAugment,
  increase: number,
): CatalogAugment | null {
  if (
    !isSpecialMartialRune(augment) ||
    !astridSourceValid(catalog) ||
    statScalabilitySourceHash(catalog) === null
  )
    return null
  const lines: string[] = []
  for (const [i, line] of augment.lines.entries()) {
    const flags = SCALABLE[augment.name]?.[i]
    const metadata = catalog.scalability?.[line]
    if (
      !flags ||
      metadata?.length !== flags.length ||
      metadata.some((s, j) => s.scalable !== flags[j] || s.formats.length !== 0)
    )
      return null
    const scaled = scaleStatLineByEffect(line, line, metadata, increase)
    if (!scaled.ok) return null
    lines.push(scaled.value)
  }
  return { ...augment, lines }
}

/** 条件与费用保留完整语义；火伤行继续参与普通武器数值合计。 */
export function isSpecialMartialConditionLine(line: string): boolean {
  return /^(?:Gain [1-9]\d* Druidic Prowess when you Heavy Stun a Rare or Unique Enemy|[1-9]\d*% of Skill Mana Costs Converted to Life Costs|Gain 1 Druidic Prowess for every 20 total Rage spent|Every 5 Rage also grants [1-9]\d*% of Damage taken Recouped as Life)$/.test(
    line,
  )
}
export function specialMartialSourceMatches(
  expected: readonly string[],
  actual: readonly string[],
): boolean {
  const select = (lines: readonly string[]) => lines.filter(isSpecialMartialConditionLine).sort()
  return sameData(select(expected), select(actual))
}
export function specialMartialLimitKey(augment: CatalogAugment): string | null {
  return isSpecialMartialRune(augment) ? (augment.limitId ?? augment.name) : null
}
export function specialMartialSocketError(
  catalog: CraftCatalog,
  state: CraftState,
  index: number,
  id: string,
): string | null {
  const augment = catalog.augments?.find((a) => a.id === id)
  const key = augment && specialMartialLimitKey(augment)
  if (!key) return null
  return (state.sockets ?? []).some((old, i) => {
    const other = catalog.augments?.find((a) => a.id === old)
    return i !== index && other && specialMartialLimitKey(other) === key
  })
    ? '该材料已达到本件限量；两种遗产符文共用限量，请替换已有同组孔位。'
    : null
}
