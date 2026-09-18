import { ASTRID_LINE, ASTRID_NAME, astridSourceValid, isAstridRune } from './astridRune'
import type { CatalogAugment, CraftCatalog } from './catalog'
import type { CraftResult, CraftState } from './rehearsal'
import { amplifiedRuneCapacity } from './runeseeker'
import { weaponSocketKind } from './weaponRuneEffects'

/** 只映射现有普通孔类别；不因目录首饰标志创建尚未核实的孔。 */
export function astridFitsBase(
  catalog: CraftCatalog,
  state: CraftState,
  augment: CatalogAugment,
): boolean {
  if (!isAstridRune(augment) || !astridSourceValid(catalog)) return false
  const base = catalog.bases.find((b) => b.id === state.baseId)
  if (!base) return false
  const weapon = weaponSocketKind(base)
  return weapon
    ? augment.category === (weapon.category === 'weapon' ? 'weapon' : 'caster')
    : ['Helmet', 'Body Armour', 'Gloves', 'Boots', 'Shield', 'Buckler', 'Focus'].includes(
        base.type,
      ) && augment.category === 'armour'
}

/** 与整件验证、合金派生计算独立，避免容量与增效互相递归。 */
export function craftedModifierCapacity(
  catalog: CraftCatalog,
  state: CraftState,
): CraftResult<number> {
  // 无孔是普通制作和珠宝路线搜索的高频路径，无需分配孔位中间数组。
  if (state.sockets === undefined || (Array.isArray(state.sockets) && state.sockets.length === 0))
    return { ok: true, value: 1 }
  if (
    state.sockets !== undefined &&
    (!Array.isArray(state.sockets) ||
      state.sockets.some((id) => id !== null && typeof id !== 'string'))
  )
    return { ok: false, error: '孔位列表无效。' }
  const augments = (state.sockets ?? [])
    .filter((id) => id !== null)
    .map((id) => ({ id, augment: catalog.augments?.find((a) => a.id === id) }))
  const astrid = augments.filter(
    ({ id, augment }) => augment?.name === ASTRID_NAME || id.includes(ASTRID_NAME),
  )
  if (astrid.length === 0) return { ok: true, value: 1 }
  if (astrid.length !== 1)
    return { ok: false, error: '多枚 Astrid 的容量叠加尚未核实；原文仍可对比。' }
  const augment = astrid[0]?.augment
  if (!augment || !astridFitsBase(catalog, state, augment))
    return { ok: false, error: 'Astrid 容量符文的身份、类别或来源无效。' }
  const capacity = amplifiedRuneCapacity(catalog, state, ASTRID_LINE)
  return capacity.ok ? { ok: true, value: 1 + capacity.value } : capacity
}

export function astridSocketError(
  catalog: CraftCatalog,
  state: CraftState,
  index: number,
  id: string,
): string | null {
  const next = catalog.augments?.find((a) => a.id === id)
  if (next && isAstridRune(next) && state.corrupted) return 'Astrid 不能新镶入腐化装备。'
  const after = {
    ...state,
    ...(state.sockets ? { sockets: state.sockets.map((old, i) => (i === index ? id : old)) } : {}),
  }
  const capacity = craftedModifierCapacity(catalog, after)
  if (!capacity.ok) return capacity.error
  return state.affixes.filter((a) => a.crafted).length > capacity.value
    ? '已有多工艺时替换 Astrid 后的保留行为尚未核实；请保留当前容量来源。'
    : null
}
