import {
  CRAFT_PROPERTY_LABELS,
  type CraftCatalog,
  type CraftProperty,
  type CraftState,
  readWeightedProperties,
  type WeightedPropertiesCondition,
} from '@poe2-tools/item-core'
import { useState } from 'react'

const properties = Object.keys(CRAFT_PROPERTY_LABELS) as CraftProperty[]

export function StrategyWeightedPropertyCondition({
  condition,
  prefix,
  catalog,
  state,
  canChange,
  onChange,
}: {
  condition: WeightedPropertiesCondition
  prefix: string
  catalog: CraftCatalog
  state: CraftState
  canChange: (condition: WeightedPropertiesCondition) => boolean
  onChange: (condition: WeightedPropertiesCondition) => void
}) {
  const [terms, setTerms] = useState(
    condition.terms.map((term) => ({ property: term.property, weight: String(term.weight) })),
  )
  const [minimum, setMinimum] = useState(String(condition.min))
  const [maximum, setMaximum] = useState(condition.max === undefined ? '' : String(condition.max))
  const candidate: WeightedPropertiesCondition = {
    kind: 'weighted-properties',
    terms: terms.map((term) => ({ property: term.property, weight: Number(term.weight) })),
    min: Number(minimum),
    ...(maximum.trim() === '' ? {} : { max: Number(maximum) }),
  }
  const valid =
    minimum.trim() !== '' &&
    terms.every((term) => term.weight.trim() !== '') &&
    canChange(candidate)
  const changed = JSON.stringify(candidate) !== JSON.stringify(condition)
  const result = readWeightedProperties(catalog, state, condition.terms)
  const unused = properties.find((property) => !terms.some((term) => term.property === property))
  return (
    <div>
      <p>
        合计 = 各项装备面板估算 ×
        自填系数之和。系数表达你的取舍，不是词缀出现概率；不会计算角色最终战斗表现。
      </p>
      {terms.map((term, index) => (
        <fieldset key={term.property}>
          <legend>指标 {index + 1}</legend>
          <label>
            指标
            <select
              aria-label={`${prefix} 第 ${index + 1} 项指标`}
              value={term.property}
              onChange={(event) =>
                setTerms(
                  terms.map((entry, i) =>
                    i === index
                      ? { ...entry, property: event.target.value as CraftProperty }
                      : entry,
                  ),
                )
              }
            >
              {properties.map((property) => (
                <option
                  key={property}
                  value={property}
                  disabled={terms.some((entry, i) => i !== index && entry.property === property)}
                >
                  {CRAFT_PROPERTY_LABELS[property]}
                </option>
              ))}
            </select>
          </label>
          <label>
            系数
            <input
              aria-label={`${prefix} 第 ${index + 1} 项系数`}
              type="number"
              step="any"
              min="-1000000"
              max="1000000"
              value={term.weight}
              onChange={(event) =>
                setTerms(
                  terms.map((entry, i) =>
                    i === index ? { ...entry, weight: event.target.value } : entry,
                  ),
                )
              }
            />
          </label>
          <button
            type="button"
            aria-label={`${prefix} 删除第 ${index + 1} 项`}
            disabled={terms.length === 1}
            onClick={() => setTerms(terms.filter((_, i) => i !== index))}
          >
            删除指标
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        aria-label={`${prefix} 添加指标`}
        disabled={terms.length >= 4 || !unused}
        onClick={() => {
          if (terms.length < 4 && unused) setTerms([...terms, { property: unused, weight: '1' }])
        }}
      >
        添加指标
      </button>
      <label>
        合计下限
        <input
          aria-label={`${prefix} 合计下限`}
          type="number"
          step="any"
          value={minimum}
          onChange={(event) => setMinimum(event.target.value)}
        />
      </label>
      <label>
        合计上限（可留空）
        <input
          aria-label={`${prefix} 合计上限`}
          type="number"
          step="any"
          value={maximum}
          onChange={(event) => setMaximum(event.target.value)}
        />
      </label>
      <button
        type="button"
        aria-label={`应用${prefix}加权条件`}
        disabled={!valid || !changed}
        onClick={() => {
          if (valid) onChange(candidate)
        }}
      >
        应用加权条件
      </button>
      {!valid ? (
        <p role="alert">
          条件无效：须有 1–4
          项不同指标，系数须非零且绝对值不超过一百万；下限必填，上限须不低于下限，数值不能超出安全范围。
        </p>
      ) : null}
      <p>
        已应用公式：
        {condition.terms
          .map((term) => `${CRAFT_PROPERTY_LABELS[term.property]} × (${term.weight})`)
          .join(' + ')}
      </p>
      <p>{result.ok ? `当前已应用合计：${result.value}` : `当前合计无法判断：${result.error}`}</p>
      <p>
        已应用范围：{condition.min}–{condition.max ?? '不限'}，包含上下限。
        {changed ? '编辑值尚未应用。' : ''}
      </p>
      <p>
        任一项未知时整个条件未知，取反后也不匹配。不同单位的换算由系数决定；合计不额外四舍五入。
      </p>
    </div>
  )
}
