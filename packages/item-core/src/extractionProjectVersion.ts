import { hasProjectCapability } from './projectCapability'

export const EXTRACTION_CRAFT_RULES_VERSION = 'basic-2026-09-16-v77'

/** 完整历史、未执行指引和仅报价都必须采用萃取规则版本。 */
export function requiresExtractionProjectVersion(input: unknown): boolean {
  return hasProjectCapability(
    input,
    (properties) =>
      properties.kind?.value === 'extraction' || Object.hasOwn(properties, 'currency:extraction'),
  )
}
