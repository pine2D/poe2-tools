import {
  analyzeCraftImplicitTargets,
  type CraftCatalog,
  type CraftImplicitTargetCandidate,
  type CraftImplicitTargetValues,
  type CraftState,
  craftImplicitTargetCandidates,
  craftImplicitTargetKey,
  inspectNumericLines,
  projectImplicitTargetValues,
  validateStoredCraftImplicitTargets,
} from '@poe2-tools/item-core'
import { useEffect, useMemo, useRef, useState } from 'react'

interface Props {
  context?: unknown
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
  const visible: CraftImplicitTargetCandidate[] = candidates.ok
    ? candidates.value
    : props.values.flatMap((value) => {
        const line = props.catalog.bases
          .find((base) => base.id === props.state.baseId)
          ?.implicit?.split('\n')[value.lineIndex]
        if (line === undefined) return []
        const ranges =
          value.kind === 'granted-skill-sockets'
            ? { ok: true as const, value: [{ index: 0, lineIndex: 0, min: 2, max: 5, step: 1 }] }
            : inspectNumericLines([line])
        if (!ranges.ok) return []
        return [
          {
            ...(value.kind ? { kind: value.kind } : {}),
            lineIndex: value.lineIndex,
            line,
            ranges: ranges.value,
            actual: ranges.value.map(() => null),
            rerollable: false,
            reasons: [candidates.error],
          },
        ]
      })
  if (!visible.length) return candidates.ok ? null : <p role="status">{candidates.error}</p>
  return (
    <section className="target-list" aria-label="固有属性目标">
      <h4>固有属性条件</h4>
      <p>目录范围用于设置条件，实际可用操作以各行说明为准。空白表示不限；保存条件不消耗材料。</p>
      {visible.map((candidate) => (
        <article key={craftImplicitTargetKey(candidate)}>
          <h5>
            {candidate.kind === 'granted-skill-sockets' ? '技能辅助孔' : '固有属性'}{' '}
            {candidate.lineIndex + 1}
          </h5>
          {props.translateLine?.(candidate.line) ? (
            <p>{props.translateLine(candidate.line)}</p>
          ) : null}
          <code>{candidate.line}</code>
          {candidate.kind === 'granted-skill' ? (
            <>
              <p>装备固有技能最高等级：{candidate.actual[0] ?? '未知'}</p>
              <p>
                目标判断装备自身最高等级，不使用角色当前显示等级。完美溶剂升级至20级，神圣石不会升级该技能。
              </p>
            </>
          ) : candidate.kind === 'granted-skill-sockets' ? (
            <p>
              装备技能辅助孔：{candidate.actual[0] ?? '未知'}
              ；已有孔数需在制作起点核对，增加孔数使用工匠石。
            </p>
          ) : (
            <p>
              当前基础数值：{candidate.actual.map((value) => value ?? '未知').join('、')}；
              {candidate.rerollable ? '当前可重掷' : '当前不可重掷'}
            </p>
          )}
          {candidate.reasons.map((reason) => (
            <p key={reason}>{reason}</p>
          ))}
          {analysis.ok ? (
            analysis.value
              .filter(
                (target) => craftImplicitTargetKey(target) === craftImplicitTargetKey(candidate),
              )
              .map((target) => (
                <div key={craftImplicitTargetKey(target)}>
                  <p>{target.matched ? '固有目标已达成' : '固有目标未达成'}</p>
                  {target.numeric.map((bound) => (
                    <p key={bound.index}>
                      {candidate.kind === 'granted-skill'
                        ? '装备技能最高等级'
                        : candidate.kind === 'granted-skill-sockets'
                          ? '技能辅助孔'
                          : props.values.find(
                                (entry) =>
                                  craftImplicitTargetKey(entry) === craftImplicitTargetKey(target),
                              )?.basis === 'effective'
                            ? '品质后'
                            : '基础'}
                      数值 {bound.index + 1}： 当前{' '}
                      {bound.actualRange
                        ? `${bound.actualRange.min}–${bound.actualRange.max}`
                        : (bound.actual ?? '未知')}
                      ；{bound.min === undefined ? '' : `至少 ${bound.min}`}{' '}
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
              props.values.find(
                (value) => craftImplicitTargetKey(value) === craftImplicitTargetKey(candidate),
              ) ?? null,
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
  context,
  catalog,
  state,
  values,
  onChange,
  candidate,
}: Props & { candidate: CraftImplicitTargetCandidate }) {
  const saved = values.find(
    (value) => craftImplicitTargetKey(value) === craftImplicitTargetKey(candidate),
  )
  const [basis, setBasis] = useState(saved?.basis ?? 'base')
  const projection =
    basis === 'effective' ? projectImplicitTargetValues(catalog, state, candidate.lineIndex) : null
  const ranges = projection?.ok ? projection.value.ranges : candidate.ranges
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
  // biome-ignore lint/correctness/useExhaustiveDependencies: 快照或目标上下文变化必须丢弃尚未保存的数值草稿。
  useEffect(() => {
    const current = values.find(
      (value) => craftImplicitTargetKey(value) === craftImplicitTargetKey(candidate),
    )
    setBasis(current?.basis ?? 'base')
    setInputs(
      Object.fromEntries(
        current?.bounds.map((bound) => [
          bound.index,
          {
            min: bound.min === undefined ? '' : String(bound.min),
            max: bound.max === undefined ? '' : String(bound.max),
          },
        ]) ?? [],
      ),
    )
    setMessage('')
  }, [catalog, state, values, candidate.lineIndex, candidate.kind, context])
  const save = () => {
    if (
      [...(root.current?.querySelectorAll('input') ?? [])].some((input) => input.validity.badInput)
    ) {
      setMessage('请先输入完整数字；未完成的数字不会清除原有条件。')
      return
    }
    const bounds = ranges.flatMap((range) => {
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
    const next = values.filter(
      (value) => craftImplicitTargetKey(value) !== craftImplicitTargetKey(candidate),
    )
    if (bounds.length)
      next.push({
        ...(candidate.kind ? { kind: candidate.kind } : {}),
        lineIndex: candidate.lineIndex,
        bounds,
        ...(basis === 'effective' ? { basis: 'effective' as const } : {}),
      })
    const checked = validateStoredCraftImplicitTargets(catalog, state.baseId, next)
    if (!checked.ok) {
      setMessage(checked.error)
      return
    }
    onChange(checked.value)
    setMessage('')
  }
  return (
    <div className="target-value-editor" ref={root}>
      {candidate.kind === undefined ? (
        <label>
          条件口径
          <select
            aria-label={`${candidate.kind === 'granted-skill-sockets' ? '技能辅助孔' : '固有属性'} ${candidate.lineIndex + 1} · 条件口径`}
            value={basis}
            onChange={(event) => {
              setBasis(event.target.value)
              setInputs({})
              setMessage('')
            }}
          >
            <option value="base">基础值</option>
            <option value="effective">品质后有效值</option>
          </select>
        </label>
      ) : null}
      {basis === 'effective' ? (
        <p>按当前品质判断所有可能结果；切换口径后重新输入，品质变化保留原阈值。</p>
      ) : null}
      {projection && !projection.ok ? <p role="alert">{projection.error}</p> : null}
      {ranges.map((range) => (
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
                  step={candidate.kind ? '1' : 'any'}
                  min={basis === 'effective' ? undefined : range.min}
                  max={basis === 'effective' ? undefined : range.max}
                  aria-label={`${candidate.kind === 'granted-skill-sockets' ? '技能辅助孔' : '固有属性'} ${candidate.lineIndex + 1} · 数值 ${range.index + 1} ${side === 'min' ? '下限' : '上限'}`}
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
        aria-label={`保存${candidate.kind === 'granted-skill-sockets' ? '技能辅助孔' : '固有属性'} ${candidate.lineIndex + 1} 条件`}
        onClick={save}
      >
        保存固有属性条件
      </button>
      <button
        type="button"
        aria-label={`清空${candidate.kind === 'granted-skill-sockets' ? '技能辅助孔' : '固有属性'} ${candidate.lineIndex + 1} 条件`}
        onClick={() => {
          onChange(
            values.filter(
              (value) => craftImplicitTargetKey(value) !== craftImplicitTargetKey(candidate),
            ),
          )
          setInputs({})
          setMessage('')
        }}
      >
        清空固有属性条件
      </button>
    </div>
  )
}
