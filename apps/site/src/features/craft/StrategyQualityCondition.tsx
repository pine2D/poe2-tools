import { CATALYSTS, type CraftState, type CraftStrategyLeafCondition } from '@poe2-tools/item-core'
import { useState } from 'react'

type Condition = Extract<CraftStrategyLeafCondition, { kind: 'quality' }>
export function StrategyQualityCondition({
  condition,
  prefix,
  state,
  canChange,
  onChange,
}: {
  condition: Condition
  prefix: string
  state: CraftState
  canChange: (value: Condition) => boolean
  onChange: (value: Condition) => void
}) {
  const [minimum, setMinimum] = useState(String(condition.min))
  const [maximum, setMaximum] = useState(condition.max === undefined ? '' : String(condition.max))
  const candidate: Condition = { ...condition, min: Number(minimum) }
  if (maximum.trim() !== '') candidate.max = Number(maximum)
  else delete candidate.max
  const valid = minimum.trim() !== '' && canChange(candidate)
  const changed =
    minimum !== String(condition.min) ||
    maximum !== (condition.max === undefined ? '' : String(condition.max))
  const current = condition.source === 'ordinary' ? state.quality : state.catalyst?.quality
  const catalyst = CATALYSTS.find((entry) => entry.id === state.catalyst?.id)
  return (
    <div>
      <label>
        品质来源
        <select
          aria-label={`${prefix} 品质来源`}
          value={condition.source}
          onChange={(event) =>
            onChange({
              kind: 'quality',
              source: event.target.value as Condition['source'],
              min: condition.min,
              ...(condition.max === undefined ? {} : { max: condition.max }),
            })
          }
        >
          <option value="ordinary">普通品质</option>
          <option value="catalyst">催化品质</option>
        </select>
      </label>
      {condition.source === 'catalyst' ? (
        <label>
          催化类型
          <select
            aria-label={`${prefix} 催化类型`}
            value={condition.catalystId ?? ''}
            onChange={(event) => {
              const next = { ...condition }
              if (event.target.value) next.catalystId = event.target.value
              else delete next.catalystId
              onChange(next)
            }}
          >
            <option value="">任意已知催化类型</option>
            {CATALYSTS.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <p>
        {current === undefined
          ? '当前品质未知：该来源没有已核对的品质记录。'
          : `当前品质：${condition.source === 'catalyst' ? `${catalyst?.label ?? ''} · ` : ''}${current}%`}
      </p>
      <label>
        品质下限（%）
        <input
          aria-label={`${prefix} 品质下限`}
          type="number"
          min="0"
          max="100"
          step="1"
          value={minimum}
          onChange={(event) => setMinimum(event.target.value)}
        />
      </label>
      <label>
        品质上限（%·可留空）
        <input
          aria-label={`${prefix} 品质上限`}
          type="number"
          min="0"
          max="100"
          step="1"
          value={maximum}
          onChange={(event) => setMaximum(event.target.value)}
        />
      </label>
      <button
        type="button"
        aria-label={`应用${prefix}品质范围`}
        disabled={!valid || !changed}
        onClick={() => {
          if (valid) onChange(candidate)
        }}
      >
        应用范围
      </button>
      {!valid ? <p role="alert">品质范围须为 0–100 的整数，上限须不低于下限。</p> : null}
      <p>
        已应用品质范围：{condition.min}–{condition.max ?? '不限'}%，包含上下限。
        {changed ? '编辑值尚未应用。' : ''}
      </p>
      <p>
        按当前已应用装备判断；预览品质不参与。缺失记录不视为
        0，未知值取反后仍不匹配；已知催化类型不同视为不匹配。
      </p>
    </div>
  )
}
