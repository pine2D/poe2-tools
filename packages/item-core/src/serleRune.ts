import { astridSourceValid } from './astridRune'
import type { CatalogAugment, CraftCatalog } from './catalog'
import type { CraftResult, CraftState } from './rehearsal'
import { weaponSocketKind } from './weaponRuneEffects'

export const SERLE_NAME = "Serle's Triumph"
export const SERLE_LINE = '+1 Suffix Modifier allowed'

/** 可见侧别与隐藏总量声明必须来自同一条精确目录记录。 */
export function isSerleRune(augment: CatalogAugment): boolean {
  return (
    augment.name === SERLE_NAME &&
    ['weapon', 'armour', 'caster'].includes(augment.category) &&
    augment.id === `pob2:augment:${JSON.stringify([SERLE_NAME, augment.category])}` &&
    augment.type === 'Rune' &&
    augment.localMod === true &&
    augment.limit === 1 &&
    augment.limitId === undefined &&
    augment.isSocketBound === true &&
    augment.bonded === undefined &&
    augment.canSocketInJewellery === true &&
    augment.lines.length === 1 &&
    augment.lines[0] === SERLE_LINE &&
    augment.statOrder.length === 1 &&
    augment.statOrder[0] === 19 &&
    Object.keys(augment.tradeHashes).length === 2 &&
    augment.tradeHashes['718638445']?.length === 1 &&
    augment.tradeHashes['718638445']?.[0] === SERLE_LINE &&
    augment.tradeHashes['1950607759']?.length === 1 &&
    augment.tradeHashes['1950607759']?.[0] === ''
  )
}

/** 声明候选不依赖稀有度；完整状态与新镶操作另行检查。 */
export function serleFitsBase(
  catalog: CraftCatalog,
  state: CraftState,
  augment: CatalogAugment,
): boolean {
  if (!isSerleRune(augment) || !astridSourceValid(catalog)) return false
  const base = catalog.bases.find((entry) => entry.id === state.baseId)
  if (!base) return false
  const weapon = weaponSocketKind(base)
  return weapon
    ? augment.category === (weapon.category === 'weapon' ? 'weapon' : 'caster')
    : augment.category === 'armour' &&
        ['Helmet', 'Body Armour', 'Gloves', 'Boots', 'Shield', 'Buckler', 'Focus'].includes(
          base.type,
        )
}

/** 不调用整件校验或镶嵌派生，避免容量解析循环依赖。 */
export function serleCapacity(catalog: CraftCatalog, state: CraftState): CraftResult<number> {
  if (state.sockets === undefined) return { ok: true, value: 0 }
  if (
    !Array.isArray(state.sockets) ||
    state.sockets.some((id) => id !== null && typeof id !== 'string')
  )
    return { ok: false, error: '孔位列表无效。' }
  const entries = state.sockets.flatMap((id) => {
    if (id === null) return []
    const augment = catalog.augments?.find((entry) => entry.id === id)
    return augment?.name === SERLE_NAME || id.includes(SERLE_NAME) ? [{ augment }] : []
  })
  if (entries.length === 0) return { ok: true, value: 0 }
  if (entries.length !== 1) return { ok: false, error: 'Serle 限一；重复镶嵌与容量叠加尚未核实。' }
  const augment = entries[0]?.augment
  if (!augment || !serleFitsBase(catalog, state, augment))
    return { ok: false, error: 'Serle 的身份、类别、绑定、隐藏容量声明或来源无效。' }
  if (state.rarity !== 'rare')
    return {
      ok: false,
      error: '普通或魔法装备的 Serle 容量与占用规则尚未核实；请先升级为稀有装备。',
    }
  return { ok: true, value: 1 }
}

export function serleSourceMatches(
  expected: readonly string[],
  actual: readonly string[],
): boolean {
  return (
    expected.filter((line) => line === SERLE_LINE).length ===
    actual.filter((line) => line === SERLE_LINE).length
  )
}
