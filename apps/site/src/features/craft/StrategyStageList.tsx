import type { DefinitionCraftStrategy } from '@poe2-tools/item-core'

export function StrategyStageList({
  strategy,
  onChange,
  labelPrefix = '',
}: {
  strategy: DefinitionCraftStrategy
  onChange: (strategy: DefinitionCraftStrategy) => void
  labelPrefix?: string
}) {
  const flow = strategy.flow
  if (!flow) return null
  return (
    <>
      {flow.stages.map((stage) => (
        <div key={stage.id} className="strategy-flow-stage">
          <label>
            阶段名称
            <input
              aria-label={`${labelPrefix}阶段名称 ${stage.id}`}
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
            aria-label={`删除${labelPrefix}阶段 ${stage.id}`}
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
    </>
  )
}
