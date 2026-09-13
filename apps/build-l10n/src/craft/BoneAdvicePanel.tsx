import {
  applyCraftStep,
  BONE_RULES,
  type BoneCraftOperation,
  type CraftBoneAdviceStep,
  type CraftCatalog,
  type CraftState,
  renderNumericLines,
} from '@poe2-tools/item-core'
import { useState } from 'react'

interface Labels {
  catalog: CraftCatalog
  translateLine?: (line: string) => string | null
}
export function BoneOperationDetails({
  catalog,
  operation,
  translateLine,
}: Labels & { operation: BoneCraftOperation }) {
  const modDetails = (id: string, values?: number[]) => {
    const mod = catalog.modifiers.find((mod) => mod.id === id)
    const rendered = mod && values ? renderNumericLines(mod.lines, values) : null
    const lines = rendered?.ok ? rendered.value : (mod?.lines ?? [])
    return (
      <div key={id}>
        <strong>
          {id}
          {mod?.desecratedOnly ? ' · 亵渎专属' : ''}
        </strong>
        {lines.map((line, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: 静态属性行允许重复，不含局部状态。
          <p key={`${index}:${line}`}>
            {translateLine?.(line) ? <span>{translateLine(line)} · </span> : null}
            <code>{line}</code>
          </p>
        ))}
      </div>
    )
  }
  if (operation.kind === 'desecrate')
    return (
      <p>
        指定{operation.affixKind === 'prefix' ? '前缀' : '后缀'}亵渎占位。
        {operation.removeModId ? `满六组，本次指定移除：${operation.removeModId}。` : ''}
      </p>
    )
  if (operation.kind === 'desecration-offer')
    return (
      <section aria-label="建议固定三项候选">
        <p>演练指定以下三项候选，最终只选择一项；不保证游戏出现这些选项。</p>
        {operation.modIds.map((id) => modDetails(id))}
      </section>
    )
  return (
    <section aria-label="建议揭示结果">
      <p>从已固定三项中选择，以下数值为指定结果示例，不保证游戏随机数值。</p>
      {modDetails(operation.modId, operation.values)}
    </section>
  )
}
interface Props extends Labels {
  state: CraftState
  steps: CraftBoneAdviceStep[]
  translations: Record<string, string>
  busy: boolean
  onPreview: (operation: BoneCraftOperation) => void
}
export function BoneAdvicePanel({
  catalog,
  state,
  steps,
  translations,
  busy,
  onPreview,
  translateLine,
}: Props) {
  const [showAll, setShowAll] = useState(false)
  if (!steps.length) return null
  const label = (id: string) => {
    const mod = catalog.modifiers.find((mod) => mod.id === id)
    return `${id} · ${mod?.lines.map((line) => translateLine?.(line) ?? line).join('；') ?? id}`
  }
  const title = (operation: BoneCraftOperation) => {
    if (operation.kind === 'desecration-offer') return '固定三项亵渎候选'
    if (operation.kind === 'desecration-reveal') return '完成亵渎揭示'
    const name = BONE_RULES[operation.boneId].name
    return translations[name] ?? catalog.localizedNames?.['zh-CN']?.[name] ?? name
  }
  return (
    <section aria-label="骨骼目标建议">
      <h4>骨骼与揭示 · {steps.length} 种指定结果</h4>
      <p>
        施加骨骼、固定候选、选择揭示分别作为一步演练；只在施加骨骼时消耗材料。未揭示期间的交错制作尚未在本工具实现。
      </p>
      {(showAll ? steps : steps.slice(0, 3)).map((step) => (
        <article key={JSON.stringify(step.operation)}>
          <h4>{title(step.operation)}</h4>
          <p>
            {step.targetModIds.length
              ? `可推进目标：${step.targetModIds.map(label).join('；')}`
              : '此项用于完成揭示，不代表推进缺失目标。'}
          </p>
          <BoneOperationDetails
            catalog={catalog}
            operation={step.operation}
            {...(translateLine ? { translateLine } : {})}
          />
          {step.randomRemovalRisk ? (
            <p className="target-warning">
              游戏实际从全部已有词缀随机移除；指定安全结果不代表随机安全。整个移除池内的目标风险：
              {step.atRiskTargetIds.length
                ? step.atRiskTargetIds.map(label).join('；')
                : '无现有目标档位'}
              。
            </p>
          ) : null}
          {step.lostTargetIds.length ? (
            <p className="target-warning">
              本次指定移除的目标词缀：{step.lostTargetIds.map(label).join('；')}
            </p>
          ) : null}
          <button
            type="button"
            disabled={busy}
            aria-label={`预览骨骼建议：${title(step.operation)}${step.operation.kind === 'desecration-reveal' ? ` ${step.operation.modId}` : ''}`}
            onClick={() => {
              if (!busy && applyCraftStep(catalog, state, step.operation).ok)
                onPreview(step.operation)
            }}
          >
            预览此骨骼或揭示步骤
          </button>
        </article>
      ))}
      {steps.length > 3 ? (
        <button type="button" onClick={() => setShowAll(!showAll)}>
          {showAll ? '收起其余骨骼建议' : `显示全部 ${steps.length} 种骨骼建议`}
        </button>
      ) : null}
    </section>
  )
}
