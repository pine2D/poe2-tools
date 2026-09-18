import { armourIdolSourceLines, isArmourIdol, isArmourIdolEffectLine } from './armourIdols'
import { isAstridCapacityLine, isAstridRune } from './astridRune'
import type { CatalogAugment } from './catalog'
import {
  COMBAT_ARMOUR_TOTALS,
  isCombatArmourRune,
  readCombatArmourRuneLine,
} from './combatArmourRuneEffects'
import { conditionalArmourRuneKind, isConditionalArmourRune } from './conditionalArmourRunes'
import { isExtendedArmourRune, readExtendedArmourRuneLine } from './extendedArmourRuneEffects'
import { isInfluenceRune, isInfluenceRuneLine } from './influenceRunes'
import { isSerleCapacityLine, isSerleRune } from './serleRune'
import { ARMOUR_SOUL_TOTALS, isSupportedSoulCore, readSoulCoreLine } from './soulCoreEffects'
import { isWardArmourRune, readWardRuneLine } from './wardRuneEffects'

export type RuneEffectKey =
  | keyof typeof COMBAT_ARMOUR_TOTALS
  | keyof typeof ARMOUR_SOUL_TOTALS
  | 'Fire'
  | 'Cold'
  | 'Lightning'
  | 'Defences'
  | 'Life'
  | 'Mana'
  | 'ManaRegeneration'
  | 'StunThreshold'
  | 'FlaskRecovery'
  | 'Strength'
  | 'Dexterity'
  | 'Intelligence'
  | 'Ward'
  | 'WardRegeneration'
  | 'LifeRegeneration'
  | 'WardIncreased'
export type RuneEffectTotals = Record<RuneEffectKey, number>

const RESISTANCE = /^\+([1-9]\d*)% to (Fire|Cold|Lightning) Resistance$/
const DEFENCES = /^([1-9]\d*)% increased Armour, Evasion and Energy Shield$/
const FLAT =
  /^\+([1-9]\d*) to (maximum Life|maximum Mana|Stun Threshold|Strength|Dexterity|Intelligence)$/
const INCREASED =
  /^([1-9]\d*)% increased (Mana Regeneration Rate|Life and Mana Recovery from Flasks)$/
const FLAT_KEYS = {
  'maximum Life': 'Life',
  'maximum Mana': 'Mana',
  'Stun Threshold': 'StunThreshold',
  Strength: 'Strength',
  Dexterity: 'Dexterity',
  Intelligence: 'Intelligence',
} as const
export const RUNE_EFFECT_LABELS: Record<RuneEffectKey, string> = {
  LifeRegeneration: '每秒生命再生',
  WardIncreased: '结界提高',
  Ward: '符文结界',
  WardRegeneration: '结界再生提高',
  PhysicalThornsMin: '物理荆棘伤害下限',
  PhysicalThornsMax: '物理荆棘伤害上限',
  LightningThornsMin: '闪电荆棘伤害下限',
  LightningThornsMax: '闪电荆棘伤害上限',
  MinionPhysicalAsLightning: '召唤生物承受的物理伤害视为闪电',
  DebuffExpiry: '减益效果消退加快',
  ShockReduction: '感电效果降低',
  Chaos: '混沌抗性',
  GoldQuantity: '金币数量提高',
  SlowReduction: '减速强度降低',
  ConvertStrength: '需求转换为力量',
  ConvertDexterity: '需求转换为敏捷',
  ConvertIntelligence: '需求转换为智慧',
  Fire: '火焰',
  Cold: '冰霜',
  Lightning: '闪电',
  Defences: '防御提高',
  Life: '生命',
  Mana: '魔力',
  ManaRegeneration: '魔力再生提高',
  StunThreshold: '晕眩门槛',
  FlaskRecovery: '药剂生命和魔力回复提高',
  Strength: '力量',
  Dexterity: '敏捷',
  Intelligence: '智慧',
}
const emptyTotals = (): RuneEffectTotals => ({
  LifeRegeneration: 0,
  WardIncreased: 0,
  Ward: 0,
  WardRegeneration: 0,
  ...COMBAT_ARMOUR_TOTALS,
  ...ARMOUR_SOUL_TOTALS,
  Fire: 0,
  Cold: 0,
  Lightning: 0,
  Defences: 0,
  Life: 0,
  Mana: 0,
  ManaRegeneration: 0,
  StunThreshold: 0,
  FlaskRecovery: 0,
  Strength: 0,
  Dexterity: 0,
  Intelligence: 0,
})
const TIERS = ['Lesser ', '', 'Greater ', 'Perfect '] as const
const FAMILIES = {
  'Desert Rune': { key: 'Fire', localMod: false },
  'Glacial Rune': { key: 'Cold', localMod: false },
  'Storm Rune': { key: 'Lightning', localMod: false },
  'Iron Rune': { key: 'Defences', localMod: true },
  'Body Rune': { key: 'Life', localMod: false },
  'Mind Rune': { key: 'Mana', localMod: false },
  'Inspiration Rune': { key: 'ManaRegeneration', localMod: false },
  'Stone Rune': { key: 'StunThreshold', localMod: false },
  'Vision Rune': { key: 'FlaskRecovery', localMod: false },
  'Robust Rune': { key: 'Strength', localMod: false },
  'Adept Rune': { key: 'Dexterity', localMod: false },
  'Resolve Rune': { key: 'Intelligence', localMod: false },
} as const

