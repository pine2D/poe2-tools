import { isSceptreAugmentId, isSupportedSceptreBaseId } from './sceptreAugments'

export const SCEPTRE_AUGMENT_RULES_VERSION = 'basic-2026-09-17-v109'

function properties(value: unknown): PropertyDescriptorMap {
  return value !== null && typeof value === 'object' ? Object.getOwnPropertyDescriptors(value) : {}
}

/** 权杖孔位和打孔继承装备上下文；精确镶嵌身份覆盖完整未来与未执行指引。 */
export function requiresSceptreAugmentProjectVersion(input: unknown): boolean {
  const pending: { value: unknown; sceptre: boolean }[] = [{ value: input, sceptre: false }]
  const visited = new Map<object, Set<boolean>>()
  while (pending.length) {
    const entry = pending.pop()
    if (!entry || entry.value === null || typeof entry.value !== 'object') continue
    const fields = properties(entry.value)
    const initial = properties(fields.initialState?.value)
    const baseId = fields.baseId ?? initial.baseId
    const sceptre = baseId ? isSupportedSceptreBaseId(baseId.value) : entry.sceptre
    const contexts = visited.get(entry.value) ?? new Set<boolean>()
    if (contexts.has(sceptre)) continue
    contexts.add(sceptre)
    visited.set(entry.value, contexts)
    if (fields.kind?.value === 'socket' && isSceptreAugmentId(fields.augmentId?.value)) return true
    if (
      sceptre &&
      (fields.kind?.value === 'artificer' ||
        (fields.kind?.value === 'vaal' &&
          (!Object.hasOwn(fields, 'outcome') || fields.outcome?.value === 'socket')))
    )
      return true
    for (const field of ['sockets', 'importedSockets']) {
      const sockets = fields[field]?.value
      if (!Array.isArray(sockets)) continue
      const slots = properties(sockets)
      if (sceptre && slots.length?.value > 0) return true
      if (Object.values(slots).some((slot) => isSceptreAugmentId(slot.value))) return true
    }
    // 报价目录早已注册所有材料名；单独名称不能证明使用权杖分支。
    for (const field of Object.values(fields))
      if (Object.hasOwn(field, 'value')) pending.push({ value: field.value, sceptre })
  }
  return false
}
