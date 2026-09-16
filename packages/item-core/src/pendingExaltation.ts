import { craftAffixCapacities, craftAffixSpace } from './affixCapacity'
import { collectDesecrationCandidates } from './boneCandidates'
import { isPendingDesecration } from './boneRules'
import type { CraftCatalog } from './catalog'
import { craftedModifierCapacity } from './craftedCapacity'
import { CRAFT_OMEN_RULES, type CraftOmen, craftOmenError } from './omens'
import {
  CRAFT_CURRENCY_RULES,
  type CraftCurrency,
  type CraftState,
  createCraftState,
} from './rehearsal'

/** 判断待揭示阶段是否可进入常规崇高追加；具体候选仍由通货引擎校验。 */
export function pendingExaltationAllowed(
  catalog: CraftCatalog,
  state: CraftState,
  currency?: CraftCurrency,
  omen?: CraftOmen,
): boolean {
  const pending = state.pendingDesecration
  if (!pending || !isPendingDesecration(pending)) return false
  if (pending.options || pending.rerollOptions || pending.lichOmen || pending.revealOmen)
    return false
  if (state.corrupted || state.rarity !== 'rare') return false

  const base = catalog.bases.find((entry) => entry.id === state.baseId)
  if (!base || base.type === 'Jewel') return false
  const capacity = craftAffixCapacities(catalog, state)
  if (capacity.prefix !== 3 || capacity.suffix !== 3) return false
  const craftedCapacity = craftedModifierCapacity(catalog, state)
  if (!craftedCapacity.ok || craftedCapacity.value !== 1) return false
  if (craftAffixSpace(catalog, state).total === 0) return false

  if (currency !== undefined) {
    const rule = CRAFT_CURRENCY_RULES[currency]
    if (rule?.base !== 'exalted') return false
  }
  if (omen !== undefined) {
    if (currency === undefined || !Object.hasOwn(CRAFT_OMEN_RULES, omen)) return false
    if (craftOmenError(omen, currency) !== null || CRAFT_OMEN_RULES[omen].consumesCatalyst)
      return false
  }

  const checked = createCraftState(catalog, state)
  if (!checked.ok) return false
  // 定向预兆已由状态校验用同一候选收集器证明至少三项，避免重复扫描目录。
  if (pending.directionOmen) return true
  return (
    collectDesecrationCandidates(
      catalog,
      checked.value,
      (candidate) => createCraftState(catalog, candidate).ok,
      undefined,
      3,
    ).length >= 3
  )
}
