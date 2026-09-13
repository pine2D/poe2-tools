import type { CraftCatalog } from './catalog'
import {
  type ArtificerCraftOperation,
  applyCraftStep,
  type SocketCraftOperation,
} from './craftSteps'
import type { CraftResult, CraftState } from './rehearsal'

export type SocketStrategyAction =
  | { kind: 'artificer' }
  | { kind: 'socket'; augmentId: string; socketIndex: number | 'first-empty' }

/** 只解析策略孔位；实际可用性仍由统一制作引擎校验。 */
export function prepareStrategySocket(
  catalog: CraftCatalog,
  state: CraftState,
  action: SocketStrategyAction,
): CraftResult<ArtificerCraftOperation | SocketCraftOperation> {
  const step =
    action.kind === 'artificer'
      ? action
      : {
          ...action,
          socketIndex:
            action.socketIndex === 'first-empty'
              ? (state.sockets?.indexOf(null) ?? -1)
              : action.socketIndex,
        }
  if (
    step.kind === 'socket' &&
    action.kind === 'socket' &&
    action.socketIndex === 'first-empty' &&
    step.socketIndex < 0
  )
    return { ok: false, error: '当前没有已确认的空孔；第一空孔规则不会覆盖旧符文。' }
  const result = applyCraftStep(catalog, state, step)
  return result.ok ? { ok: true, value: step } : result
}
