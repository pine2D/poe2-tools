import type { CatalogBase, CatalogMod } from '@poe2-tools/item-core'
import type { LuaTable, LuaValue } from './restrictedLua'

function fail(context: string): never {
  throw new Error(`制作目录字段异常：${context}`)
}

function table(value: LuaValue | undefined, context: string): LuaTable {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return fail(context)
  return value
}

function string(value: LuaValue | undefined, context: string): string {
  return typeof value === 'string' ? value : fail(context)
}

function number(value: LuaValue | undefined, context: string): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fail(context)
}

function array(value: LuaValue | undefined, context: string): LuaValue[] {
  const values = table(value, context)
  const keys = Object.keys(values)
  if (keys.some((key, index) => key !== String(index + 1))) return fail(context)
  return keys.map((key) => values[key] as LuaValue)
}

function strings(value: LuaValue | undefined, context: string): string[] {
  return array(value, context).map((entry) => string(entry, context))
}

function numericTable(value: LuaValue | undefined, context: string): Record<string, number> {
  if (value === undefined) return {}
  return Object.fromEntries(
    Object.entries(table(value, context)).map(([key, entry]) => [
      key,
      number(entry, `${context}.${key}`),
    ]),
  )
}

function knownKeys(raw: LuaTable, allowed: string[], context: string, allowLines = false): void {
  const unknown = Object.keys(raw).filter(
    (key) => !allowed.includes(key) && !(allowLines && /^[1-9]\d*$/.test(key)),
  )
  if (unknown.length > 0) fail(`${context} 未适配字段 ${unknown.join(', ')}`)
}

export function normalizeMod(id: string, raw: LuaTable): CatalogMod {
  knownKeys(
    raw,
    [
      'type',
      'affix',
      'level',
      'group',
      'statOrder',
      'weightKey',
      'weightVal',
      'modTags',
      'tags',
      'tradeHashes',
    ],
    id,
    true,
  )
  if (raw.type !== 'Prefix' && raw.type !== 'Suffix') fail(`${id}.type`)
  const keys = strings(raw.weightKey, `${id}.weightKey`)
  const values = array(raw.weightVal, `${id}.weightVal`)
  if (keys.length !== values.length || new Set(keys).size !== keys.length) fail(`${id}.eligibility`)
  if (!keys.includes('default')) fail(`${id}.default`)
  const lines = strings(
    Object.fromEntries(Object.entries(raw).filter(([key]) => /^[1-9]\d*$/.test(key))),
    `${id}.lines`,
  )
  const level = number(raw.level, `${id}.level`)
  if (!Number.isInteger(level) || level < 1 || lines.length === 0) fail(id)
  const statOrder = array(raw.statOrder, `${id}.statOrder`).map((value) =>
    number(value, `${id}.statOrder`),
  )
  if (statOrder.length !== lines.length) fail(`${id}.statOrder`)
  const hashes = table(raw.tradeHashes, `${id}.tradeHashes`)
  if (Object.keys(hashes).some((key) => !/^\d+$/.test(key))) fail(`${id}.tradeHashes`)
  return {
    id,
    kind: raw.type === 'Prefix' ? 'prefix' : 'suffix',
    name: string(raw.affix, `${id}.affix`),
    group: string(raw.group, `${id}.group`),
    level,
    lines,
    statOrder,
    tags: strings(raw.modTags, `${id}.modTags`),
    addsTags: raw.tags === undefined ? [] : strings(raw.tags, `${id}.tags`),
    eligibility: keys.map((tag, index) => {
      const value = values[index]
      if (value !== 0 && value !== 1) return fail(`${id}.weightVal`)
      return { tag, value }
    }),
    tradeHashes: Object.fromEntries(
      Object.entries(hashes).map(([hash, value]) => [
        hash,
        strings(value, `${id}.tradeHashes.${hash}`),
      ]),
    ),
  }
}

export function normalizeBase(id: string, raw: LuaTable): CatalogBase {
  knownKeys(
    raw,
    [
      'type',
      'tags',
      'req',
      'armour',
      'weapon',
      'quality',
      'socketLimit',
      'implicit',
      'implicitModTypes',
      'hidden',
      'subType',
      'variantList',
      'grantedSkillsHaveNoReservation',
      'charmLimit',
      'spirit',
      'charm',
      'flask',
    ],
    id,
  )
  const tags = Object.entries(table(raw.tags, `${id}.tags`))
    .map(([tag, value]) => {
      if (value !== true) return fail(`${id}.tags.${tag}`)
      return tag
    })
    .sort()
  if (raw.hidden !== undefined && typeof raw.hidden !== 'boolean') fail(`${id}.hidden`)
  const socketLimit =
    raw.socketLimit === undefined ? null : number(raw.socketLimit, `${id}.socketLimit`)
  if (socketLimit !== null && (!Number.isInteger(socketLimit) || socketLimit < 0))
    fail(`${id}.socketLimit`)
  const base: CatalogBase = {
    id,
    name: id,
    type: string(raw.type, `${id}.type`),
    tags,
    requirements: numericTable(raw.req, `${id}.req`),
    properties: {
      ...numericTable(raw.armour, `${id}.armour`),
      ...numericTable(raw.weapon, `${id}.weapon`),
    },
    implicit: raw.implicit === undefined ? null : string(raw.implicit, `${id}.implicit`),
    implicitTags:
      raw.implicitModTypes === undefined
        ? []
        : array(raw.implicitModTypes, `${id}.implicitModTypes`).map((value) =>
            strings(value, `${id}.implicitModTypes`),
          ),
    sourceQuality: raw.quality === undefined ? null : number(raw.quality, `${id}.quality`),
    socketLimit,
    hidden: raw.hidden === true,
    runeforged: tags.includes('runeforged'),
  }
  if (raw.subType !== undefined) base.subType = string(raw.subType, `${id}.subType`)
  if (raw.variantList !== undefined)
    base.variantList = strings(raw.variantList, `${id}.variantList`)
  if (raw.grantedSkillsHaveNoReservation !== undefined) {
    if (typeof raw.grantedSkillsHaveNoReservation !== 'boolean')
      fail(`${id}.grantedSkillsHaveNoReservation`)
    base.grantedSkillsHaveNoReservation = raw.grantedSkillsHaveNoReservation
  }
  if (raw.charmLimit !== undefined) base.charmLimit = number(raw.charmLimit, `${id}.charmLimit`)
  if (raw.spirit !== undefined) base.spirit = number(raw.spirit, `${id}.spirit`)
  if (raw.flask !== undefined) base.flask = numericTable(raw.flask, `${id}.flask`)
  if (raw.charm !== undefined) {
    const charm = table(raw.charm, `${id}.charm`)
    knownKeys(charm, ['duration', 'chargesUsed', 'chargesMax', 'buff'], `${id}.charm`)
    base.charm = {
      duration: number(charm.duration, `${id}.duration`),
      chargesUsed: number(charm.chargesUsed, `${id}.chargesUsed`),
      chargesMax: number(charm.chargesMax, `${id}.chargesMax`),
      buff: strings(charm.buff, `${id}.buff`),
    }
  }
  return base
}
