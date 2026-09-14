import type {
  CraftCatalog,
  CraftState,
  CraftStep,
  CraftStrategyWorkAction,
  CraftTargetAlternative,
  CraftTargetValues,
} from '@poe2-tools/item-core'
import { useEffect, useRef } from 'react'
import { AlloyCraftPanel } from './AlloyCraftPanel'
import { BoneCraftPanel } from './BoneCraftPanel'
import { EssenceCraftPanel } from './EssenceCraftPanel'
import { FracturePanel } from './FracturePanel'
import { LiquidEmotionCraftPanel } from './LiquidEmotionCraftPanel'
export type SpecialStrategyAction = Exclude<
  CraftStrategyWorkAction,
  { kind: 'currency' | 'socket' | 'artificer' }
>
interface Props {
  action: SpecialStrategyAction
  catalog: CraftCatalog
  state: CraftState
  translations: Record<string, string>
  translateLine?: (line: string) => string | null
  targetModIds: string[]
  targetValues: CraftTargetValues[]
  targetAlternatives: CraftTargetAlternative[]
  targetFracturedModId?: string
  minimumTargetCount?: number
  fractureLabel: string
  onPreview: (step: CraftStep) => void
  onCancel: () => void
}
/** 复用普通制作面板，规则只固定材料配置，随机结果继续逐项选择。 */
export function CraftStrategyResults({ action, fractureLabel, onCancel, ...props }: Props) {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    ref.current?.focus()
  }, [])
  return (
    <section ref={ref} tabIndex={-1} aria-label="指引结果选择" className="craft-strategy-results">
      <h3>指引结果选择</h3>
      <p>取消不计入材料；预览后还需应用。本次材料配置由规则指定。</p>
      <button type="button" onClick={onCancel}>
        取消指引结果选择
      </button>
      {action.kind === 'essence' ? (
        <EssenceCraftPanel {...props} disabled={false} configuration={action} />
      ) : null}
      {action.kind === 'alloy' ? (
        <AlloyCraftPanel {...props} disabled={false} configuration={action} />
      ) : null}
      {action.kind === 'liquid-emotion' ? (
        <LiquidEmotionCraftPanel {...props} disabled={false} configuration={action} />
      ) : null}
      {action.kind === 'desecrate' ? (
        <BoneCraftPanel {...props} disabled={false} configuration={action} />
      ) : null}
      {action.kind === 'reveal' ? <BoneCraftPanel {...props} disabled={false} /> : null}
      {action.kind === 'fracture' ? (
        <FracturePanel {...props} disabled={false} label={fractureLabel} />
      ) : null}
    </section>
  )
}
