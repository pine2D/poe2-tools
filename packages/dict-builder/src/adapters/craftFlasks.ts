import type { CatalogMod } from '@poe2-tools/item-core'
import { normalizeMod } from './craftCatalog'
import type { LuaTable } from './restrictedLua'

/** 药剂独立来源，default=1只是域内资格；全零禁用记录仍完整校验并保留审计。 */
export function normalizeFlaskMods(raw: unknown): {
  modifiers: CatalogMod[]
  excluded: { id: string; reason: string }[]
} {
  const fail = (id: string): never => {
    throw new Error(`药剂目录字段异常：${id}`)
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail('root')
  const modifiers: CatalogMod[] = []
  const excluded: { id: string; reason: string }[] = []
  for (const [id, value] of Object.entries(raw)) {
    if (!id.trim() || !value || typeof value !== 'object' || Array.isArray(value)) fail(id)
    const mod = normalizeMod(id, value as LuaTable)
    if (
      mod.eligibility.at(-1)?.tag !== 'default' ||
      mod.eligibility.some((rule) => !['life_flask', 'mana_flask', 'default'].includes(rule.tag))
    )
      fail(id)
    if (mod.eligibility.some((rule) => rule.value === 1))
      modifiers.push({ ...mod, flaskOnly: true })
    else excluded.push({ id, reason: '固定药剂源全部资格为零，禁止生成' })
  }
  return { modifiers, excluded }
}
