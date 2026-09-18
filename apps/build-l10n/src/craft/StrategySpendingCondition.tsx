import {
  CRAFT_PRICE_UNITS,
  type CraftPricing,
  type CraftStrategyLeafCondition,
} from '@poe2-tools/item-core'
import { useState } from 'react'

type Condition = Extract<CraftStrategyLeafCondition, { kind: 'spent-cost' }>
export function StrategySpendingCondition({
  condition,
  prefix,
  canChange,
  onChange,
}: {
  condition: Condition
  prefix: string
  canChange: (condition: Condition) => boolean
  onChange: (condition: Condition) => void
}) {
  const [minimum, setMinimum] = useState(String(condition.min))
  const [maximum, setMaximum] = useState(condition.max === undefined ? '' : String(condition.max))
  const candidate: Condition = {
    kind: 'spent-cost',
    unit: condition.unit,
    min: Number(minimum),
    ...(maximum.trim() === '' ? {} : { max: Number(maximum) }),
  }
  const valid = minimum.trim() !== '' && canChange(candidate)
  const changed =
    minimum !== String(condition.min) ||
    maximum !== (condition.max === undefined ? '' : String(condition.max))
  return (
    <div>
      <label>
        费用条件单位
        <select
          aria-label={`${prefix} 费用单位`}
          value={condition.unit}
          onChange={(e) =>
            onChange({ kind: 'spent-cost', unit: e.target.value as CraftPricing['unit'], min: 0 })
          }
        >
          {Object.entries(CRAFT_PRICE_UNITS).map(([unit, label]) => (
            <option key={unit} value={unit}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        已用材料费用下限
        <input
          aria-label={`${prefix} 费用下限`}
          type="number"
          min="0"
          step="0.000001"
          value={minimum}
          onChange={(e) => setMinimum(e.target.value)}
        />
      </label>
      <label>
        已用材料费用上限（可留空）
        <input
          aria-label={`${prefix} 费用上限`}
          type="number"
          min="0"
          step="0.000001"
          value={maximum}
          onChange={(e) => setMaximum(e.target.value)}
        />
      </label>
      <button
        type="button"
        aria-label={`应用${prefix}费用范围`}
        disabled={!valid || !changed}
        onClick={() => {
          if (valid) onChange(candidate)
        }}
      >
        应用范围
      </button>
      {!valid ? (
        <p role="alert">范围须为非负数，最多6位小数且不超过10亿，上限不得低于下限。</p>
      ) : null}
      <p>
        已应用范围：{condition.min}–{condition.max ?? '不限'} {CRAFT_PRICE_UNITS[condition.unit]}
        ，包含上下限。{changed ? '编辑值尚未应用。' : ''}
      </p>
      <p>
        按当前报价累计已应用材料；不含起点成本、未来步骤或返还物抵扣。缺价及单位不一致时暂停判断；改价与撤销会重新计算。切换单位后重新填写范围，不自动换算，也不保证下一步不会超支。
      </p>
    </div>
  )
}
