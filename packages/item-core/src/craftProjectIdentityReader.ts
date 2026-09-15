import type { CraftCatalog } from './catalog'
import { MAX_CRAFT_PROJECT_BYTES, readStoredTargetProjectProjection } from './craftProject'
import {
  IDENTITY_CRAFT_RULES_VERSION,
  identifyVerifiedCraftProject,
  type RestoredIdentityCraftProject,
  upgradeCraftProjectIdentity,
} from './craftProjectIdentity'
import { equivalentProjectJSON } from './craftProjectJSON'
import type { ItemDictionary } from './export'
import type { CraftResult } from './rehearsal'

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** 只投影身份所在的结构位置；完整字段、版本和制作资格由旧项目核心验证。 */
function legacyProjection(original: Record<string, unknown>): Record<string, unknown> {
  const project = structuredClone(original)
  // v73 的语义基线固定为 v72，不能跟随未来的默认保存版本变化。
  project.rulesVersion = 'basic-2026-09-12-v72'
  if (record(project.initialState)) {
    delete project.initialState.nextAffixId
    if (Array.isArray(project.initialState.affixes))
      for (const affix of project.initialState.affixes) {
        if (record(affix)) delete affix.affixId
      }
  }
  if (!Array.isArray(project.operations)) return project
  for (const operation of project.operations) {
    if (!record(operation)) continue
    if (!Object.hasOwn(operation, 'kind') && typeof operation.currency === 'string') {
      if (typeof operation.removeModId === 'string') delete operation.removeAffixId
      if (Array.isArray(operation.rolls))
        for (const roll of operation.rolls) {
          if (record(roll) && typeof roll.modId === 'string') delete roll.affixId
        }
    } else if (operation.kind === 'fracture' && typeof operation.modId === 'string') {
      delete operation.affixId
    } else if (
      typeof operation.kind === 'string' &&
      ['essence', 'alloy', 'liquid-emotion', 'desecrate'].includes(operation.kind) &&
      typeof operation.removeModId === 'string'
    ) {
      delete operation.removeAffixId
    } else if (
      operation.kind === 'vaal' &&
      operation.outcome === 'reroll' &&
      Array.isArray(operation.replacements)
    ) {
      for (const replacement of operation.replacements) {
        if (
          record(replacement) &&
          typeof replacement.removeModId === 'string' &&
          typeof replacement.modId === 'string'
        )
          delete replacement.removeAffixId
      }
    }
  }
  return project
}

/** v73 必须已是完整规范输出；缺失或错误身份不能由读取过程自动修复。 */
export function parseIdentityCraftProject(
  text: string,
  catalog: CraftCatalog,
  dictionary: ItemDictionary = {},
): CraftResult<RestoredIdentityCraftProject> {
  return readIdentityProject(text, catalog, dictionary, false)
}

/** 包内 v74 目标投影入口；实例、历史与来源仍经过同一严格固定点校验。 */
export function readIdentityStoredTargetProjection(
  text: string,
  catalog: CraftCatalog,
  dictionary: ItemDictionary,
): CraftResult<RestoredIdentityCraftProject> {
  return readIdentityProject(text, catalog, dictionary, true)
}

function readIdentityProject(
  text: string,
  catalog: CraftCatalog,
  dictionary: ItemDictionary,
  storedTargets: boolean,
): CraftResult<RestoredIdentityCraftProject> {
  if (
    text.length > MAX_CRAFT_PROJECT_BYTES ||
    new TextEncoder().encode(text).byteLength > MAX_CRAFT_PROJECT_BYTES
  )
    return { ok: false, error: '演练项目超过 2 MB 限制。' }
  let original: unknown
  try {
    original = JSON.parse(text)
  } catch {
    return { ok: false, error: '演练项目不是有效 JSON。' }
  }
  if (!record(original) || original.rulesVersion !== IDENTITY_CRAFT_RULES_VERSION)
    return { ok: false, error: '实例项目必须使用精确的 v73 规则版本。' }
  let projection: string
  try {
    projection = JSON.stringify(legacyProjection(original))
  } catch {
    return { ok: false, error: '实例项目结构过深，无法建立可验证的旧格式投影。' }
  }
  const legacy = storedTargets
    ? readStoredTargetProjectProjection(projection, catalog, dictionary)
    : undefined
  if (legacy && !legacy.ok) return legacy
  const upgraded = legacy?.ok
    ? identifyVerifiedCraftProject(legacy.value, catalog)
    : upgradeCraftProjectIdentity(projection, catalog, dictionary)
  if (!upgraded.ok) return upgraded
  if (!equivalentProjectJSON(original, upgraded.value.project))
    return { ok: false, error: '实例项目与完整回放结果不一致；不能自动补全或修复身份及配置。' }
  return upgraded
}
