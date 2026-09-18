import type { CraftBone } from './boneRules'
import type { CatalogMod } from './catalog'
export const BONE_DIRECTION_OMEN_RULES = {
  sinistral_necromancy: { name: 'Omen of Sinistral Necromancy', kind: 'prefix' },
  dextral_necromancy: { name: 'Omen of Dextral Necromancy', kind: 'suffix' },
} as const
export const BONE_LICH_OMEN_RULES = {
  liege: { name: 'Omen of the Liege', tag: 'amanamu_mod' },
  sovereign: { name: 'Omen of the Sovereign', tag: 'ulaman_mod' },
  blackblooded: { name: 'Omen of the Blackblooded', tag: 'kurgal_mod' },
} as const
export type BoneDirectionOmen = keyof typeof BONE_DIRECTION_OMEN_RULES
export type BoneLichOmen = keyof typeof BONE_LICH_OMEN_RULES
export interface BoneOmenConfig {
  directionOmen?: BoneDirectionOmen
  lichOmen?: BoneLichOmen
}
export function hasValidBoneOmenFields(value: Record<string, unknown>): boolean {
  return (
    (!Object.hasOwn(value, 'directionOmen') ||
      (typeof value.directionOmen === 'string' &&
        Object.hasOwn(BONE_DIRECTION_OMEN_RULES, value.directionOmen))) &&
    (!Object.hasOwn(value, 'lichOmen') ||
      (typeof value.lichOmen === 'string' && Object.hasOwn(BONE_LICH_OMEN_RULES, value.lichOmen)))
  )
}
export function isBoneOmenConfig(value: unknown): value is BoneOmenConfig {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).every((key) => key === 'directionOmen' || key === 'lichOmen') &&
    hasValidBoneOmenFields(value as Record<string, unknown>)
  )
}
export function boneOmenError(
  config: BoneOmenConfig,
  boneId: CraftBone,
  kind?: 'prefix' | 'suffix',
): string | null {
  if (config.lichOmen && (boneId.endsWith('_rib') || boneId.endsWith('_cranium')))
    return '巫妖预兆仅支持武器与首饰，不能用于护甲骨骼。'
  if (config.directionOmen && kind && BONE_DIRECTION_OMEN_RULES[config.directionOmen].kind !== kind)
    return '所选亵渎侧与方向预兆不符。'
  return null
}
export function matchesBoneLich(mod: CatalogMod, lich: BoneLichOmen): boolean {
  return mod.desecratedOnly === true && mod.tags.includes(BONE_LICH_OMEN_RULES[lich].tag)
}

export const BONE_REVEAL_OMEN_RULES = {
  abyssal_echoes: { name: 'Omen of Abyssal Echoes' },
} as const
export type BoneRevealOmen = keyof typeof BONE_REVEAL_OMEN_RULES
export function isBoneRevealOmen(value: unknown): value is BoneRevealOmen {
  return typeof value === 'string' && Object.hasOwn(BONE_REVEAL_OMEN_RULES, value)
}
export function boneRevealOmenError(
  pending: { boneId: CraftBone; lichOmen?: BoneLichOmen },
  omen: BoneRevealOmen,
): string | null {
  if (!isBoneRevealOmen(omen)) return '未知揭示预兆。'
  if (
    (pending.boneId.startsWith('ancient_') && pending.boneId !== 'ancient_rib') ||
    pending.lichOmen
  )
    return '本工具尚未验证深渊回响与远古颚骨、远古锁骨或巫妖预兆的交互，暂不支持此组合。'
  return null
}
