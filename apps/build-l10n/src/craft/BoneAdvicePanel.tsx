import {
  applyCraftStep,
  BONE_RULES,
  type BoneCraftOperation,
  type CraftCatalog,
  type CraftState,
  type CraftTargetDefinitions,
  type DefinitionBoneAdviceStep,
  renderNumericLines,
  resolveCraftAffix,
} from '@poe2-tools/item-core'
import { useState } from 'react'
import { boneOmenLabels, boneRevealOmenLabel } from './boneOmenLabels'

interface Labels {
  catalog: CraftCatalog
  translations?: Record<string, string>
  translateLine?: (line: string) => string | null
}
export function BoneOperationDetails({
  catalog,
  operation,
  state,
  translations = {},
  translateLine,
}: Labels & { operation: BoneCraftOperation; state?: CraftState }) {
  const removal =
    state && operation.kind === 'desecrate' && operation.removeModId
      ? resolveCraftAffix(state, {
          modId: operation.removeModId,
          ...(operation.removeAffixId === undefined ? {} : { affixId: operation.removeAffixId }),
        })
      : null
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
      <div>
        <p>
          指定{operation.affixKind === 'prefix' ? '前缀' : '后缀'}亵渎占位。
          {operation.removeModId ? `容量已满，本次指定移除：${operation.removeModId}。` : ''}
        </p>
        {removal?.ok ? (
          <section aria-label="本次骨骼移除词缀">
            {removal.value.affix.lines.map((line, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: 已有词缀可包含重复静态行。
              <p key={`${index}:${line}`}>
                {translateLine?.(line) ? <span>{translateLine(line)} · </span> : null}
                <code>{line}</code>
              </p>
            ))}
          </section>
        ) : null}
        {boneOmenLabels(operation, catalog, translations).length ? (
          <p>
            施加预兆：
            {boneOmenLabels(operation, catalog, translations)
              .map((entry) => entry.label)
              .join('、')}
            ；各消耗一份。
          </p>
        ) : null}
        {operation.removeModId && (operation.directionOmen || operation.lichOmen) ? (
          <p>
            这里只列出本工具可完成三候选的移除结果，不代表其他游戏结果不可能，也不保证目标受到保护。
          </p>
        ) : null}
        {operation.lichOmen ? (
          <p>候选限定为同一指定巫妖的三项；不足三项的情形本工具暂不支持。</p>
        ) : null}
      </div>
    )
  if (operation.kind === 'desecration-offer' || operation.kind === 'desecration-reroll')
    return (
      <section
        aria-label={
          operation.kind === 'desecration-reroll' ? '建议固定第二组三项' : '建议固定三项候选'
        }
      >
        <p>
          {operation.kind === 'desecration-reroll'
            ? '固定第二组三项，首组仍保留，两组任选一项；不额外计费。'
            : '演练指定首组三项候选，最终只选择一项；不保证游戏出现这些选项。'}
        </p>
        {operation.kind === 'desecration-offer' && operation.revealOmen ? (
          <p>
            {boneRevealOmenLabel(operation.revealOmen, catalog, translations)}
            ：成功固定首组即消耗一份，不重选也不退还。
          </p>
        ) : null}
        {operation.modIds.map((id) => modDetails(id))}
      </section>
    )
  return (
    <section aria-label="建议揭示结果">
      <p>从已固定的候选组中选择，以下数值为指定结果示例，不保证游戏随机数值。</p>
      {modDetails(operation.modId, operation.values)}
    </section>
  )
}
interface Props extends Labels {
  state: CraftState
  definitions: CraftTargetDefinitions
  steps: DefinitionBoneAdviceStep[]
  translations: Record<string, string>
  busy: boolean
  onPreview: (operation: BoneCraftOperation) => void
}
export function BoneAdvicePanel({
  catalog,
  state,
  steps,
  definitions,
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
  const targetLabel = (targetId: string) => {
    const target = definitions.targets.find((target) => target.targetId === targetId)
    return target ? label(target.modId) : '已失联目标'
  }
  const title = (operation: BoneCraftOperation) => {
    if (operation.kind === 'desecration-offer')
      return (
        '固定三项亵渎候选' +
        (operation.revealOmen
          ? ` + ${boneRevealOmenLabel(operation.revealOmen, catalog, translations)}`
          : '')
      )
    if (operation.kind === 'desecration-reroll') return '重选第二组三项候选'
    if (operation.kind === 'desecration-reveal') return '完成亵渎揭示'
    const name = BONE_RULES[operation.boneId].name
    return [
      translations[name] ?? catalog.localizedNames?.['zh-CN']?.[name] ?? name,
      ...boneOmenLabels(operation, catalog, translations).map((entry) => entry.label),
    ].join(' + ')
  }
  return (
    <section aria-label="骨骼目标建议">
      <h4>骨骼与揭示 · {steps.length} 种指定结果</h4>
      <p>
        施加骨骼、固定候选、重选和揭示分别演练；骨骼及施加预兆在施加时计费，回响在固定首组时另计一份，重选与最终揭示免费。未揭示期间支持破裂，以及珠宝未固定候选时保留占位的液态工艺；其余交错结果待核对。
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
            state={state}
            operation={step.operation}
            translations={translations}
            {...(translateLine ? { translateLine } : {})}
          />
          {step.randomRemovalRisk ? (
            <p className="target-warning">
              满容量包含随机移除；指定安全结果不代表随机安全。本工具可演练移除池内的目标风险：
              {step.atRiskModIds.length
                ? step.atRiskModIds.map(label).join('；')
                : '无现有目标档位'}
              。
            </p>
          ) : null}
          {step.lostTargetIds.length ? (
            <p className="target-warning">
              本次指定结果失去目标：{step.lostTargetIds.map(targetLabel).join('；')}
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
