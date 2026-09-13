import type { CatalogLiquidEmotion, CatalogLiquidEmotionJewel } from '@poe2-tools/item-core'
import type { LuaTable, LuaValue } from './restrictedLua'

const jewelTypes = ['Ruby', 'Sapphire', 'Emerald', 'Diamond'] as const

function fail(context: string): never {
  throw new Error(`液态情感目录字段异常：${context}`)
}

function table(value: LuaValue | undefined, context: string): LuaTable {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return fail(context)
  return value
}

function text(value: LuaValue | undefined, context: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : fail(context)
}

function normalizeEffect(value: LuaValue | undefined, context: string) {
  const effect = table(value, context)
  if (Object.keys(effect).some((key) => key !== 'Prefix' && key !== 'Suffix'))
    fail(`${context} 未适配字段`)
  const result: { prefix?: string; suffix?: string } = {}
  if (effect.Prefix !== undefined) result.prefix = text(effect.Prefix, `${context}.Prefix`)
  if (effect.Suffix !== undefined) result.suffix = text(effect.Suffix, `${context}.Suffix`)
  return result
}

/** 仅消费受限 Lua 声明；四类珠宝及来源中的空映射均原样保留。 */
export function normalizeLiquidEmotions(raw: LuaTable): CatalogLiquidEmotion[] {
  const entries = Object.entries(table(raw, 'liquidEmotions'))
  if (entries.length === 0 || entries.length > 1000) fail('liquidEmotions 数量')
  return entries.map(([id, value]) => {
    if (!/^Metadata\/Items\/Currency\/[A-Za-z0-9_]+$/.test(id)) fail(`${id}.id`)
    const entry = table(value, id)
    if (
      Object.keys(entry).some((key) => !['name', 'radiusJewel', 'tierLevel', 'mods'].includes(key))
    )
      fail(`${id} 未适配字段`)
    if (typeof entry.radiusJewel !== 'boolean') fail(`${id}.radiusJewel`)
    if (
      typeof entry.tierLevel !== 'number' ||
      !Number.isSafeInteger(entry.tierLevel) ||
      entry.tierLevel < 0
    )
      fail(`${id}.tierLevel`)
    const mods = table(entry.mods, `${id}.mods`)
    const categories = Object.keys(mods)
    if (
      categories.length !== jewelTypes.length ||
      jewelTypes.some((category) => !Object.hasOwn(mods, category)) ||
      categories.some((category) => !(jewelTypes as readonly string[]).includes(category))
    )
      fail(`${id}.mods 类别`)
    return {
      id,
      name: text(entry.name, `${id}.name`),
      radiusJewel: entry.radiusJewel,
      tierLevel: entry.tierLevel,
      mods: Object.fromEntries(
        jewelTypes.map((category) => [
          category,
          normalizeEffect(mods[category], `${id}.mods.${category}`),
        ]),
      ) as Record<CatalogLiquidEmotionJewel, { prefix?: string; suffix?: string }>,
    }
  })
}
