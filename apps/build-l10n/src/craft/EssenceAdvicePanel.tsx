import {
  applyCraftStep,
  type CraftCatalog,
  type CraftState,
  ESSENCE_OMEN_RULES,
  type EssenceAdviceStep,
  type EssenceCraftOperation,
  type LiquidEmotionCraftOperation,
  prepareEssenceCraft,
  prepareLiquidEmotionCraft,
  renderNumericLines,
} from '@poe2-tools/item-core'
import { useState } from 'react'

interface EssenceResultDetailsProps {
  catalog: CraftCatalog
  state: CraftState
  operation: EssenceCraftOperation | LiquidEmotionCraftOperation
  translateLine?: (line: string) => string | null
}

export function EssenceResultDetails({
  catalog,
  state,
  operation,
  translateLine,
}: EssenceResultDetailsProps) {
  const prepared =
    operation.kind === 'liquid-emotion'
      ? prepareLiquidEmotionCraft(catalog, state, operation.emotionId)
      : prepareEssenceCraft(catalog, state, operation.essenceId, operation.omen)
  if (!prepared.ok) return <p role="alert">{prepared.error}</p>
  const rendered = renderNumericLines(prepared.value.mod.lines, operation.values)
  const removed = state.affixes.find((affix) => affix.modId === operation.removeModId)
  return (
    <>
      <p>保证词缀：{prepared.value.mod.id} · 演练填入的数值：</p>
      {rendered.ok ? (
        rendered.value.map((line, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: 静态属性行允许重复。
          <p key={index}>{translateLine?.(line) ?? line}</p>
        ))
      ) : (
        <p role="alert">{rendered.error}</p>
      )}
      {removed ? (
        <p>
          指定移除整组：{removed.modId} ·{' '}
          {removed.lines.map((line) => translateLine?.(line) ?? line).join('；')}
        </p>
      ) : (
        <p>将魔法装备升级为稀有装备。</p>
      )}
    </>
  )
}

interface EssenceAdvicePanelProps {
  catalog: CraftCatalog
  state: CraftState
  steps: EssenceAdviceStep[]
  translations: Record<string, string>
  busy: boolean
  onStartEssence: (step: EssenceAdviceStep) => void
  translateLine?: (line: string) => string | null
}

export function EssenceAdvicePanel({
  catalog,
  state,
  steps,
  translations,
  busy,
  onStartEssence,
  translateLine,
}: EssenceAdvicePanelProps) {
  const [showAll, setShowAll] = useState(false)
  if (steps.length === 0) return null
  const modLabel = (id: string) => {
    const mod = catalog.modifiers.find((entry) => entry.id === id)
    return mod ? `${id} · ${mod.lines.map((line) => translateLine?.(line) ?? line).join('；')}` : id
  }
  return (
    <section aria-label="精华目标建议">
      <h4>精华方案 · {steps.length} 种指定结果</h4>
      <p>
        精华保证词缀身份；以下数值是满足目标条件的演练示例，游戏数值仍随机。替换时游戏随机移除一组，指定结果仅用于演练；未比较概率或价格。
      </p>
      {(showAll ? steps : steps.slice(0, 3)).map((step) => {
        const operation = step.operation
        const name =
          catalog.essences?.find((entry) => entry.id === operation.essenceId)?.name ??
          operation.essenceId
        const localized = translations[name] ?? catalog.localizedNames?.['zh-CN']?.[name] ?? name
        const omenName = operation.omen ? ESSENCE_OMEN_RULES[operation.omen].name : null
        return (
          <article
            key={`${operation.essenceId}:${operation.omen ?? ''}:${operation.removeModId ?? ''}`}
          >
            <h4>
              {localized}
              {omenName
                ? ` + ${translations[omenName] ?? catalog.localizedNames?.['zh-CN']?.[omenName] ?? omenName}`
                : ''}
            </h4>
            <EssenceResultDetails
              catalog={catalog}
              state={state}
              operation={operation}
              {...(translateLine ? { translateLine } : {})}
            />
            {operation.removeModId ? (
              <>
                <p className="target-warning">
                  整个合法移除池中的目标风险：
                  {step.atRiskTargetIds.length
                    ? step.atRiskTargetIds.map(modLabel).join('；')
                    : '无现有目标档位'}
                  。
                </p>
                <p>
                  本次指定结果失去目标：
                  {step.lostTargetIds.length ? step.lostTargetIds.map(modLabel).join('；') : '无'}。
                </p>
              </>
            ) : null}
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (!busy && applyCraftStep(catalog, state, operation).ok) onStartEssence(step)
              }}
            >
              预览此精华方案
            </button>
          </article>
        )
      })}
      {steps.length > 3 ? (
        <button type="button" onClick={() => setShowAll(!showAll)}>
          {showAll ? '收起其余精华方案' : `显示全部 ${steps.length} 种精华方案`}
        </button>
      ) : null}
    </section>
  )
}
