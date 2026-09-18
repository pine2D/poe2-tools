export type VaalJewelAffixChange =
  | { outcome: 'add'; modId: string; values: number[] }
  | { outcome: 'remove'; removeModId: string; removeAffixId?: string }

export function isVaalJewelAffixChange(value: unknown): value is VaalJewelAffixChange {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const change = value as Record<string, unknown>
  if (change.outcome === 'remove')
    return (
      Object.keys(change).every((key) =>
        ['outcome', 'removeModId', 'removeAffixId'].includes(key),
      ) &&
      typeof change.removeModId === 'string' &&
      change.removeModId.length > 0 &&
      (!Object.hasOwn(change, 'removeAffixId') ||
        (typeof change.removeAffixId === 'string' && change.removeAffixId.length > 0))
    )
  return (
    change.outcome === 'add' &&
    Object.keys(change).every((key) => ['outcome', 'modId', 'values'].includes(key)) &&
    typeof change.modId === 'string' &&
    change.modId.length > 0 &&
    Array.isArray(change.values) &&
    change.values.length <= 32 &&
    change.values.every((number) => typeof number === 'number' && Number.isFinite(number))
  )
}
