import { isAstridRune } from './astridRune'
import type { CraftCatalog } from './catalog'
import type { CraftStep } from './craftSteps'
import type { CraftState } from './rehearsal'
import { isSerleRune } from './serleRune'
import { artificerSocketLimit } from './sockets'

/** 容量来源只决定准备材料；候选仍由路线引擎按实际当前态应用并计费。 */
export function capacityRuneRouteContext(catalog: CraftCatalog, context?: CraftState) {
  const ids = [
    ...new Set(
      (context?.sockets ?? []).flatMap((id) => {
        const augment = catalog.augments?.find((entry) => entry.id === id)
        return augment && (isSerleRune(augment) || isAstridRune(augment)) ? [augment.id] : []
      }),
    ),
  ]
  return {
    priority: (state: CraftState) => ids.filter((id) => state.sockets?.includes(id)).length * 0.1,
    operations: (state: CraftState): CraftStep[] => {
      if (!ids.length || state.sockets === undefined || state.pendingDesecration || state.corrupted)
        return []
      const missing = ids.filter((id) => !state.sockets?.includes(id))
      if (!missing.length) return []
      const index = state.sockets.indexOf(null)
      if (index >= 0)
        return missing.map((augmentId) => ({ kind: 'socket', socketIndex: index, augmentId }))
      return state.sockets.length < artificerSocketLimit(catalog, state)
        ? [{ kind: 'artificer' }]
        : []
    },
  }
}
