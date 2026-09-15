/** 只检查自有数据字段，不执行访问器，也不把观察文本解释为操作。 */
export function hasProjectCapability(
  input: unknown,
  matches: (properties: PropertyDescriptorMap) => boolean,
): boolean {
  const pending = [input]
  const visited = new Set<object>()
  while (pending.length) {
    const value = pending.pop()
    if (value === null || typeof value !== 'object' || visited.has(value)) continue
    visited.add(value)
    const descriptors = Object.getOwnPropertyDescriptors(value)
    if (matches(descriptors)) return true
    for (const descriptor of Object.values(descriptors))
      if (Object.hasOwn(descriptor, 'value')) pending.push(descriptor.value)
  }
  return false
}
