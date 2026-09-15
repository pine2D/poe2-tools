import type { CraftCatalog } from './catalog'
import { MAX_CRAFT_PROJECT_BYTES } from './craftProject'
import {
  IDENTITY_CRAFT_RULES_VERSION,
  type RestoredIdentityCraftProject,
  upgradeCraftProjectIdentity,
} from './craftProjectIdentity'
import { parseIdentityCraftProject } from './craftProjectIdentityReader'
import type { ItemDictionary } from './export'
import type { CraftResult } from './rehearsal'

/** 工作台统一恢复入口；旧项目按原始版本验证，新项目严格恢复，失败不降级重试。 */
export function loadWorkbenchProject(
  text: string,
  catalog: CraftCatalog,
  dictionary?: ItemDictionary,
): CraftResult<RestoredIdentityCraftProject> {
  if (
    text.length > MAX_CRAFT_PROJECT_BYTES ||
    new TextEncoder().encode(text).byteLength > MAX_CRAFT_PROJECT_BYTES
  )
    return { ok: false, error: '演练项目超过 2 MB 限制。' }
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return { ok: false, error: '演练项目不是有效 JSON。' }
  }
  return value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    'rulesVersion' in value &&
    value.rulesVersion === IDENTITY_CRAFT_RULES_VERSION
    ? parseIdentityCraftProject(text, catalog, dictionary)
    : upgradeCraftProjectIdentity(text, catalog, dictionary)
}
