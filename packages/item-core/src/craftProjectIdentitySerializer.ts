import type { CraftCatalog } from './catalog'
import type { IdentityCraftProject } from './craftProjectIdentity'
import { parseIdentityCraftProject } from './craftProjectIdentityReader'
import { isPlainProjectJSON } from './craftProjectJSON'
import type { ItemDictionary } from './export'
import type { CraftResult } from './rehearsal'

/** 与严格恢复共用完整历史校验；旧版项目仍使用原保存入口。 */
export function serializeIdentityCraftProject(
  project: IdentityCraftProject,
  catalog: CraftCatalog,
  dictionary: ItemDictionary = {},
): CraftResult<string> {
  let text: string
  try {
    if (!isPlainProjectJSON(project))
      return { ok: false, error: '实例项目包含不能无损保存的 JSON 字段。' }
    text = JSON.stringify(project)
  } catch {
    return { ok: false, error: '实例项目无法序列化为 JSON。' }
  }
  const checked = parseIdentityCraftProject(text, catalog, dictionary)
  return checked.ok ? { ok: true, value: text } : checked
}
