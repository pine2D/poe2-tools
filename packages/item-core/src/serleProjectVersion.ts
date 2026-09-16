import { astridSourceValid } from './astridRune'
import type { CraftCatalog } from './catalog'
import { hasProjectCapability } from './projectCapability'
import { isSerleRune, SERLE_LINE, SERLE_NAME } from './serleRune'
import { statScalabilitySourceHash } from './statScalability'

export const SERLE_RULES_VERSION = 'basic-2026-09-16-v88'
const SERLE_IDS = ['weapon', 'armour', 'caster'].map(
  (category) => `pob2:augment:${JSON.stringify([SERLE_NAME, category])}`,
)

/** 扫描结构化能力声明；普通装备超额词缀也要求新版，不能通过删掉符文逃避版本检查。 */
export function requiresSerleProjectVersion(input: unknown, catalog: CraftCatalog): boolean {
  // 固定能力身份不能依赖受损目录通过验证，否则旧版门禁会随篡改消失。
  const ids = new Set(SERLE_IDS)
  const values = (value: unknown): unknown[] =>
    Array.isArray(value)
      ? Object.entries(Object.getOwnPropertyDescriptors(value))
          .filter(([key]) => key !== 'length')
          .map(([, descriptor]) => descriptor.value)
      : []
  const own = (value: unknown, key: string): unknown =>
    value !== null && typeof value === 'object'
      ? Object.getOwnPropertyDescriptor(value, key)?.value
      : undefined
  const baseId = own(own(input, 'initialState'), 'baseId') ?? own(input, 'baseId')
  const suffixIds = new Set(
    catalog.modifiers.filter((mod) => mod.kind === 'suffix').map((mod) => mod.id),
  )
  const isOrdinaryBase = (id: unknown): boolean =>
    catalog.bases.some((base) => base.id === id && base.type !== 'Jewel')
  return hasProjectCapability(
    input,
    (properties) =>
      (properties.kind?.value === 'socket' && ids.has(properties.augmentId?.value)) ||
      values(properties.sockets?.value).some(
        (value) => typeof value === 'string' && ids.has(value),
      ) ||
      values(properties.importedSockets?.value).some(
        (value) => typeof value === 'string' && ids.has(value),
      ) ||
      Object.hasOwn(properties, `augment:${SERLE_NAME}`) ||
      (properties.kind?.value === 'affix-count' &&
        typeof properties.min?.value === 'number' &&
        properties.min.value > 6) ||
      (properties.kind?.value === 'open-suffix' &&
        typeof properties.min?.value === 'number' &&
        properties.min.value > 3) ||
      values(properties.targets?.value).length > 6 ||
      values(properties.targetModIds?.value).length > 6 ||
      values(properties.alternatives?.value).length > 6 ||
      values(properties.targetAlternatives?.value).length > 6 ||
      (properties.kind?.value === 'selected-targets' &&
        (values(properties.targetIds?.value).length > 6 ||
          values(properties.modIds?.value).length > 6)) ||
      (isOrdinaryBase(properties.baseId?.value ?? baseId) &&
        (values(properties.affixes?.value).length > 6 ||
          values(properties.affixes?.value).filter((affix) =>
            suffixIds.has(own(affix, 'modId') as string),
          ).length > 3)),
  )
}

/** 未执行声明也核对固定规则来源；空白新版不强制加载可选镶嵌目录。 */
export function serleProjectCapabilityError(input: unknown, catalog: CraftCatalog): string | null {
  if (!requiresSerleProjectVersion(input, catalog)) return null
  const hash = catalog._meta.sources.find(
    (source) => source.path === 'src/Data/ModRunes.lua',
  )?.sha256
  if (
    !astridSourceValid(catalog) ||
    input === null ||
    typeof input !== 'object' ||
    Object.getOwnPropertyDescriptor(input, 'augmentSourceHash')?.value !== hash
  )
    return 'Serle 能力的固定来源指纹缺失或已改变，不能恢复。'
  for (const id of SERLE_IDS) {
    const entries = catalog.augments?.filter((augment) => augment.id === id) ?? []
    if (entries.length !== 1 || !entries[0] || !isSerleRune(entries[0]))
      return 'Serle 的精确身份、绑定或隐藏容量声明无效，不能恢复。'
  }
  const metadata = catalog.scalability?.[SERLE_LINE]
  if (
    statScalabilitySourceHash(catalog) === null ||
    metadata?.length !== 1 ||
    metadata[0]?.scalable !== true ||
    metadata[0].formats.length !== 0
  )
    return 'Serle 的固定增效来源或容量元数据无效，不能恢复。'
  return null
}
