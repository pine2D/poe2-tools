import type { CatalogAugment } from '@poe2-tools/item-core'
import type { LuaTable, LuaValue } from './restrictedLua'

const booleanFields = [
  'isSocketBound',
  'canSocketInChakraSlots',
  'canSocketInUniqueItems',
  'canSocketInJewellery',
  'canSocketInCorruptedSanctified',
] as const

function fail(context: string): never {
  throw new Error(`制作镶嵌目录字段异常：${context}`)
}

function table(value: LuaValue | undefined, context: string): LuaTable {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return fail(context)
  return value
}

function text(value: LuaValue | undefined, context: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fail(context)
}

function array(value: LuaValue | undefined, context: string): LuaValue[] {
  const raw = table(value, context)
  const keys = Object.keys(raw)
  if (keys.some((key, index) => key !== String(index + 1))) return fail(context)
  return keys.map((key) => raw[key] as LuaValue)
}

function integer(value: LuaValue | undefined, min: number, context: string): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min
    ? value
    : fail(context)
}

function knownKeys(raw: LuaTable, allowed: string[], context: string): void {
  const unknown = Object.keys(raw).filter(
    (key) => !allowed.includes(key) && !/^[1-9]\d*$/.test(key),
  )
  if (unknown.length > 0) fail(`${context} 未适配字段 ${unknown.join(', ')}`)
}

function effect(
  raw: LuaTable,
  context: string,
  allowEmpty = false,
): { lines: string[]; statOrder: number[] } {
  const lines = array(
    Object.fromEntries(Object.entries(raw).filter(([key]) => /^[1-9]\d*$/.test(key))),
    `${context}.lines`,
  ).map((value) => text(value, `${context}.lines`))
  // 固定源有仅 Bonded 的类别：没有普通文本时也没有 statOrder 声明。
  const order = raw.statOrder === undefined && lines.length === 0 && allowEmpty ? {} : raw.statOrder
  const statOrder = array(order, `${context}.statOrder`).map((value) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fail(`${context}.statOrder`)
    return value
  })
  if ((!allowEmpty && lines.length === 0) || lines.length !== statOrder.length)
    fail(`${context}.statOrder`)
  return { lines, statOrder }
}

function normalizeAugment(name: string, category: string, raw: LuaTable): CatalogAugment {
  const id = `pob2:augment:${JSON.stringify([name, category])}`
  text(name, `${id}.name`)
  text(category, `${id}.category`)
  knownKeys(
    raw,
    [
      'type',
      'localMod',
      'statOrder',
      'tradeHashes',
      'levelReq',
      'limit',
      'limitId',
      'bonded',
      ...booleanFields,
    ],
    id,
  )
  if (
    raw.type !== 'Rune' &&
    raw.type !== 'SoulCore' &&
    raw.type !== 'Idol' &&
    raw.type !== 'AbyssalEye' &&
    raw.type !== 'CongealedMist'
  )
    fail(`${id}.type`)
  if (typeof raw.localMod !== 'boolean') fail(`${id}.localMod`)
  const hashes = table(raw.tradeHashes, `${id}.tradeHashes`)
  const result: CatalogAugment = {
    id,
    name,
    category,
    type: raw.type,
    localMod: raw.localMod,
    ...effect(raw, id, true),
    tradeHashes: Object.fromEntries(
      Object.entries(hashes).map(([hash, values]) => {
        if (!/^\d+$/.test(hash)) fail(`${id}.tradeHashes.${hash}`)
        return [
          hash,
          array(values, `${id}.tradeHashes.${hash}`).map((value) => {
            if (typeof value !== 'string') fail(`${id}.tradeHashes.${hash}`)
            return value
          }),
        ]
      }),
    ),
    levelReq: integer(raw.levelReq, 0, `${id}.levelReq`),
  }
  if (raw.limit !== undefined) result.limit = integer(raw.limit, 1, `${id}.limit`)
  if (raw.limitId !== undefined) result.limitId = text(raw.limitId, `${id}.limitId`)
  for (const key of booleanFields) {
    if (raw[key] === undefined) continue
    if (typeof raw[key] !== 'boolean') fail(`${id}.${key}`)
    result[key] = raw[key]
  }
  if (raw.bonded !== undefined) {
    const bonded = table(raw.bonded, `${id}.bonded`)
    knownKeys(bonded, ['statOrder'], `${id}.bonded`)
    result.bonded = effect(bonded, `${id}.bonded`)
  }
  return result
}

/** 仅消费受限 Lua 解析后的声明；不执行来源代码，也不合并同名不同类别效果。 */
export function normalizeAugments(raw: LuaTable): CatalogAugment[] {
  return Object.entries(raw).flatMap(([name, value]) => {
    const categories = Object.entries(table(value, name))
    if (categories.length === 0) fail(`${name} 缺少类别效果`)
    return categories.map(([category, entry]) =>
      normalizeAugment(name, category, table(entry, `${name}.${category}`)),
    )
  })
}
