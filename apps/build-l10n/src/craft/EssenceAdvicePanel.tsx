import {
  type AlloyCraftOperation,
  applyCraftStep,
  type CraftCatalog,
  type CraftState,
  type CraftTargetDefinitions,
  type DefinitionEssenceAdviceStep,
  ESSENCE_OMEN_RULES,
  type EssenceCraftOperation,
  type LiquidEmotionCraftOperation,
  prepareAlloyCraft,
  prepareEssenceCraft,
  prepareLiquidEmotionCraft,
  renderNumericLines,
  resolveCraftAffix,
} from '@poe2-tools/item-core'
import { useState } from 'react'

interface EssenceResultDetailsProps {
  catalog: CraftCatalog
  state: CraftState
  operation: EssenceCraftOperation | LiquidEmotionCraftOperation | AlloyCraftOperation
  translateLine?: (line: string) => string | null
}

export function EssenceResultDetails({
  catalog,
  state,
  operation,
  translateLine,
}: EssenceResultDetailsProps) {
  const prepared =
    operation.kind === 'alloy'
      ? prepareAlloyCraft(catalog, state, operation.alloyId)
      : operation.kind === 'liquid-emotion'
        ? prepareLiquidEmotionCraft(catalog, state, operation.emotionId, operation.resultKind)
        : prepareEssenceCraft(
            catalog,
            state,
            operation.essenceId,
            operation.omen,
            operation.resultModId,
          )
  if (!prepared.ok) return <p role="alert">{prepared.error}</p>
  const rendered = renderNumericLines(prepared.value.mod.lines, operation.values)
  const resolved =
    operation.removeModId !== undefined
      ? resolveCraftAffix(state, {
          modId: operation.removeModId,
          ...(operation.removeAffixId === undefined ? {} : { affixId: operation.removeAffixId }),
        })
      : null
  if (resolved && !resolved.ok) return <p role="alert">{resolved.error}</p>
  const removed = resolved?.ok ? resolved.value.affix : undefined
  return (
    <>
      {operation.kind === 'liquid-emotion' ? (
        <p>
          液态保证结果：{prepared.value.mod.kind === 'prefix' ? '前缀' : '后缀'}
          。方向与移除对象仅为指定演练结果。
        </p>
      ) : null}
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
  definitions: CraftTargetDefinitions
  steps: DefinitionEssenceAdviceStep[]
  translations: Record<string, string>
  busy: boolean
  onStartEssence: (step: DefinitionEssenceAdviceStep) => void
  translateLine?: (line: string) => string | null
}

export function EssenceAdvicePanel({
  catalog,
  state,
  steps,
  definitions,
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
  const targetLabel = (targetId: string) => {
    const target = definitions.targets.find((target) => target.targetId === targetId)
    return target ? modLabel(target.modId) : '已失联目标'
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
            key={`${operation.essenceId}:${operation.resultModId ?? ''}:${operation.omen ?? ''}:${operation.removeAffixId ?? operation.removeModId ?? ''}`}
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
                  {step.atRiskModIds.length
                    ? step.atRiskModIds.map(modLabel).join('；')
                    : '无现有目标档位'}
                  。
                </p>
                <p>
                  本次指定结果失去目标：
                  {step.lostTargetIds.length
                    ? step.lostTargetIds.map(targetLabel).join('；')
                    : '无'}
                  。
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