/** 解析普通防具符文的完整效果；任一未知行都会拒绝，Bonded 不在输入范围内。 */
export function parseRuneEffectTotals(lines: readonly string[]): RuneEffectTotals | null {
  const totals = emptyTotals()
  for (const line of armourIdolSourceLines(lines)) {
    // 条件效果另行核对完整语义，不属于可加的本地防御或角色数值。
    if (
      isArmourIdolEffectLine(line) ||
      conditionalArmourRuneKind(line) ||
      isInfluenceRuneLine(line) ||
      isAstridCapacityLine(line) ||
      isSerleCapacityLine(line)
    )
      continue
    const combat =
      readCombatArmourRuneLine(line) ?? readWardRuneLine(line) ?? readExtendedArmourRuneLine(line)
    if (combat) {
      for (const [key, value] of Object.entries(combat)) {
        const total = addRuneEffect(key as RuneEffectKey, totals[key as RuneEffectKey], value)
        if (total === null) return null
        totals[key as RuneEffectKey] = total
      }
      continue
    }
    const soul = readSoulCoreLine(line, 'armour')
    if (soul) {
      const keys: RuneEffectKey[] =
        soul.key === 'AllElemental' ? ['Fire', 'Cold', 'Lightning'] : [soul.key as RuneEffectKey]
      for (const key of keys) {
        if (!Number.isSafeInteger(totals[key] + soul.value)) return null
        totals[key] += soul.value
      }
      continue
    }
    const resistance = RESISTANCE.exec(line)
    const defences = DEFENCES.exec(line)
    const flat = FLAT.exec(line)
    const increased = INCREASED.exec(line)
    const key =
      resistance?.[2] ??
      (defences
        ? 'Defences'
        : flat?.[2]
          ? FLAT_KEYS[flat[2] as keyof typeof FLAT_KEYS]
          : increased?.[2]
            ? increased[2] === 'Mana Regeneration Rate'
              ? 'ManaRegeneration'
              : 'FlaskRecovery'
            : undefined)
    const raw = resistance?.[1] ?? defences?.[1] ?? flat?.[1] ?? increased?.[1]
    if (!key || !raw) return null
    const total = totals[key as RuneEffectKey] + Number(raw)
    if (!Number.isSafeInteger(total)) return null
    totals[key as RuneEffectKey] = total
  }
  return totals
}

/** 身份、类别、本地标志和完整效果语义必须一致。 */
export function isSupportedArmourRune(augment: CatalogAugment): boolean {
  if (isInfluenceRune(augment) && !['weapon', 'caster'].includes(augment.category)) return true
  if (isAstridRune(augment) && augment.category === 'armour') return true
  if (isSerleRune(augment) && augment.category === 'armour') return true
  if (
    isConditionalArmourRune(augment) ||
    isCombatArmourRune(augment) ||
    isWardArmourRune(augment) ||
    isExtendedArmourRune(augment)
  )
    return true
  const family = Object.entries(FAMILIES).find(([name]) =>
    TIERS.some((tier) => augment.name === `${tier}${name}`),
  )?.[1]
  if (
    !family ||
    augment.category !== 'armour' ||
    augment.type !== 'Rune' ||
    augment.localMod !== family.localMod ||
    augment.limit !== undefined ||
    augment.limitId !== undefined ||
    augment.isSocketBound === true
  )
    return false
  const totals = parseRuneEffectTotals(augment.lines)
  if (totals === null || augment.lines.length !== 1) return false
  return (Object.keys(totals) as RuneEffectKey[]).every((key) =>
    key === family.key ? totals[key] > 0 : totals[key] === 0,
  )
}

export function sumRuneEffects(augments: readonly CatalogAugment[]): RuneEffectTotals | null {
  const totals = emptyTotals()
  for (const augment of augments) {
    if (
      !isArmourIdol(augment, true) &&
      !isSupportedArmourRune(augment) &&
      !(isSupportedSoulCore(augment) && augment.category !== 'weapon')
    )
      return null
    const contribution = parseRuneEffectTotals(augment.lines)
    if (contribution === null) return null
    for (const key of Object.keys(totals) as RuneEffectKey[]) {
      const total = addRuneEffect(key, totals[key], contribution[key])
      if (total === null) return null
      totals[key] = total
    }
  }
  return totals
}

/** v56 新增的普通防具家族，用于旧项目语义门禁。 */
export function isUtilityArmourRune(augment: CatalogAugment): boolean {
  return (
    isSupportedArmourRune(augment) &&
    !['Desert Rune', 'Glacial Rune', 'Storm Rune', 'Iron Rune'].some((name) =>
      TIERS.some((tier) => augment.name === `${tier}${name}`),
    )
  )
}

/** 生命再生先回到百分之一整数网格再求和，其他效果保持整数约束。 */
function addRuneEffect(key: RuneEffectKey, left: number, right: number): number | null {
  const scale = key === 'LifeRegeneration' ? 100 : 1
  const a = Math.round(left * scale)
  const b = Math.round(right * scale)
  const total = a + b
  return Number.isSafeInteger(a) &&
    Number.isSafeInteger(b) &&
    a / scale === left &&
    b / scale === right &&
    Number.isSafeInteger(total)
    ? total / scale
    : null
}
