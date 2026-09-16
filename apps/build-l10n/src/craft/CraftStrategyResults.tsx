import type {
  CraftCatalog,
  CraftState,
  CraftStep,
  CraftStrategyWorkAction,
  CraftTargetDefinitions,
} from '@poe2-tools/item-core'
import { useEffect, useRef } from 'react'
import { AlloyCraftPanel } from './AlloyCraftPanel'
import { ArchitectPanel } from './ArchitectPanel'
import { BoneCraftPanel } from './BoneCraftPanel'
import { CorruptionPanel } from './CorruptionPanel'
import { EssenceCraftPanel } from './EssenceCraftPanel'
import { ExtractionPanel } from './ExtractionPanel'
import { FluxCraftPanel } from './FluxCraftPanel'
import { FracturePanel } from './FracturePanel'
import { LiquidEmotionCraftPanel } from './LiquidEmotionCraftPanel'
import { MasterworkPanel } from './MasterworkPanel'
import { PerfectFluxPanel } from './PerfectFluxPanel'
import { RuneforgePanel } from './RuneforgePanel'
export type SpecialStrategyAction = Exclude<
  CraftStrategyWorkAction,
  { kind: 'currency' | 'socket' | 'artificer' }
>
interface Props {
  action: SpecialStrategyAction
  catalog: CraftCatalog
  definitions: CraftTargetDefinitions
  state: CraftState
  translations: Record<string, string>
  translateLine?: (line: string) => string | null
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
      {action.kind === 'vaal' ? (
        <CorruptionPanel
          {...props}
          draft={null}
          busy={false}
          canApply={false}
          onPreview={(step) => {
            if (step) props.onPreview(step)
          }}
          onApply={() => undefined}
        />
      ) : null}
      {action.kind === 'architect' ? (
        <ArchitectPanel
          {...props}
          draft={null}
          busy={false}
          canApply={false}
          onPreview={(step) => {
            if (step) props.onPreview(step)
          }}
          onApply={() => undefined}
        />
      ) : null}
      {action.kind === 'essence' ? (
        <EssenceCraftPanel {...props} disabled={false} configuration={action} />
      ) : null}
      {action.kind === 'masterwork' ? (
        <MasterworkPanel {...props} configuration={action} disabled={false} />
      ) : null}
      {action.kind === 'runeforge' ? <RuneforgePanel {...props} disabled={false} /> : null}
      {action.kind === 'extraction' ? (
        <ExtractionPanel {...props} disabled={false} configuration={action} />
      ) : null}
      {action.kind === 'perfect-flux' ? (
        <PerfectFluxPanel {...props} disabled={false} configuration={action} />
      ) : null}
      {action.kind === 'flux' ? (
        <FluxCraftPanel {...props} disabled={false} configuration={action} />
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
