import { hasProjectCapability } from './projectCapability'

export const RUNEFORGE_CRAFT_RULES_VERSION = 'basic-2026-09-16-v82'

/** 完整历史、未执行指引及材料报价均需要锻造操作规则。 */
export function requiresRuneforgeProjectVersion(input: unknown): boolean {
  return hasProjectCapability(
    input,
    (properties) =>
      properties.kind?.value === 'runeforge' || Object.hasOwn(properties, 'currency:verisium'),
  )
}
