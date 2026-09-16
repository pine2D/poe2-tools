import type { CatalogMod, CraftCatalog } from './catalog'
import { readCatalogLineValues } from './catalogMatch'
import type { CraftAffix, CraftResult, CraftState } from './rehearsal'
import { statScalabilitySourceHash } from './statScalability'

/** 目标标签来自增效描述，与来源自身的标签分别维护。 */
const RULES = [
  ['Physical', 'Physical', 'suffix', 10, 15, 44, '1335369947', ['physical'], ['physical']],
  ['Fire', 'Fire', 'suffix', 15, 20, 40, '3574578302', ['elemental', 'fire'], ['fire']],
  [
    'Lightning',
    'Lightning',
    'suffix',
    15,
    20,
    42,
    '3624940721',
    ['elemental', 'lightning'],
    ['lightning'],
  ],
  ['Cold', 'Cold', 'suffix', 15, 20, 36, '3206904707', ['elemental', 'cold'], ['cold']],
  [
    'Elemental',
    'Elemental Damage',
    'suffix',
    15,
    20,
    47,
    '231689132',
    ['elemental'],
    ['elemental', 'damage'],
  ],
  ['Chaos', 'Chaos', 'suffix', 15, 20, 35, '3196512240', ['chaos'], ['chaos']],
  ['Mana', 'Mana', 'suffix', 25, 30, 43, '3514984677', ['resource', 'mana'], ['mana']],
  ['Speed', 'Speed', 'prefix', 25, 30, 46, '363924732', ['speed'], ['speed']],
  ['Critical', 'Critical', 'prefix', 20, 30, 37, '2393315299', ['critical'], ['critical']],
] as const
const declarations = RULES.map(([key, label, kind, min, max, stat, hash, tags, targetTags]) => ({
  id: `DestructionInfluence${key}ModifierEffect`,
  kind,
  min,
  max,
  stat,
  hash,
  tags,
  targetTags,
  line: `(${min}-${max})% increased Explicit ${label} Modifier magnitudes`,
  eligibility: [
    ...(key === 'Mana'
      ? [
          'sword',
          'axe',
          'mace',
          'spear',
          'claw',
          'dagger',
          'flail',
          'crossbow',
          'warstaff',
          'talisman',
        ].map((tag) => ({ tag, value: 0 }))
      : []),
    { tag: 'destruction', value: 1 },
    { tag: 'default', value: 0 },
  ],
}))
const equal = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right)

/** 只验证属性身份；孔位、基底、容量和物等由制作状态入口统一核对。 */
export function isDestructionAffix(catalog: CraftCatalog, affix: CraftAffix): boolean {
  const rule = declarations.find((entry) => entry.id === affix.modId)
  if (!rule || affix.crafted || affix.desecrated || statScalabilitySourceHash(catalog) === null)
    return false
  const sources = catalog._meta.sources.filter((s) => s.path === 'src/Data/ModItem.lua')
  if (
    sources.length !== 1 ||
    sources[0]?.sha256 !== '774257f577f8cee8ac59d7848df4bc7a109d266a615eb97c2a2c08ecb6b47cf4' ||
    sources[0]?.url !==
      'https://raw.githubusercontent.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/ce566eac45ea8a86477f513c7ee65a1ebe60014e/src/Data/ModItem.lua'
  )
    return false
  const entries = catalog.modifiers.filter((entry) => entry.id === rule.id)
  const mod = entries[0]
  if (
    entries.length !== 1 ||
    !mod ||
    mod.kind !== rule.kind ||
    mod.group !== rule.id ||
    mod.level !== 65 ||
    mod.name !== (rule.kind === 'prefix' ? "Thrud's" : 'of Destruction') ||
    mod.craftedOnly ||
    mod.desecratedOnly ||
    mod.jewelOnly ||
    mod.radiusJewelOnly ||
    !equal(mod.lines, [rule.line]) ||
    !equal(mod.statOrder, [rule.stat]) ||
    !equal(mod.tags, rule.tags) ||
    !equal(mod.addsTags, []) ||
    !equal(mod.eligibility, rule.eligibility) ||
    !equal(mod.tradeHashes, { [rule.hash]: [rule.line] }) ||
    !equal(catalog.scalability?.[rule.line], [{ scalable: false, formats: [] }])
  )
    return false
  const values = readCatalogLineValues(mod.lines, affix.lines)
  if (values === null || values.length !== 1 || values[0]?.length !== 1) return false
  const value = values[0][0]
  return (
    value === null ||
    (value !== undefined && Number.isInteger(value) && value >= rule.min && value <= rule.max)
  )
}

export function usesDestructionEffect(state: Pick<CraftState, 'affixes'>): boolean {
  return state.affixes.some((affix) => affix.modId.startsWith('DestructionInfluence'))
}

/** 不调用整件状态校验，供导入恢复和派生计算使用，避免循环。 */
export function destructionModifierEffect(
  catalog: CraftCatalog,
  state: Pick<CraftState, 'affixes'>,
  target: CatalogMod,
): CraftResult<number> {
  const affixes = state.affixes.filter((affix) => affix.modId.startsWith('DestructionInfluence'))
  if (affixes.length === 0) return { ok: true, value: 0 }
  const seen = new Set<string>()
  let total = 0
  let unresolved = false
  for (const affix of affixes) {
    if (seen.has(affix.modId) || !isDestructionAffix(catalog, affix))
      return { ok: false, error: '毁灭增效属性的身份、来源或基础数值无效。' }
    seen.add(affix.modId)
    const rule = declarations.find((entry) => entry.id === affix.modId)
    if (
      !rule ||
      target.id.startsWith('DestructionInfluence') ||
      !rule.targetTags.every((tag) => target.tags.includes(tag))
    )
      continue
    const value = readCatalogLineValues([rule.line], affix.lines)?.[0]?.[0]
    if (value === null || value === undefined) unresolved = true
    else total += value
  }
  return unresolved
    ? { ok: false, error: '匹配的毁灭增效实际掷值未知。' }
    : { ok: true, value: total }
}
