function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** JSON 对象键序无关；数组次序及每层完整键集合必须一致。 */
export function equivalentProjectJSON(left: unknown, right: unknown): boolean {
  const pending: [unknown, unknown][] = [[left, right]]
  while (pending.length) {
    const pair = pending.pop()
    if (!pair) break
    const [a, b] = pair
    if (a === b) continue
    if (Array.isArray(a) || Array.isArray(b)) {
      if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
      for (let index = 0; index < a.length; index++) pending.push([a[index], b[index]])
    } else {
      if (!record(a) || !record(b)) return false
      const keys = Object.keys(a)
      if (keys.length !== Object.keys(b).length) return false
      for (const key of keys) {
        if (!Object.hasOwn(b, key)) return false
        pending.push([a[key], b[key]])
      }
    }
  }
  return true
}

/** 保存前检查原始对象，避免 JSON 丢字段、调用访问器或执行自定义转换。 */
export function isPlainProjectJSON(root: unknown): boolean {
  const pending = [root]
  const seen = new Set<object>()
  while (pending.length) {
    const value = pending.pop()
    if (value === null || typeof value === 'string' || typeof value === 'boolean') continue
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) return false
      continue
    }
    if (typeof value !== 'object') return false
    const array = Array.isArray(value)
    const prototype = Object.getPrototypeOf(value)
    if (
      array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null
    )
      return false
    for (
      let inherited = prototype;
      inherited !== null;
      inherited = Object.getPrototypeOf(inherited)
    ) {
      if (Object.hasOwn(inherited, 'toJSON')) return false
    }
    if (seen.has(value)) continue
    seen.add(value)
    const descriptors = Object.getOwnPropertyDescriptors(value)
    const keys = Reflect.ownKeys(descriptors)
    if (array && keys.length !== value.length + 1) return false
    for (const key of keys) {
      if (array && key === 'length') continue
      if (typeof key !== 'string') return false
      const descriptor = descriptors[key]
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) return false
      if (array && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length)) return false
      pending.push(descriptor.value)
    }
  }
  return true
}
