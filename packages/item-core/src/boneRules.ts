import {
  type BoneOmenConfig,
  type BoneRevealOmen,
  hasValidBoneOmenFields,
  isBoneRevealOmen,
} from './boneOmens'
import type { CatalogBase } from './catalog'

export const BONE_RULES = {
  gnawed_jawbone: { name: 'Gnawed Jawbone', category: 'weapon', maxItemLevel: 64, minModLevel: 0 },
  preserved_jawbone: {
    name: 'Preserved Jawbone',
    category: 'weapon',
    maxItemLevel: null,
    minModLevel: 0,
  },
  ancient_jawbone: {
    name: 'Ancient Jawbone',
    category: 'weapon',
    maxItemLevel: null,
    minModLevel: 40,
  },
  gnawed_rib: { name: 'Gnawed Rib', category: 'armour', maxItemLevel: 64, minModLevel: 0 },
  preserved_rib: { name: 'Preserved Rib', category: 'armour', maxItemLevel: null, minModLevel: 0 },
  ancient_rib: { name: 'Ancient Rib', category: 'armour', maxItemLevel: null, minModLevel: 40 },
  gnawed_collarbone: {
    name: 'Gnawed Collarbone',
    category: 'jewellery',
    maxItemLevel: 64,
    minModLevel: 0,
  },
  preserved_collarbone: {
    name: 'Preserved Collarbone',
    category: 'jewellery',
    maxItemLevel: null,
    minModLevel: 0,
  },
  ancient_collarbone: {
    name: 'Ancient Collarbone',
    category: 'jewellery',
    maxItemLevel: null,
    minModLevel: 40,
  },
} as const

export type CraftBone = keyof typeof BONE_RULES
export interface PendingDesecration extends BoneOmenConfig {
  boneId: CraftBone
  kind: 'prefix' | 'suffix'
  options?: string[]
  revealOmen?: BoneRevealOmen
  rerollOptions?: string[]
}
export interface DesecrateCraftOperation extends BoneOmenConfig {
  kind: 'desecrate'
  boneId: CraftBone
  affixKind: 'prefix' | 'suffix'
  removeModId?: string
}
export interface OfferDesecrationOperation {
  kind: 'desecration-offer'
  modIds: string[]
  revealOmen?: BoneRevealOmen
}
export interface RerollDesecrationOperation {
  kind: 'desecration-reroll'
  modIds: string[]
}
export interface RevealDesecrationOperation {
  kind: 'desecration-reveal'
  modId: string
  values: number[]
}
export type BoneCraftOperation =
  | DesecrateCraftOperation
  | OfferDesecrationOperation
  | RerollDesecrationOperation
  | RevealDesecrationOperation
export const PENDING_DESECRATION_MESSAGE = '请先完成亵渎揭示；本工具尚未实现未揭示期间的交错制作。'

const TYPES = {
  weapon: [
    'Bow',
    'Claw',
    'Crossbow',
    'Dagger',
    'Flail',
    'One Hand Axe',
    'One Hand Mace',
    'One Hand Sword',
    'Quiver',
    'Sceptre',
    'Spear',
    'Staff',
    'Two Hand Axe',
    'Two Hand Mace',
    'Two Hand Sword',
    'Wand',
  ],
  armour: ['Body Armour', 'Boots', 'Gloves', 'Helmet', 'Shield', 'Buckler', 'Focus'],
  jewellery: ['Amulet', 'Ring', 'Belt'],
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function keys(value: Record<string, unknown>, allowed: string[]) {
  return Object.keys(value).every((key) => allowed.includes(key))
}
function id(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}
function three(value: unknown): value is string[] {
  return Array.isArray(value) && value.length === 3 && value.every(id) && new Set(value).size === 3
}
export function isCraftBone(value: unknown): value is CraftBone {
  return typeof value === 'string' && Object.hasOwn(BONE_RULES, value)
}
export function isPendingDesecration(value: unknown): value is PendingDesecration {
  return (
    record(value) &&
    keys(value, [
      'boneId',
      'kind',
      'options',
      'directionOmen',
      'lichOmen',
      'revealOmen',
      'rerollOptions',
    ]) &&
    hasValidBoneOmenFields(value) &&
    isCraftBone(value.boneId) &&
    (value.kind === 'prefix' || value.kind === 'suffix') &&
    (!Object.hasOwn(value, 'options') || three(value.options)) &&
    (!Object.hasOwn(value, 'revealOmen') ||
      (isBoneRevealOmen(value.revealOmen) && three(value.options))) &&
    (!Object.hasOwn(value, 'rerollOptions') ||
      (three(value.rerollOptions) && isBoneRevealOmen(value.revealOmen) && three(value.options)))
  )
}
export function isBoneCraftOperation(value: unknown): value is BoneCraftOperation {
  if (!record(value)) return false
  if (value.kind === 'desecrate')
    return (
      keys(value, ['kind', 'boneId', 'affixKind', 'removeModId', 'directionOmen', 'lichOmen']) &&
      hasValidBoneOmenFields(value) &&
      isCraftBone(value.boneId) &&
      (value.affixKind === 'prefix' || value.affixKind === 'suffix') &&
      (!Object.hasOwn(value, 'removeModId') || id(value.removeModId))
    )
  if (value.kind === 'desecration-offer')
    return (
      keys(value, ['kind', 'modIds', 'revealOmen']) &&
      three(value.modIds) &&
      (!Object.hasOwn(value, 'revealOmen') || isBoneRevealOmen(value.revealOmen))
    )
  if (value.kind === 'desecration-reroll')
    return keys(value, ['kind', 'modIds']) && three(value.modIds)
  return (
    value.kind === 'desecration-reveal' &&
    keys(value, ['kind', 'modId', 'values']) &&
    id(value.modId) &&
    Array.isArray(value.values) &&
    value.values.length <= 32 &&
    value.values.every((entry) => typeof entry === 'number' && Number.isFinite(entry))
  )
}
export function isBoneOperationKind(value: unknown): boolean {
  return (
    value === 'desecrate' ||
    value === 'desecration-offer' ||
    value === 'desecration-reroll' ||
    value === 'desecration-reveal'
  )
}
export function boneBaseError(
  base: CatalogBase,
  itemLevel: number,
  boneId: CraftBone,
): string | null {
  const rule = BONE_RULES[boneId]
  if (!TYPES[rule.category].includes(base.type)) return '骨骼不适用于当前基底类别。'
  if (rule.maxItemLevel !== null && itemLevel > rule.maxItemLevel)
    return '啃噬骨骼只适用于物等不高于 64 的装备。'
  if (itemLevel < rule.minModLevel) return '远古骨骼要求物品等级至少 40。'
  return null
}
export function clonePendingDesecration(pending: PendingDesecration): PendingDesecration {
  return {
    ...pending,
    ...(pending.options === undefined ? {} : { options: [...pending.options] }),
    ...(pending.rerollOptions === undefined ? {} : { rerollOptions: [...pending.rerollOptions] }),
  }
}
