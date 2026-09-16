import { hasProjectCapability } from './projectCapability'
export const MASTERWORK_CRAFT_RULES_VERSION = 'basic-2026-09-16-v85'
/** 完整未来、未执行指引及仅材料报价也必须保留升级语义。 */
export function requiresMasterworkProjectVersion(input: unknown): boolean {
  return hasProjectCapability(
    input,
    (properties) =>
      properties.kind?.value === 'masterwork' ||
      Object.hasOwn(properties, 'augment:Masterwork Rune'),
  )
}
