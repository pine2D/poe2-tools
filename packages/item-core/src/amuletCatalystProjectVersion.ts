export const AMULET_CATALYST_RULES_VERSION = 'basic-2026-09-17-v105'

const amuletIds = new Set(['Lament Amulet', 'Portent Amulet', 'Absent Amulet'])

function dataBaseId(value: unknown): unknown {
  return value !== null && typeof value === 'object'
    ? Object.getOwnPropertyDescriptor(value, 'baseId')?.value
    : undefined
}

/** 催化语义只在项链装备/项目上下文生效；嵌套独立项目使用自己的起点。 */
export function requiresAmuletCatalystProjectVersion(input: unknown): boolean {
  const pending = [{ value: input, amulet: false }]
  const visited = [new Set<object>(), new Set<object>()] as const
  while (pending.length) {
    const entry = pending.pop()
    if (!entry || entry.value === null || typeof entry.value !== 'object') continue
    const descriptors = Object.getOwnPropertyDescriptors(entry.value)
    const baseId = descriptors.baseId?.value ?? dataBaseId(descriptors.initialState?.value)
    const amulet = typeof baseId === 'string' ? amuletIds.has(baseId) : entry.amulet
    const seen = visited[amulet ? 1 : 0]
    if (seen.has(entry.value)) continue
    seen.add(entry.value)
    if (amulet && Object.hasOwn(descriptors, 'catalyst')) return true
    for (const descriptor of Object.values(descriptors))
      if (Object.hasOwn(descriptor, 'value')) pending.push({ value: descriptor.value, amulet })
  }
  return false
}
