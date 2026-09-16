import { astridSourceValid } from './astridRune'
import type { CraftCatalog } from './catalog'
import { INFLUENCE_RUNES, isInfluenceRune } from './influenceRunes'
import { hasProjectCapability } from './projectCapability'
import { statScalabilitySourceHash } from './statScalability'

export const INFLUENCE_RUNE_RULES_VERSION = 'basic-2026-09-17-v93'
const legacyRunes = INFLUENCE_RUNES.filter((rule) => rule.tag !== 'destruction')
const ids = new Set(
  legacyRunes.map((rule) => `pob2:augment:${JSON.stringify([rule.name, rule.category])}`),
)
const lines = new Set(legacyRunes.map((rule) => `Can roll ${rule.label} modifiers`))
const modifierId = /^(?:Time|Marksman|Berserk|Soul|Decay)Influence\w+$/

/** 固定身份识别不依赖可变目录；数组、未来、嵌套指引与报价均检查自有数据属性。 */
export function requiresInfluenceRuneProjectVersion(input: unknown): boolean {
  return hasProjectCapability(
    input,
    (properties) =>
      legacyRunes.some((rule) => Object.hasOwn(properties, `augment:${rule.name}`)) ||
      Object.values(properties).some(
        (property) =>
          typeof property.value === 'string' &&
          (ids.has(property.value) || lines.has(property.value) || modifierId.test(property.value)),
      ),
  )
}

export function influenceRuneProjectCapabilityError(
  input: unknown,
  catalog: CraftCatalog,
): string | null {
  if (!requiresInfluenceRuneProjectVersion(input)) return null
  const hash = catalog._meta.sources.find(
    (source) => source.path === 'src/Data/ModRunes.lua',
  )?.sha256
  if (
    !astridSourceValid(catalog) ||
    input === null ||
    typeof input !== 'object' ||
    Object.getOwnPropertyDescriptor(input, 'augmentSourceHash')?.value !== hash
  )
    return '扩展词缀池符文的固定来源指纹缺失或已改变，不能恢复。'
  if (statScalabilitySourceHash(catalog) === null) return '扩展词缀池符文的属性缩放来源无效。'
  for (const id of ids) {
    const entries = catalog.augments?.filter((augment) => augment.id === id) ?? []
    const augment = entries[0]
    if (
      entries.length !== 1 ||
      !augment ||
      !isInfluenceRune(augment) ||
      catalog.scalability?.[augment.lines[0] as string]?.length !== 0
    )
      return '扩展词缀池符文的精确身份、绑定或声明元数据无效。'
  }
  return null
}
