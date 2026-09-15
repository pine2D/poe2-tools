import { type CatalogMod, DESECRATION_FAMILIES, desecratedModDomain } from '@poe2-tools/item-core'
import { normalizeMod } from './craftCatalog'
import type { LuaTable } from './restrictedLua'

/** 排除也是已验证的源记录；未知结构不能伪装成不支持的类别。 */
export function normalizeDesecratedMods(raw: unknown): {
  modifiers: CatalogMod[]
  excluded: { id: string; reason: string }[]
} {
  const fail = (id: string): never => {
    throw new Error(`亵渎目录字段异常：${id}`)
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail('root')
  const modifiers: CatalogMod[] = []
  const excluded: { id: string; reason: string }[] = []
  for (const [id, value] of Object.entries(raw)) {
    if (!id.trim() || !value || typeof value !== 'object' || Array.isArray(value)) fail(id)
    const entry = value as LuaTable
    const { nodeType, ...fields } = entry
    if (Object.hasOwn(entry, 'nodeType') && nodeType !== 2) fail(id)
    const missingType = !Object.hasOwn(entry, 'type')
    // 占位仅复用公共结构校验，原始缺 type 的记录必定排除，不推断前后缀。
    const mod = normalizeMod(id, missingType ? { ...fields, type: 'Prefix' } : fields)
    const families = DESECRATION_FAMILIES.filter((tag) => mod.tags.includes(tag))
    if (new Set(mod.tags).size !== mod.tags.length || families.length > 1) fail(id)
    const domain = desecratedModDomain(mod)
    const hasJewelEligibility = mod.eligibility.some(
      (rule) =>
        rule.value === 1 &&
        [
          'strjewel',
          'intjewel',
          'dexjewel',
          'str_radius_jewel',
          'int_radius_jewel',
          'dex_radius_jewel',
        ].includes(rule.tag),
    )
    if (hasJewelEligibility && !domain) fail(id)
    const reason = missingType
      ? '未声明前后缀类型'
      : !mod.tags.includes('unveiled_mod')
        ? '不属于揭露词缀'
        : domain === null
          ? '不属于支持的三族亵渎词缀'
          : null
    if (reason) excluded.push({ id, reason })
    else {
      if (domain === 'radius-jewel' ? nodeType !== 2 : nodeType !== undefined) fail(id)
      const lines =
        domain === 'radius-jewel'
          ? mod.lines.map((line) => `Notable Passive Skills in Radius also grant ${line}`)
          : mod.lines
      if (
        domain === 'radius-jewel' &&
        lines.some((line) => !Object.values(mod.tradeHashes).flat().includes(line))
      )
        fail(id)
      modifiers.push({
        ...mod,
        lines,
        desecratedOnly: true,
        ...(domain !== 'equipment' ? { jewelOnly: true as const } : {}),
        ...(domain === 'radius-jewel' ? { radiusJewelOnly: true as const } : {}),
      })
    }
  }
  return { modifiers, excluded }
}
