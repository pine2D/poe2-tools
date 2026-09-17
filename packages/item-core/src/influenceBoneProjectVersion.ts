import { astridSourceValid } from './astridRune'
import type { CraftCatalog } from './catalog'
import { desecrationSourceHash } from './desecration'
import { hasProjectCapability } from './projectCapability'

export const INFLUENCE_BONE_RULES_VERSION = 'basic-2026-09-17-v95'
const sources = [
  ["Uhtred's Sidereus", 'boots', 'Chronomancy'],
  ["Kolr's Hunt", 'gloves', 'Marksman'],
  ["Thrud's Might", 'weapon', 'Destruction'],
  ["Thrud's Might", 'caster', 'Destruction'],
] as const
const boneKinds = new Set([
  'desecrate',
  'desecration-offer',
  'desecration-reroll',
  'desecration-reveal',
  'reveal',
  'putrefy',
])
function own(input: unknown, key: string): unknown {
  return input !== null && typeof input === 'object'
    ? Object.getOwnPropertyDescriptor(input, key)?.value
    : undefined
}
export function createInfluenceBoneVersionDetector(
  sources: readonly (readonly [string, string, string])[],
  modifierId: RegExp,
): (input: unknown) => boolean {
  const runeIds = new Set(
    sources.map(([name, category]) => `pob2:augment:${JSON.stringify([name, category])}`),
  )
  const runeLines = new Set(sources.map(([, , label]) => `Can roll ${label} modifiers`))
  function hasRune(input: unknown): boolean {
    return hasProjectCapability(input, (properties) =>
      Object.values(properties).some(
        (property) =>
          typeof property.value === 'string' &&
          (runeIds.has(property.value) || runeLines.has(property.value)),
      ),
    )
  }
  function hasBone(input: unknown): boolean {
    return hasProjectCapability(input, (properties) => boneKinds.has(properties.kind?.value))
  }

  /** 来源按完整操作顺序跟踪；已完成的旧骨骼不能被随后镶嵌的符文追溯升级。 */
  return function requiresBoneVersion(input: unknown): boolean {
    if (
      hasProjectCapability(
        input,
        (properties) =>
          properties.desecrated?.value === true &&
          typeof properties.modId?.value === 'string' &&
          modifierId.test(properties.modId.value),
      )
    )
      return true
    const initial = own(input, 'initialState')
    let runePresent = hasRune(initial) || hasRune(own(input, 'importedSockets'))
    if (runePresent && own(initial, 'pendingDesecration') !== undefined) return true
    const operations = own(input, 'operations')
    if (Array.isArray(operations)) {
      for (const key of Object.keys(operations)) {
        const operation = own(operations, key)
        if (runePresent && hasBone(operation)) return true
        // 原始字符串不是对象，单独核对镶嵌身份；绑定符文无合法的移除路径。
        if (
          own(operation, 'kind') === 'socket' &&
          typeof own(operation, 'augmentId') === 'string' &&
          runeIds.has(own(operation, 'augmentId') as string)
        )
          runePresent = true
      }
    }
    const strategy = own(input, 'strategy')
    return hasRune(input) && hasBone(strategy)
  }
}

export const requiresInfluenceBoneProjectVersion = createInfluenceBoneVersionDetector(
  sources,
  /^(?:Time|Marksman|Destruction)Influence\w+$/,
)

export function influenceBoneProjectCapabilityError(
  input: unknown,
  catalog: CraftCatalog,
): string | null {
  if (!requiresInfluenceBoneProjectVersion(input)) return null
  return influenceBoneSourceError(input, catalog)
}

export function influenceBoneSourceError(input: unknown, catalog: CraftCatalog): string | null {
  const hash = catalog._meta.sources.find(
    (source) => source.path === 'src/Data/ModRunes.lua',
  )?.sha256
  if (!astridSourceValid(catalog) || own(input, 'augmentSourceHash') !== hash)
    return '符文骨骼的镶嵌来源指纹缺失或已改变，不能恢复。'
  const desecrationHash = desecrationSourceHash(catalog)
  if (desecrationHash === null || own(input, 'desecrationSourceHash') !== desecrationHash)
    return '符文骨骼的亵渎来源指纹缺失或已改变，不能恢复。'
  return null
}
