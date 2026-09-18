import { hasProjectCapability } from './projectCapability'

export const JEWEL_VAAL_RULES_VERSION = 'basic-2026-09-18-v116'

/** 检查整份操作树，包含尚未执行的未来；原文字符串不是操作授权。 */
export function requiresJewelVaalProjectVersion(input: unknown): boolean {
  return hasProjectCapability(
    input,
    (fields) =>
      fields.kind?.value === 'vaal' &&
      (fields.outcome?.value === 'add' || fields.outcome?.value === 'remove'),
  )
}
