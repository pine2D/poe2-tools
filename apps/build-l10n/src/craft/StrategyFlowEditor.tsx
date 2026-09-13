import type { CraftStrategy, CraftStrategyDecision, CraftStrategyRule } from '@poe2-tools/item-core'

import { StrategyFlowCanvas } from './StrategyFlowCanvas'

interface Props {
  strategy: CraftStrategy
  decision: CraftStrategyDecision | null
  ruleLabels: readonly string[]
  onEditRule: (index: number) => void
  stageId: string | undefined
  startStep: number
  onChange: (strategy: CraftStrategy) => void
  onRestart: () => void
}
export function StrategyFlowEditor({
  strategy,
  stageId,
  startStep,
  onChange,
  onRestart,
  decision,
  ruleLabels,
  onEditRule,
}: Props) {
  const flow = strategy.flow
  const hasJumps = strategy.rules.some((rule) => rule.action.kind === 'jump')
  if (!flow)
    return (
      <button
        type="button"
        onClick={() =>
          onChange({
            ...strategy,
            flow: { stages: [{ id: 'stage-1', name: '阶段 1' }], entryStageId: 'stage-1' },
            rules: strategy.rules.map((rule) => ({ ...rule, stageId: 'stage-1' })),
          })
        }
      >
        启用分阶段流程
      </button>
    )
  return (
    <section className="strategy-flow" aria-label="分阶段流程">
      <p>
        <strong>
          当前阶段：{flow.stages.find((stage) => stage.id === stageId)?.name ?? '无法判定'}
        </strong>
      </p>
      <p>
        从历史第 {startStep}{' '}
        步之后开始。当前阶段按规则顺序分流，实际应用的材料、档位、预兆和孔位一致才进入下一阶段。相同手动操作也会推进；草稿和揭示中间步骤不推进。
      </p>
      <p>
        修改流程或目标后，从当前装备的入口阶段重新开始；撤销和恢复按实际操作重算。揭示会经过“未揭示”和“已有候选”，请让本阶段规则覆盖这两种状态。
      </p>
      <p>无法执行转向只处理动作开始前的校验，不代表材料已经消耗或随机结果失败。</p>
      <div className="strategy-toolbar">
        <label>
          入口阶段
          <select
            aria-label="入口阶段"
            value={flow.entryStageId}
            onChange={(event) =>
              onChange({ ...strategy, flow: { ...flow, entryStageId: event.target.value } })
            }
          >
            {flow.stages.map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={onRestart}>
          从当前装备重启流程
        </button>
        <button
          type="button"
          disabled={hasJumps}
          onClick={() => {
            if (hasJumps) return
            const { flow: _, ...plain } = strategy
            onChange({
              ...plain,
              rules: strategy.rules.map(
                ({ stageId: _s, nextStageId: _n, onBlockedStageId: _b, ...rule }) => rule,
              ),
            })
          }}
        >
          关闭分阶段流程
        </button>
      </div>
      {hasJumps ? <p>要关闭分阶段流程，请先删除纯跳转规则或将其改为制作／停止动作。</p> : null}
      <StrategyFlowCanvas
        strategy={strategy}
        stageId={stageId}
        decision={decision}
        ruleLabels={ruleLabels}
        onChange={onChange}
        onEditRule={onEditRule}
      />
      <details>
        <summary>阶段与路线（{flow.stages.length} 个阶段）</summary>
        {flow.stages.map((stage) => (
          <div key={stage.id} className="strategy-flow-stage">
            <label>
              阶段名称
              <input
                aria-label={`阶段名称 ${stage.id}`}
                maxLength={80}
                defaultValue={stage.name}
                key={stage.name}
                onBlur={(event) => {
                  const name = event.target.value.trim()
                  if (name && name !== stage.name)
                    onChange({
                      ...strategy,
                      flow: {
                        ...flow,
                        stages: flow.stages.map((entry) =>
                          entry.id === stage.id ? { ...entry, name } : entry,
                        ),
                      },
                    })
                  else event.target.value = stage.name
                }}
              />
            </label>
            <button
              type="button"
              aria-label={`删除阶段 ${stage.id}`}
              disabled={
                flow.stages.length === 1 ||
                flow.entryStageId === stage.id ||
                strategy.rules.some(
                  (rule) =>
                    rule.stageId === stage.id ||
                    rule.nextStageId === stage.id ||
                    rule.onBlockedStageId === stage.id,
                )
              }
              onClick={() =>
                onChange({
                  ...strategy,
                  flow: { ...flow, stages: flow.stages.filter((entry) => entry.id !== stage.id) },
                })
              }
            >
              删除阶段
            </button>
            <p>
              {strategy.rules
                .flatMap((rule, index) =>
                  rule.stageId !== stage.id
                    ? []
                    : [
                        `规则 ${index + 1}${rule.action.kind === 'jump' ? '（仅判断）' : ''} → ${rule.action.kind === 'stop' ? '停止' : flow.stages.find((entry) => entry.id === (rule.nextStageId ?? stage.id))?.name}${rule.onBlockedStageId ? `；无法执行 → ${flow.stages.find((entry) => entry.id === rule.onBlockedStageId)?.name}` : ''}`,
                      ],
                )
                .join('；')}
            </p>
            {!strategy.rules.some((rule) => rule.stageId === stage.id) ? (
              <p>尚无规则，请在下方指定规则所属阶段。</p>
            ) : null}
          </div>
        ))}
        <p>入口及被规则引用的阶段不能删除，请先调整入口、所属阶段、下一阶段或无法执行时的去向。</p>
      </details>
      <button
        type="button"
        disabled={flow.stages.length >= 12}
        onClick={() => {
          let number = 1
          while (flow.stages.some((stage) => stage.id === `stage-${number}`)) number++
          onChange({
            ...strategy,
            flow: {
              ...flow,
              stages: [...flow.stages, { id: `stage-${number}`, name: `阶段 ${number}` }],
            },
          })
        }}
      >
        添加阶段
      </button>
    </section>
  )
}
export function StrategyRuleStages({
  strategy,
  rule,
  number,
  onChange,
}: {
  strategy: CraftStrategy
  rule: CraftStrategyRule
  number: number
  onChange: (rule: CraftStrategyRule) => void
}) {
  if (!strategy.flow) return null
  const options = strategy.flow.stages.map((stage) => (
    <option key={stage.id} value={stage.id}>
      {stage.name}
    </option>
  ))
  return (
    <div className="strategy-toolbar">
      <label>
        所属阶段
        <select
          aria-label={`规则 ${number} 所属阶段`}
          value={rule.stageId}
          onChange={(event) => onChange({ ...rule, stageId: event.target.value })}
        >
          {options}
        </select>
      </label>
      {rule.action.kind !== 'stop' ? (
        <label>
          {rule.action.kind === 'jump' ? '跳转阶段' : '应用后阶段'}
          <select
            aria-label={`规则 ${number} ${rule.action.kind === 'jump' ? '跳转阶段' : '应用后阶段'}`}
            value={rule.nextStageId ?? ''}
            onChange={(event) => {
              if (rule.action.kind === 'jump' && !event.target.value) return
              const { nextStageId: _, ...rest } = rule
              onChange({
                ...rest,
                ...(event.target.value ? { nextStageId: event.target.value } : {}),
              })
            }}
          >
            {rule.action.kind !== 'jump' ? <option value="">留在本阶段</option> : null}
            {options}
          </select>
        </label>
      ) : null}
      {rule.action.kind !== 'stop' && rule.action.kind !== 'jump' ? (
        <label>
          无法执行时
          <select
            aria-label={`规则 ${number} 无法执行时`}
            value={rule.onBlockedStageId ?? ''}
            onChange={(event) => {
              const { onBlockedStageId: _, ...rest } = rule
              onChange({
                ...rest,
                ...(event.target.value ? { onBlockedStageId: event.target.value } : {}),
              })
            }}
          >
            <option value="">停止并显示原因</option>
            {options}
          </select>
        </label>
      ) : null}
    </div>
  )
}
