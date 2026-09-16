import type { CatalogModifierData, CraftCatalog } from './catalog'
import { modifierLayers } from './modifierLayers'
import { readNumericValues } from './numeric'
import { supportsItemQuality } from './quality'
import { type CraftResult, type CraftState, createCraftState } from './rehearsal'
import { sumRuneEffects } from './runeEffects'
import { isHorrorSocketAffix } from './socketAmplification'
import { socketEffects } from './sockets'
import { isKnownWardImplicit, readImplicitWard, wardModifierKind } from './wardDefences'

export type DefenceStat = 'Armour' | 'Evasion' | 'EnergyShield' | 'Ward'
export interface DefenceEstimate {
  stat: DefenceStat
  base: number
  flat: number
  increased: number
  runeIncreased: number
  quality: number
  value: number
}

const DEFENCE_TEXT = /\b(?:Armour|Evasion(?: Rating)?|Energy Shield|Runic Ward|Defences?)\b/i
const SPECIAL_TEXT =
  /\b(?:per (?:player )?level|Ward|Runic Ward|converted?|overrides?|applies|alternate quality|Quality has|sockets?|socketed|augments?|runes?|bonded)\b/i
const SPECIAL_MODEL_TEXT =
  /\b(?:Quality|Ward|sockets?|socketed|augments?|runes?|bonded|infusion)\b/i
const LOCAL_GROUP = /^Local/
const DIRECT_LOCAL_GROUPS = new Set([
  'LocalPhysicalDamageReductionRating',
  'LocalEvasionRating',
  'LocalEnergyShield',
  'LocalBaseArmourAndEvasionRating',
  'LocalBaseArmourAndEnergyShield',
  'LocalBaseEvasionRatingAndEnergyShield',
  'LocalPhysicalDamageReductionRatingPercent',
  'LocalEvasionRatingIncreasePercent',
  'LocalEnergyShieldPercent',
  'LocalArmourAndEvasion',
  'LocalArmourAndEnergyShield',
  'LocalEvasionAndEnergyShield',
  'LocalArmourAndEvasionAndEnergyShield',
  'LocalRunicWardIncreasePercent',
])
const DEFENCE_COMBO =
  '(?:Armour|Evasion|EnergyShield|ArmourAndEvasion|ArmourAndEnergyShield|EvasionAndEnergyShield)'
const STUN_LOCAL_GROUP = new RegExp(`^Local${DEFENCE_COMBO}AndStunThreshold$`)
const MIXED_LOCAL_GROUP = new RegExp(
  `^LocalIncreased${DEFENCE_COMBO}(?:AndLife|AndMana|AndSpiritNoLife|AndManaNoLife|AndBase)$`,
)
const FLAT: [RegExp, DefenceStat][] = [
  [/^\+\([^)]+\) to Armour$/, 'Armour'],
  [/^\+\([^)]+\) to Evasion Rating$/, 'Evasion'],
  [/^\+\([^)]+\) to maximum Energy Shield$/, 'EnergyShield'],
]
const INCREASED: [RegExp, DefenceStat[]][] = [
  [/^\([^)]+\)% increased Runic Ward$/, ['Ward']],
  [/^\([^)]+\)% increased Armour$/, ['Armour']],
  [/^\([^)]+\)% increased Evasion Rating$/, ['Evasion']],
  [/^\([^)]+\)% increased (?:maximum )?Energy Shield$/, ['EnergyShield']],
  [/^\([^)]+\)% increased Armour and Evasion$/, ['Armour', 'Evasion']],
  [/^\([^)]+\)% increased Armour and Energy Shield$/, ['Armour', 'EnergyShield']],
  [/^\([^)]+\)% increased Evasion and Energy Shield$/, ['Evasion', 'EnergyShield']],
  [
    /^\([^)]+\)% increased Armour, Evasion and Energy Shield$/,
    ['Armour', 'Evasion', 'EnergyShield'],
  ],
]

function fail(error: string): CraftResult<DefenceEstimate[]> {
  return { ok: false, error }
}

function classify(line: string): { kind: 'flat' | 'increased'; stats: DefenceStat[] } | null {
  for (const [pattern, stat] of FLAT) if (pattern.test(line)) return { kind: 'flat', stats: [stat] }
  for (const [pattern, stats] of INCREASED)
    if (pattern.test(line)) return { kind: 'increased', stats }
  return null
}

function relevantLocal(mod: CatalogModifierData): boolean {
  return LOCAL_GROUP.test(mod.group) && mod.lines.some((line) => DEFENCE_TEXT.test(line))
}

function knownLocalGroup(group: string): boolean {
  return (
    DIRECT_LOCAL_GROUPS.has(group) || STUN_LOCAL_GROUP.test(group) || MIXED_LOCAL_GROUP.test(group)
  )
}

function implicitAffectsDefence(line: string): boolean {
  if (isKnownWardImplicit(line)) return false
  const number = String.raw`[+-]?(?:\d+(?:\.\d+)?(?:\([^)]+\))?|\([^)]+\))`
  return (
    new RegExp(`^${number}(?:%?\\s+)to (?:Armour|Evasion Rating|maximum Energy Shield)$`, 'i').test(
      line,
    ) ||
    /% (?:increased|reduced|more|less) (?:Armour|Evasion Rating|(?:maximum )?Energy Shield)(?:$| and )/i.test(
      line,
    ) ||
    SPECIAL_TEXT.test(line)
  )
}

