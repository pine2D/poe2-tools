import {
  analyzeCraftImplicitTargets,
  type CraftCatalog,
  type CraftImplicitTargetCandidate,
  type CraftImplicitTargetValues,
  type CraftState,
  craftImplicitTargetCandidates,
  validateCraftImplicitTargets,
} from '@poe2-tools/item-core'
import { useMemo, useRef, useState } from 'react'

interface Props {
  catalog: CraftCatalog
  state: CraftState
  values: CraftImplicitTargetValues[]
  onChange: (values: CraftImplicitTargetValues[]) => void
  translateLine?: (line: string) => string | null
}
export function ImplicitTargetEditor(props: Props) {
  const candidates = useMemo(
    () => craftImplicitTargetCandidates(props.catalog, props.state),
    [props.catalog, props.state],
  )
  const analysis = useMemo(
    () => analyzeCraftImplicitTargets(props.catalog, props.state, props.values),
    [props.catalog, props.state, props.values],
  )
  if (!candidates.ok) return <p role="status">{candidates.error}</p>
  if (!candidates.value.length) return null
  return (
    <section className="target-list" aria-label="固有属性目标">
      <h4>固有属性条件</h4>
      <p>目录范围用于设置条件，当前可重掷范围以各行说明为准。空白表示不限；保存条件不消耗材料。</p>
      {candidates.value.map((candidate) => (
        <article key={candidate.lineIndex}>
          <h5>固有属性 {candidate.lineIndex + 1}</h5>
          {props.translateLine?.(candidate.line) ? (
            <p>{props.translateLine(candidate.line)}</p>
          ) : null}
          <code>{candidate.line}</code>
          <p>
            当前数值：{candidate.actual.map((value) => value ?? '未知').join('、')}；
            {candidate.rerollable ? '当前可重掷' : '当前不可重掷'}
          </p>
          {candidate.reasons.map((reason) => (
            <p key={reason}>{reason}</p>
          ))}
          {analysis.ok ? (
            analysis.value
              .filter((target) => target.lineIndex === candidate.lineIndex)
              .map((target) => (
                <div key={target.lineIndex}>
                  <p>{target.matched ? '固有目标已达成' : '固有目标未达成'}</p>
                  {target.numeric.map((bound) => (
                    <p key={bound.index}>
                      数值 {bound.index + 1}：{bound.min === undefined ? '' : `至少 ${bound.min}`}{' '}
                      {bound.max === undefined ? '' : `至多 ${bound.max}`} ·{' '}
                      {bound.matched ? '达成' : '未达成'}
                    </p>
                  ))}
                  {target.reasons
                    .filter((reason) => !candidate.reasons.includes(reason))
                    .map((reason) => (
                      <p key={reason}>{reason}</p>
                    ))}
                </div>
              ))
          ) : (
            <p role="status">{analysis.error}</p>
          )}
          <RowEditor
            key={JSON.stringify(
              props.values.find((value) => value.lineIndex === candidate.lineIndex) ?? null,
            )}
            {...props}
            candidate={candidate}
          />
        </article>
      ))}
    </section>
  )
}
function RowEditor({
  catalog,
  state,
  values,
  onChange,
  candidate,
}: Props & { candidate: CraftImplicitTargetCandidate }) {
  const saved = values.find((value) => value.lineIndex === candidate.lineIndex)
  const [inputs, setInputs] = useState<Record<number, { min: string; max: string }>>(() =>
    Object.fromEntries(
      saved?.bounds.map((bound) => [
        bound.index,
        {
          min: bound.min === undefined ? '' : String(bound.min),
          max: bound.max === undefined ? '' : String(bound.max),
        },
      ]) ?? [],
    ),
  )
  const [message, setMessage] = useState('')
  const root = useRef<HTMLDivElement>(null)
  const save = () => {
    if (
      [...(root.current?.querySelectorAll('input') ?? [])].some((input) => input.validity.badInput)
    ) {
      setMessage('请先输入完整数字；未完成的数字不会清除原有条件。')
      return
    }
    const bounds = candidate.ranges.flatMap((range) => {
      const input = inputs[range.index]
      if (!input || (input.min === '' && input.max === '')) return []
      return [
        {
          index: range.index,
          ...(input.min === '' ? {} : { min: Number(input.min) }),
          ...(input.max === '' ? {} : { max: Number(input.max) }),
        },
      ]
    })
    const next = values.filter((value) => value.lineIndex !== candidate.lineIndex)
    if (bounds.length) next.push({ lineIndex: candidate.lineIndex, bounds })
    const checked = validateCraftImplicitTargets(catalog, state.baseId, next)
    if (!checked.ok) {
      setMessage(checked.error)
      return
    }
    onChange(checked.value)
    setMessage('')
  }
  return (
    <div className="target-value-editor" ref={root}>
      {candidate.ranges.map((range) => (
        <fieldset key={range.index}>
          <legend>
            数值 {range.index + 1} · 目录条件范围：{range.min} 至 {range.max}
          </legend>
          <div className="target-bound-fields">
            {(['min', 'max'] as const).map((side) => (
              <label key={side}>
                {side === 'min' ? '下限' : '上限'}
                <input
                  type="number"
                  step="any"
                  min={range.min}
                  max={range.max}
                  aria-label={`固有属性 ${candidate.lineIndex + 1} · 数值 ${range.index + 1} ${side === 'min' ? '下限' : '上限'}`}
                  value={inputs[range.index]?.[side] ?? ''}
                  onChange={(event) => {
                    setInputs({
                      ...inputs,
                      [range.index]: {
                        min: inputs[range.index]?.min ?? '',
                        max: inputs[range.index]?.max ?? '',
                        [side]: event.target.value,
                      },
                    })
                    setMessage('')
                  }}
                />
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      {message ? (
        <p role="alert" className="target-warning">
          {message}
        </p>
      ) : null}
      <button
        type="button"
        aria-label={`保存固有属性 ${candidate.lineIndex + 1} 条件`}
        onClick={save}
      >
        保存固有属性条件
      </button>
      <button
        type="button"
        aria-label={`清空固有属性 ${candidate.lineIndex + 1} 条件`}
        onClick={() => {
          onChange(values.filter((value) => value.lineIndex !== candidate.lineIndex))
          setInputs({})
          setMessage('')
        }}
      >
        清空固有属性条件
      </button>
    </div>
  )
}
