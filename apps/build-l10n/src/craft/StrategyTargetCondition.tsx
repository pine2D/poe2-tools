import type {
  CraftCatalog,
  CraftTargetDefinition,
  DefinitionCraftStrategyCondition,
} from '@poe2-tools/item-core'

type Condition = Extract<DefinitionCraftStrategyCondition, { kind: 'selected-targets' }>
interface Props {
  prefix: string
  condition: Condition
  targets: readonly CraftTargetDefinition[]
  orphanedTargets: readonly CraftTargetDefinition[]
  catalog: CraftCatalog
  translateLine?: (line: string) => string | null
  onChange: (value: Condition) => void
}
export function StrategyTargetCondition({
  prefix,
  condition,
  targets,
  orphanedTargets,
  catalog,
  translateLine,
  onChange,
}: Props) {
  const activeIds = targets.map((target) => target.targetId)
  const metadata = new Map(
    [...targets, ...orphanedTargets].map((target) => [target.targetId, target.modId]),
  )
  const ids = [...new Set([...activeIds, ...condition.targetIds])]
  return (
    <div className="strategy-selected-targets">
      <p>选择要检查的主目标组。沿用目标区的数值、替代档位与破裂要求；未选择的目标不参与本条件。</p>
      {ids.map((id) => {
        const modId = metadata.get(id) ?? id
        const line = catalog.modifiers.find((mod) => mod.id === modId)?.lines[0] ?? modId
        const selected = condition.targetIds.includes(id)
        const missing = !activeIds.includes(id)
        return (
          <label className="strategy-target-option" key={id}>
            <input
              type="checkbox"
              aria-label={`${prefix} 目标 ${id}`}
              checked={selected}
              disabled={
                (selected && condition.targetIds.length === 1) ||
                (!selected && condition.targetIds.length >= 6)
              }
              onChange={(event) => {
                const targetIds = event.target.checked
                  ? [...condition.targetIds, id]
                  : condition.targetIds.filter((entry) => entry !== id)
                if (targetIds.length && targetIds.length <= 6)
                  onChange({
                    ...condition,
                    targetIds,
                    min: Math.min(condition.min, targetIds.length),
                  })
              }}
            />
            <span>
              <code>{modId}</code> · {translateLine?.(line) ?? line}
              {missing ? '（已从目标区移除，需修复引用）' : ''}
            </span>
          </label>
        )
      })}
      <p>
        选择一至六组；满六组时请先取消一组再选择新目标。要取消最后一组，请删除此条件或改为其他条件。实际数值未知时不计为满足。
      </p>
      <div className="strategy-toolbar">
        <label>
          满足组数
          <select
            aria-label={`${prefix} 满足组数`}
            value={condition.min}
            onChange={(event) => onChange({ ...condition, min: Number(event.target.value) })}
          >
            {[1, 2, 3, 4, 5, 6].slice(0, condition.targetIds.length).map((count) => (
              <option key={count} value={count}>
                {count}
              </option>
            ))}
          </select>
        </label>
        <label>
          目标组状态
          <select
            aria-label={`${prefix} 目标组状态`}
            value={String(condition.value)}
            onChange={(event) => onChange({ ...condition, value: event.target.value === 'true' })}
          >
            <option value="true">至少达到指定组数</option>
            <option value="false">不足指定组数</option>
          </select>
        </label>
      </div>
    </div>
  )
}
