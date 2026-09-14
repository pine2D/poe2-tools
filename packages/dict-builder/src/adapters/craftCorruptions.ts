import type { CatalogCorruption } from '@poe2-tools/item-core'
import { normalizeModifierData } from './craftCatalog'
import type { LuaTable } from './restrictedLua'

/** 腐化身份和资格独立于普通前后缀；没有资格的特殊记录仍保留原声明。 */
export function normalizeCorruptions(source: LuaTable): CatalogCorruption[] {
  return Object.entries(source).map(([id, value]) => {
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      (value.type !== 'Corrupted' && value.type !== 'SpecialCorrupted')
    )
      throw new Error(`腐化目录字段异常：${id}.type`)
    const { id: modId, ...data } = normalizeModifierData(id, value, false)
    return {
      id: modId,
      kind: value.type === 'Corrupted' ? 'corrupted' : 'special-corrupted',
      ...data,
    }
  })
}
