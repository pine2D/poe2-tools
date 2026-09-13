import {
  CRAFT_PROPERTY_LABELS,
  type CraftCatalog,
  type CraftProperty,
  type CraftState,
  type CraftStrategyLeafCondition,
  readCraftProperty,
} from '@poe2-tools/item-core'
import { useState } from 'react'

type Condition = Extract<CraftStrategyLeafCondition, { kind: 'item-property' }>
export function StrategyPropertyCondition({
  condition,
  prefix,
  catalog,
  state,
  canChange,
  onChange,
}: {
  condition: Condition
  prefix: string
  catalog: CraftCatalog
  state: CraftState
  canChange: (condition: Condition) => boolean
  onChange: (condition: Condition) => void
}) {
  const [minimum, setMinimum] = useState(String(condition.min))
  const [maximum, setMaximum] = useState(condition.max === undefined ? '' : String(condition.max))
  const result = readCraftProperty(catalog, state, condition.property)
  const min = Number(minimum)
  const max = maximum.trim() === '' ? undefined : Number(maximum)
  const candidate: Condition = {
    kind: 'item-property',
    property: condition.property,
    min,
    ...(max === undefined ? {} : { max }),
  }
  const valid = minimum.trim() !== '' && canChange(candidate)
  const changed =
    minimum !== String(condition.min) ||
    maximum !== (condition.max === undefined ? '' : String(condition.max))
  return (
    <div>
      <label>
        面板指标
        <select
          aria-label={`${prefix} 面板指标`}
          value={condition.property}
          onChange={(event) =>
            onChange({
              kind: 'item-property',
              property: event.target.value as CraftProperty,
              min: 0,
            })
          }
        >
          {(Object.keys(CRAFT_PROPERTY_LABELS) as CraftProperty[]).map((property) => (
            <option
              key={property}
              value={property}
              disabled={!canChange({ kind: 'item-property', property, min: 0 })}
            >
              {CRAFT_PROPERTY_LABELS[property]}
            </option>
          ))}
        </select>
      </label>
      <p>
        {result.ok
          ? `当前估算：${Number(result.value.toFixed(6))}`
          : `当前无法判断：${result.error}`}
      </p>
      <label>
        面板下限
        <input
          aria-label={`${prefix} 面板下限`}
          type="number"
          min="0"
          step="any"
          value={minimum}
          onChange={(event) => setMinimum(event.target.value)}
        />
      </label>
      <label>
        面板上限（可留空）
        <input
          aria-label={`${prefix} 面板上限`}
          type="number"
          min="0"
          step="any"
          value={maximum}
          onChange={(event) => setMaximum(event.target.value)}
        />
      </label>
      <button
        type="button"
        aria-label={`应用${prefix}面板范围`}
        disabled={!valid || !changed}
        onClick={() => {
          if (valid) onChange(candidate)
        }}
      >
        应用范围
      </button>
      {!valid ? <p role="alert">范围无效：下限须为非负数，上限须不低于下限。</p> : null}
      <p>
        已应用范围：{condition.min}–{condition.max ?? '不限'}，包含上下限。
        {changed ? '编辑值尚未应用。' : ''}
      </p>
      <p>
        按已应用装备估算判断；DPS
        未计技能与装填循环。抗性为本件无条件贡献，元素合计为火、冰、雷之和。未知值取反后仍不匹配。
      </p>
    </div>
  )
}
