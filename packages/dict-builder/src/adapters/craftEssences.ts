import type { CatalogEssence } from '@poe2-tools/item-core'
import type { LuaTable, LuaValue } from './restrictedLua'

function fail(context: string): never {
  throw new Error(`制作精华目录字段异常：${context}`)
}

function table(value: LuaValue | undefined, context: string): LuaTable {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return fail(context)
  return value
}

function text(value: LuaValue | undefined, context: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : fail(context)
}

/** 仅消费受限 Lua 声明，原样保留未知效果与来源中的空类别映射。 */
export function normalizeEssences(raw: LuaTable): CatalogEssence[] {
  const entries = Object.entries(table(raw, 'essences'))
  if (entries.length === 0 || entries.length > 1000) fail('essences 数量')
  return entries.map(([id, value]) => {
    if (!/^Metadata\/Items\/Currency\/[A-Za-z0-9_]+$/.test(id)) fail(`${id}.id`)
    const entry = table(value, id)
    if (Object.keys(entry).some((key) => !['name', 'type', 'tierLevel', 'mods'].includes(key)))
      fail(`${id} 未适配字段`)
    if (
      typeof entry.tierLevel !== 'number' ||
      !Number.isSafeInteger(entry.tierLevel) ||
      entry.tierLevel < 0
    )
      fail(`${id}.tierLevel`)
    const mods = Object.entries(table(entry.mods, `${id}.mods`))
    if (mods.length > 100) fail(`${id}.mods 数量`)
    return {
      id,
      name: text(entry.name, `${id}.name`),
      type: text(entry.type, `${id}.type`),
      tierLevel: entry.tierLevel,
      mods: Object.fromEntries(
        mods.map(([category, modId]) => [
          text(category, `${id}.category`),
          text(modId, `${id}.mods.${category}`),
        ]),
      ),
    }
  })
}
