import {
  CRAFT_STRATEGY_AFFIX_LIMITS,
  type DefinitionCraftStrategyLeafCondition,
} from '@poe2-tools/item-core'

type Condition = Extract<DefinitionCraftStrategyLeafCondition, { kind: 'desecrated-count' }>
export function StrategyDesecrationCountCondition({
  condition,
  prefix,
  onChange,
}: {
  condition: Condition
  prefix: string
  onChange: (condition: Condition) => void
}) {
  return (
    <>
      <label>
        计数来源
        <select
          aria-label={`${prefix} 亵渎计数来源`}
          value={condition.source}
          onChange={(event) =>
            onChange({ ...condition, source: event.target.value as Condition['source'] })
          }
        >
          <option value="unrevealed">未揭示占位</option>
          <option value="revealed">已揭示亵渎词缀</option>
        </select>
      </label>
      {(['min', 'max'] as const).map((bound) => {
        const label = bound === 'min' ? '亵渎数量下限' : '亵渎数量上限'
        return (
          <label key={bound}>
            {label}
            <select
              aria-label={`${prefix} ${label}`}
              value={condition[bound]}
              onChange={(event) => {
                const value = Number(event.target.value)
                onChange({
                  ...condition,
                  [bound]: value,
                  ...(bound === 'min'
                    ? { max: Math.max(condition.max, value) }
                    : { min: Math.min(condition.min, value) }),
                })
              }}
            >
              {Array.from({ length: CRAFT_STRATEGY_AFFIX_LIMITS['affix-count'] + 1 }, (_, n) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: 固定数量选项以实际数值为身份。
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )
      })}
      <p>
        包含上下限。固定候选和回响仍计入未揭示占位；确认后才减少。腐烂预兆揭示出的普通词缀不计入已揭示亵渎词缀。
      </p>
    </>
  )
}
