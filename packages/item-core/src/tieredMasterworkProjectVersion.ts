import type { CraftCatalog } from './catalog'
import { masterworkUpgradeName } from './masterwork'
import { hasProjectCapability } from './projectCapability'

export const TIERED_MASTERWORK_RULES_VERSION = 'basic-2026-09-18-v121'

/** 低阶显式步骤，以及已有低阶孔位对应的未执行升级指引，使用新语义。 */
export function requiresTieredMasterworkProjectVersion(
  input: unknown,
  catalog: CraftCatalog,
): boolean {
  if (!hasProjectCapability(input, (fields) => fields.kind?.value === 'masterwork')) return false
  const lower = new Set(
    catalog.augments
      ?.filter((entry) => {
        const next = masterworkUpgradeName(entry.name)
        return entry.type === 'Rune' && next !== null && !next.startsWith('Perfect ')
      })
      .map((entry) => entry.id),
  )
  const indices = new Set<number>()
  let unspecifiedSocket = false
  const explicit = hasProjectCapability(input, (fields) => {
    const kind = fields.kind?.value
    if (kind === 'masterwork' && lower.has(fields.fromAugmentId?.value)) return true
    if (kind === 'socket' && lower.has(fields.augmentId?.value)) {
      const index = fields.socketIndex?.value
      if (Number.isSafeInteger(index) && index >= 0) indices.add(index)
      else unspecifiedSocket = true
    }
    const sockets = fields.sockets?.value
    if (Array.isArray(sockets)) {
      for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(sockets))) {
        if (/^(0|[1-9]\d*)$/.test(key) && lower.has(descriptor.value)) indices.add(Number(key))
      }
    }
    return false
  })
  return (
    explicit ||
    hasProjectCapability(
      input,
      (fields) =>
        fields.kind?.value === 'masterwork' &&
        !Object.hasOwn(fields, 'fromAugmentId') &&
        (unspecifiedSocket || indices.has(fields.socketIndex?.value)),
    )
  )
}
