import type { CraftCatalog } from './catalog'
import type { IdentityCraftProject } from './craftProjectIdentity'
import { parseIdentityCraftProject } from './craftProjectIdentityReader'
import type { ItemDictionary } from './export'
import type { CraftResult } from './rehearsal'

/** 保存前检查原始对象，避免 JSON 丢字段、调用访问器或执行自定义转换。 */
function isPlainJSON(root: unknown): boolean {
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

/** 与严格恢复共用完整历史校验；旧版项目仍使用原保存入口。 */
export function serializeIdentityCraftProject(
  project: IdentityCraftProject,
  catalog: CraftCatalog,
  dictionary: ItemDictionary = {},
): CraftResult<string> {
  let text: string
  try {
    if (!isPlainJSON(project)) return { ok: false, error: '实例项目包含不能无损保存的 JSON 字段。' }
    text = JSON.stringify(project)
  } catch {
    return { ok: false, error: '实例项目无法序列化为 JSON。' }
  }
  const checked = parseIdentityCraftProject(text, catalog, dictionary)
  return checked.ok ? { ok: true, value: text } : checked
}
