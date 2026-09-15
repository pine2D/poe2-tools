import {
  type AlloyAdviceStep,
  applyCraftStep,
  type CraftCatalog,
  type CraftState,
  type CraftStep,
} from '@poe2-tools/item-core'
import { useState } from 'react'
import { EssenceResultDetails } from './EssenceAdvicePanel'

export function AlloyAdvicePanel({
  catalog,
  state,
  steps,
  translations,
  busy,
  onPreview,
  translateLine,
}: {
  catalog: CraftCatalog
  state: CraftState
  steps: AlloyAdviceStep[]
  translations: Record<string, string>
  busy: boolean
  onPreview: (operation: CraftStep) => void
  translateLine?: (line: string) => string | null
}) {
  const [showAll, setShowAll] = useState(false)
  if (!steps.length) return null
  const local = (name: string) =>
    translations[name] ?? catalog.localizedNames?.['zh-CN']?.[name] ?? name
  return (
    <section aria-label="合金目标建议">
      <h4>合金方案 · {steps.length} 种指定结果</h4>
      <p>
        合金保证属性身份；以下为推进目标的指定结果，包含君王抗性增效。移除对象与数值仍随机，未比较成功率或价格。
      </p>
      {(showAll ? steps : steps.slice(0, 3)).map((step) => (
        <article
          key={`${step.operation.alloyId}:${step.operation.removeAffixId ?? step.operation.removeModId}:${step.operation.values.join(',')}`}
        >
          <h4>
            {local(
              catalog.alloys?.alloys.find((entry) => entry.id === step.operation.alloyId)?.name ??
                step.operation.alloyId,
            )}
          </h4>
          <p>
            应用后达成 {step.matchedTargetIds.length} 组目标；新增达成 {step.gainedTargetIds.length}{' '}
            组。
          </p>
          <EssenceResultDetails
            catalog={catalog}
            state={state}
            operation={step.operation}
            {...(translateLine ? { translateLine } : {})}
          />
          {step.atRiskTargetIds.length ? (
            <p>
              随机移除池中存在已有目标：{step.atRiskTargetIds.join('、')}
              。指定安全结果不代表随机安全。
            </p>
          ) : null}
          {step.lostTargetIds.length ? (
            <p>此结果将移除或使已有目标失配：{step.lostTargetIds.join('、')}</p>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (!busy && applyCraftStep(catalog, state, step.operation).ok)
                onPreview(step.operation)
            }}
          >
            演练此合金结果
          </button>
        </article>
      ))}
      {steps.length > 3 ? (
        <button type="button" onClick={() => setShowAll((value) => !value)}>
          {showAll ? '收起合金方案' : '显示全部合金方案'}
        </button>
      ) : null}
    </section>
  )
}