/** 按固定 PoB 快照公式估算防具的四类基础防御。 */
export function estimateDefences(
  catalog: CraftCatalog,
  state: CraftState,
): CraftResult<DefenceEstimate[]> {
  const base = catalog.bases.find((entry) => entry.id === state.baseId)
  if (!base) return fail(`基底 ${state.baseId} 不在制作目录中。`)
  if (!supportsItemQuality(base)) return fail('该基底类别或特殊品质规则暂不支持防御估算。')
  if (Object.keys(base.properties).some((key) => /Ward/i.test(key) && key !== 'Ward'))
    return fail('该基底使用尚未支持的特殊 Ward 防御规则。')
  if (base.implicit?.split('\n').some(implicitAffectsDefence))
    return fail('该基底的固有属性会影响防御，暂不支持估算。')
  if (state.sourceText !== null && state.sockets === undefined)
    return fail('导入装备的孔位状态未知，不能排除孔内效果对防御的影响。')
  if (['Focus', 'Shield', 'Buckler'].includes(base.type) && state.sockets === undefined)
    return fail('该类防具的孔位状态未知；请先明确孔位状态。')
  const checked = createCraftState(catalog, state)
  if (!checked.ok) return fail(`当前制作状态无法估算：${checked.error}`)
  state = checked.value
  const implicitWard = readImplicitWard(base, state)
  if (!implicitWard.ok) return implicitWard
  const runeAugments = socketEffects(catalog, state).map(({ augment }) => augment)
  const runeTotals = sumRuneEffects(runeAugments)
  if (runeTotals === null) return fail('孔内包含尚未支持的符文效果，不能估算防御。')
  const runeIncreased = runeTotals.Defences
  if (state.quality === undefined) return fail('当前品质未知，不能估算防御。')
  const quality = state.quality
  if (!Number.isInteger(quality) || quality < 0 || quality > 30)
    return fail('品质必须是 0–30 的整数。')
  const totals: Record<DefenceStat, { flat: number; increased: number }> = {
    Armour: { flat: 0, increased: 0 },
    Evasion: { flat: 0, increased: 0 },
    EnergyShield: { flat: 0, increased: 0 },
    Ward: { flat: implicitWard.value ?? 0, increased: 0 },
  }
  for (const { attribute: affix, mod, layer } of modifierLayers(catalog, state)) {
    if (!mod) return fail(`词缀 ${affix.modId} 不在制作目录中。`)
    if (layer === 'explicit' && isHorrorSocketAffix(catalog, state, affix)) continue
    const wardKind = wardModifierKind(mod)
    if (wardKind === 'unrelated') continue
    if (
      wardKind === null &&
      (SPECIAL_MODEL_TEXT.test(mod.group) ||
        mod.lines.some((line) => SPECIAL_MODEL_TEXT.test(line)))
    )
      return fail(`词缀 ${mod.id} 使用尚未支持的特殊品质、Ward 或镶嵌增幅规则。`)
    if (!relevantLocal(mod)) continue
    if (!knownLocalGroup(mod.group)) return fail(`词缀 ${mod.id} 的本地防御组语义尚未支持。`)
    if (wardKind === null && mod.lines.some((line) => SPECIAL_TEXT.test(line)))
      return fail(`词缀 ${mod.id} 包含尚未支持的本地防御效果。`)
    const values = readNumericValues(mod.lines, affix.lines)
    if (!values.ok) return fail(`词缀 ${mod.id} 的防御数值无法读取：${values.error}`)
    let valueIndex = 0
    for (const line of mod.lines) {
      const numericCount = (line.match(/\([+-]?\d+(?:\.\d+)?[-–—][+-]?\d+(?:\.\d+)?\)/g) ?? [])
        .length
      const rule = classify(line)
      if (DEFENCE_TEXT.test(line) && rule === null)
        return fail(`词缀 ${mod.id} 包含尚未支持的本地防御模板。`)
      if (rule !== null) {
        const value = values.value[valueIndex]
        if (value === null || value === undefined)
          return fail(`词缀 ${mod.id} 的防御范围尚未掷定。`)
        for (const stat of rule.stats) totals[stat][rule.kind] += value
      }
      valueIndex += numericCount
    }
  }
  const baseValues: [DefenceStat, number | undefined][] = [
    ['Armour', base.properties.Armour],
    ['Evasion', base.properties.Evasion],
    ['EnergyShield', base.properties.EnergyShield],
    ['Ward', base.properties.Ward ?? (implicitWard.value === null ? undefined : 0)],
  ]
  return {
    ok: true,
    value: baseValues.flatMap(([stat, baseValue]) =>
      baseValue === undefined
        ? []
        : [
            {
              stat,
              base: baseValue,
              flat: totals[stat].flat,
              increased: totals[stat].increased + (stat === 'Ward' ? 0 : runeIncreased),
              runeIncreased: stat === 'Ward' ? 0 : runeIncreased,
              quality,
              value: Math.floor(
                (baseValue + totals[stat].flat) *
                  (1 + (totals[stat].increased + (stat === 'Ward' ? 0 : runeIncreased)) / 100) *
                  (1 + quality / 100) +
                  0.5,
              ),
            },
          ],
    ),
  }
}
