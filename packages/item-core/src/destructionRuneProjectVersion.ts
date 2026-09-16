import { astridSourceValid } from './astridRune'
import type { CraftCatalog } from './catalog'
import { isDestructionAffix } from './destructionEffects'
import { isInfluenceRune } from './influenceRunes'
import { hasProjectCapability } from './projectCapability'
import { statScalabilitySourceHash } from './statScalability'

export const DESTRUCTION_RUNE_RULES_VERSION = 'basic-2026-09-17-v94'
const ids = new Set(
  ['weapon', 'caster'].map(
    (category) => `pob2:augment:${JSON.stringify(["Thrud's Might", category])}`,
  ),
)
const lines = new Set(['Can roll Destruction modifiers'])
const modifierId = /^DestructionInfluence\w+$/
const modifierIds = [
  'Physical',
  'Fire',
  'Lightning',
  'Cold',
  'Elemental',
  'Chaos',
  'Mana',
  'Speed',
  'Critical',
].map((key) => `DestructionInfluence${key}ModifierEffect`)

/** 固定身份识别不依赖可变目录；数组、未来、嵌套指引与报价均检查自有数据属性。 */
export function requiresDestructionRuneProjectVersion(input: unknown): boolean {
  return hasProjectCapability(
    input,
    (properties) =>
      Object.hasOwn(properties, "augment:Thrud's Might") ||
      Object.values(properties).some(
        (property) =>
          typeof property.value === 'string' &&
          (ids.has(property.value) || lines.has(property.value) || modifierId.test(property.value)),
      ),
  )
}

export function destructionRuneProjectCapabilityError(
  input: unknown,
  catalog: CraftCatalog,
): string | null {
  if (!requiresDestructionRuneProjectVersion(input)) return null
  const hash = catalog._meta.sources.find(
    (source) => source.path === 'src/Data/ModRunes.lua',
  )?.sha256
  if (
    !astridSourceValid(catalog) ||
    input === null ||
    typeof input !== 'object' ||
    Object.getOwnPropertyDescriptor(input, 'augmentSourceHash')?.value !== hash
  )
    return '毁灭符文的固定来源指纹缺失或已改变，不能恢复。'
  const scalabilityHash = statScalabilitySourceHash(catalog)
  if (
    scalabilityHash === null ||
    Object.getOwnPropertyDescriptor(input, 'scalabilitySourceHash')?.value !== scalabilityHash
  )
    return '毁灭符文的属性缩放来源无效。'
  for (const id of ids) {
    const entries = catalog.augments?.filter((augment) => augment.id === id) ?? []
    const augment = entries[0]
    if (
      entries.length !== 1 ||
      !augment ||
      !isInfluenceRune(augment) ||
      catalog.scalability?.[augment.lines[0] as string]?.length !== 0
    )
      return '毁灭符文的精确身份、绑定或声明元数据无效。'
  }
  for (const modId of modifierIds) {
    const mod = catalog.modifiers.find((entry) => entry.id === modId)
    if (!mod || !isDestructionAffix(catalog, { modId, lines: [...mod.lines] }))
      return '毁灭词缀的固定目录身份或属性缩放声明无效。'
  }
  return null
}
