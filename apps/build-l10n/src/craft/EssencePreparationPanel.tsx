import {
  applyCraftStep,
  CRAFT_CURRENCY_LABELS,
  type CraftCatalog,
  type CraftOperation,
  type CraftState,
  type CraftTargetDefinitions,
  type DefinitionEssencePreparationRoute,
  ESSENCE_OMEN_RULES,
} from '@poe2-tools/item-core'
import { useState } from 'react'
import { EssenceResultDetails } from './EssenceAdvicePanel'

interface EssencePreparationPanelProps {
  catalog: CraftCatalog
  state: CraftState
  definitions: CraftTargetDefinitions
  routes: DefinitionEssencePreparationRoute[]
  truncated: boolean
  translations: Record<string, string>
  busy: boolean
  onStartPreparation: (operation: CraftOperation) => void
  translateLine?: (line: string) => string | null
}

export function EssencePreparationPanel({
  catalog,
  state,
  routes,
  definitions,
  truncated,
  translations,
  busy,
  onStartPreparation,
  translateLine,
}: EssencePreparationPanelProps) {
  const [showAll, setShowAll] = useState(false)
  if (!routes.length && !truncated) return null
  const localize = (name: string) =>
    translations[name] ?? catalog.localizedNames?.['zh-CN']?.[name] ?? name
  const modLabel = (id: string) => {
    const mod = catalog.modifiers.find((mod) => mod.id === id)
    return mod ? `${id} · ${mod.lines.map((line) => translateLine?.(line) ?? line).join('；')}` : id
  }
  const targetLabel = (targetId: string) => {
    const target = definitions.targets.find((target) => target.targetId === targetId)
    return target ? modLabel(target.modId) : '已失联目标'
  }
  return (
    <section aria-label="精华准备路线">
      <h4>示例准备路线 · {routes.length} 条</h4>
      <p>
        每步按指定结果演练，实际结果改变后重新核对。以下为有限搜索找到的示例，未比较概率或价格，也不代表全部制作路线。精华保证词缀身份，数值仍随机。
      </p>
      <p>预计材料尚未消耗；仅在确认应用每一步后计入历史费用。</p>
      {truncated ? <p>已达到搜索预算；未找到的路线不代表游戏中不可达。</p> : null}
      {(showAll ? routes : routes.slice(0, 3)).map((route) => {
        let preparedState = state
        const preparations = []
        for (const operation of route.preparations) {
          const applied = applyCraftStep(catalog, preparedState, operation)
          if (!applied.ok) return null
          preparations.push({
            operation,
            added: applied.value.affixes.filter((affix) =>
              affix.affixId === undefined
                ? !preparedState.affixes.some((previous) => previous.modId === affix.modId)
                : !preparedState.affixes.some((previous) => previous.affixId === affix.affixId),
            ),
          })
          preparedState = applied.value
        }
        const first = route.preparations[0]
        if (!first) return null
        const final = route.final.operation
        const name = localize(
          catalog.essences?.find((entry) => entry.id === final.essenceId)?.name ?? final.essenceId,
        )
        const omenName = final.omen ? localize(ESSENCE_OMEN_RULES[final.omen].name) : null
        return (
          <article key={JSON.stringify([route.preparations, final])}>
            {preparations.map(({ operation, added }, index) => (
              <div key={operation.currency}>
                <h4>
                  {index + 1}. {CRAFT_CURRENCY_LABELS[operation.currency]}
                </h4>
                {added.map((affix) => (
                  <p key={affix.affixId ?? affix.modId}>
                    {affix.modId} ·{' '}
                    {affix.lines.map((line) => translateLine?.(line) ?? line).join('；')}
                  </p>
                ))}
              </div>
            ))}
            <h4>
              {preparations.length + 1}. {name}
              {omenName ? ` + ${omenName}` : ''}
            </h4>
            <EssenceResultDetails
              catalog={catalog}
              state={preparedState}
              operation={final}
              {...(translateLine ? { translateLine } : {})}
            />
            {final.removeModId ? (
              <>
                <p>
                  整个合法移除池中的目标风险：
                  {route.final.atRiskModIds.map(modLabel).join('；') || '无现有目标档位'}。
                </p>
                <p>
                  本次指定结果失去目标：
                  {route.final.lostTargetIds.map(targetLabel).join('；') || '无'}。
                </p>
              </>
            ) : null}
            <p>
              预计材料：
              {[
                ...route.preparations.map(
                  (operation) => `${CRAFT_CURRENCY_LABELS[operation.currency]} 1 份`,
                ),
                `${name} 1 份`,
                ...(omenName ? [`${omenName} 1 份`] : []),
              ].join('、')}
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={(event) => {
                if (busy) return
                event.currentTarget.focus()
                onStartPreparation(first)
              }}
            >
              预览第一步
            </button>
          </article>
        )
      })}
      {routes.length > 3 ? (
        <button type="button" disabled={busy} onClick={() => setShowAll(!showAll)}>
          {showAll ? '收起其余准备路线' : `显示全部 ${routes.length} 条准备路线`}
        </button>
      ) : null}
    </section>
  )
}
