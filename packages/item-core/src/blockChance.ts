import { isOffhandIdolId } from './armourIdols'
import type { CraftCatalog } from './catalog'
import { modifierLayers } from './modifierLayers'
import { readNumericValues } from './numeric'
import { type CraftResult, type CraftState, createCraftState } from './rehearsal'
import { socketEffects } from './sockets'

export interface BlockChanceEstimate {
  base: number
  increased: number
  runeIncreased: number
  value: number
}
const BLOCK = /\bBlock(?:Chance)?\b/i
const LOCAL_INCREASE = /^\([\d]+-[\d]+\)% increased Block chance$/
const GLOBAL_BLOCK = /^(?:MaximumBlockChance|GainLifeOnBlock|GainManaOnBlock)$/
const fail = (error: string): CraftResult<BlockChanceEstimate> => ({ ok: false, error })

/** 固定 PoB2 Item.lua 本件模型；品质、条件格挡与人物格挡上限不参与。 */
export function estimateBlockChance(
  catalog: CraftCatalog,
  state: CraftState,
): CraftResult<BlockChanceEstimate> {
  const base = catalog.bases.find((b) => b.id === state.baseId)
  const baseChance = base?.properties.BlockChance
  if (
    base?.type !== 'Shield' ||
    typeof baseChance !== 'number' ||
    !Number.isSafeInteger(baseChance) ||
    baseChance < 0
  )
    return fail('该基底没有已核对的本件格挡率。')
  if (base.hidden || base.runeforged || base.variantList !== undefined)
    return fail('该特殊基底暂不支持本件格挡估算。')
  if (state.sockets === undefined) return fail('孔位状态未知，无法估算本件格挡率。')
  if (
    [...(base.implicit?.split('\n') ?? []), ...(state.implicitLines ?? [])].some((l) =>
      BLOCK.test(l),
    )
  )
    return fail('固有属性包含尚未支持的格挡规则，无法估算本件格挡率。')
  const checked = createCraftState(catalog, state)
  if (!checked.ok) return fail(`当前制作状态无法估算本件格挡率：${checked.error}`)
  state = checked.value
  let increased = 0
  for (const { attribute, mod } of modifierLayers(catalog, state)) {
    if (!mod) return fail(`词缀 ${attribute.modId} 不在制作目录中。`)
    if (!BLOCK.test(mod.group) && !mod.lines.some((l) => BLOCK.test(l))) continue
    if (GLOBAL_BLOCK.test(mod.group)) continue
    if (
      mod.group !== 'LocalIncreasedBlockPercentage' ||
      mod.lines.length !== 1 ||
      !LOCAL_INCREASE.test(mod.lines[0] ?? '')
    )
      return fail(`词缀 ${mod.id} 的格挡规则尚未支持，无法估算本件格挡率。`)
    const values = readNumericValues(mod.lines, attribute.lines)
    if (
      !values.ok ||
      values.value.length !== 1 ||
      typeof values.value[0] !== 'number' ||
      !Number.isSafeInteger(values.value[0])
    )
      return fail(`词缀 ${mod.id} 的本地格挡数值未知。`)
    increased += values.value[0]
  }
  let runeIncreased = 0
  for (const { augment } of socketEffects(catalog, state)) {
    if (!augment.lines.some((l) => BLOCK.test(l))) continue
    if (isOffhandIdolId(augment.id) && !augment.localMod) continue
    const match = /^(\d+)% increased Block chance$/.exec(augment.lines[0] ?? '')
    if (!isOffhandIdolId(augment.id) || !augment.localMod || augment.lines.length !== 1 || !match)
      return fail('孔内效果包含尚未支持的本地格挡规则。')
    runeIncreased += Number(match[1])
  }
  increased += runeIncreased
  // 先乘整数百分比再除100，避免20×1.45的浮点误差向下取整成28。
  const numerator = baseChance * (100 + increased)
  if (!Number.isSafeInteger(numerator)) return fail('本件格挡数值超出安全估算范围。')
  return {
    ok: true,
    value: {
      base: baseChance,
      increased,
      runeIncreased,
      value: Math.floor(numerator / 100),
    },
  }
}
