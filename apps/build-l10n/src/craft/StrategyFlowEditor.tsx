import type { CraftStrategy, CraftStrategyRule } from '@poe2-tools/item-core'

interface Props {
  strategy: CraftStrategy
  stageId: string | undefined
  startStep: number
  onChange: (strategy: CraftStrategy) => void
  onRestart: () => void
}
export function StrategyFlowEditor({ strategy, stageId, startStep, onChange, onRestart }: Props) {
  const flow = strategy.flow
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
          onClick={() => {
            const { flow: _, ...plain } = strategy
            onChange({
              ...plain,
              rules: strategy.rules.map(({ stageId: _s, nextStageId: _n, ...rule }) => rule),
            })
          }}
        >
          关闭分阶段流程
        </button>
      </div>
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
                  (rule) => rule.stageId === stage.id || rule.nextStageId === stage.id,
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
                        `规则 ${index + 1} → ${rule.action.kind === 'stop' ? '停止' : flow.stages.find((entry) => entry.id === (rule.nextStageId ?? stage.id))?.name}`,
                      ],
                )
                .join('；')}
            </p>
            {!strategy.rules.some((rule) => rule.stageId === stage.id) ? (
              <p>尚无规则，请在下方指定规则所属阶段。</p>
            ) : null}
          </div>
        ))}
        <p>入口及被规则引用的阶段不能删除，请先调整入口、所属阶段或下一阶段。</p>
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
          应用后阶段
          <select
            aria-label={`规则 ${number} 应用后阶段`}
            value={rule.nextStageId ?? ''}
            onChange={(event) => {
              const { nextStageId: _, ...rest } = rule
              onChange({
                ...rest,
                ...(event.target.value ? { nextStageId: event.target.value } : {}),
              })
            }}
          >
            <option value="">留在本阶段</option>
            {options}
          </select>
        </label>
      ) : null}
    </div>
  )
}
