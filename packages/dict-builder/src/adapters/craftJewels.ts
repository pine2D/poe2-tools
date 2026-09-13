import type { CatalogLiquidEmotion, CatalogMod } from '@poe2-tools/item-core'
import { normalizeMod } from './craftCatalog'
import { auditLiquidEmotionMappings } from './craftLiquidEmotionAudit'
import type { LuaTable } from './restrictedLua'

/** 所有记录先验结构；范围珠宝及无资格记录保留排除原因。 */
export function normalizeJewelMods(
  raw: unknown,
  liquidEmotions: readonly CatalogLiquidEmotion[] = [],
): {
  modifiers: CatalogMod[]
  excluded: { id: string; reason: string }[]
} {
  const fail = (id: string): never => {
    throw new Error(`珠宝目录字段异常：${id}`)
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail('root')
  auditLiquidEmotionMappings(liquidEmotions, raw as LuaTable)
  const craftedIds = new Set(
    liquidEmotions
      .filter((emotion) => !emotion.radiusJewel)
      .flatMap((emotion) =>
        Object.values(emotion.mods).flatMap((effects) => Object.values(effects)),
      ),
  )
  const modifiers: CatalogMod[] = []
  const excluded: { id: string; reason: string }[] = []
  for (const [id, value] of Object.entries(raw)) {
    if (!id.trim() || !value || typeof value !== 'object' || Array.isArray(value)) fail(id)
    const { nodeType, ...fields } = value as LuaTable
    if (nodeType !== undefined && nodeType !== 1 && nodeType !== 2) fail(id)
    if (
      !fields.weightKey ||
      typeof fields.weightKey !== 'object' ||
      !fields.weightVal ||
      typeof fields.weightVal !== 'object'
    )
      fail(id)
    const keys = Object.values(fields.weightKey as LuaTable)
    const values = Object.values(fields.weightVal as LuaTable)
    if (keys.at(-1) !== 'jewel' || values.at(-1) !== 0 || keys.includes('default')) fail(id)
    // 源以 jewel=0 兜底；追加 default=0 只补全目录格式，不改变任何已有资格顺序。
    const mod = normalizeMod(id, {
      ...fields,
      weightKey: { ...(fields.weightKey as LuaTable), [keys.length + 1]: 'default' },
      weightVal: { ...(fields.weightVal as LuaTable), [values.length + 1]: 0 },
    })
    const ordinary = mod.eligibility.some(
      (rule) => ['strjewel', 'dexjewel', 'intjewel'].includes(rule.tag) && rule.value === 1,
    )
    if (ordinary) {
      if (nodeType !== undefined) fail(id)
      modifiers.push({ ...mod, jewelOnly: true })
    } else if (craftedIds.has(id)) {
      if (nodeType !== undefined || mod.eligibility.some((rule) => rule.value !== 0)) fail(id)
      modifiers.push({ ...mod, jewelOnly: true, craftedOnly: true })
    } else excluded.push({ id, reason: '不属于普通珠宝的可生成词缀' })
  }
  return { modifiers, excluded }
}
