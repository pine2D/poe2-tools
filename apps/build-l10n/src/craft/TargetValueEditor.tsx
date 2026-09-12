import {
  type CatalogMod,
  type CraftCatalog,
  type CraftTargetAlternative,
  type CraftTargetValues,
  inspectNumericLines,
  validateCraftTargetValues,
} from '@poe2-tools/item-core'
import { useRef, useState } from 'react'

interface Props {
  catalog: CraftCatalog
  baseId: string
  ids: string[]
  alternatives?: CraftTargetAlternative[]
  values: CraftTargetValues[]
  mod: CatalogMod
  onChange: (values: CraftTargetValues[]) => void
  translateLine?: (line: string) => string | null
}

export function TargetValueEditor({
  catalog,
  baseId,
  ids,
  alternatives = [],
  values,
  mod,
  onChange,
  translateLine,
}: Props) {
  const ranges = inspectNumericLines(mod.lines)
  const saved = values.find((entry) => entry.modId === mod.id)
  const [open, setOpen] = useState(false)
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
  const rootRef = useRef<HTMLDivElement>(null)
  if (!ranges.ok || ranges.value.length === 0) return null
  const save = () => {
    // 未完成的数字也可能暴露为空 value，不能当成用户清空条件。
    if (
      [...(rootRef.current?.querySelectorAll('input') ?? [])].some(
        (input) => input.validity.badInput,
      )
    ) {
      setMessage('请先输入完整数字；未完成的数字不会清除原有条件。')
      return
    }
    const bounds = ranges.value.flatMap((range) => {
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
    const next = values.filter((entry) => entry.modId !== mod.id)
    if (bounds.length > 0) next.push({ modId: mod.id, bounds })
    const checked = validateCraftTargetValues(catalog, baseId, ids, next, alternatives)
    if (!checked.ok) {
      setMessage(checked.error)
      return
    }
    onChange(checked.value)
    setMessage('')
    setOpen(false)
  }
  return (
    <div className="target-value-editor" ref={rootRef}>
      <button
        type="button"
        aria-label={`设置数值条件 ${mod.id}`}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        设置数值条件
      </button>
      {saved ? (
        <button
          type="button"
          aria-label={`清除数值条件 ${mod.id}`}
          onClick={() => onChange(values.filter((entry) => entry.modId !== mod.id))}
        >
          清除数值条件
        </button>
      ) : null}
      {open ? (
        <section aria-label={`${mod.id} 数值条件`}>
          <p>空白表示不限；上下限包含边界。条件只比较所选档位，不自动判断数值越大越好。</p>
          {ranges.value.map((range) => (
            <fieldset key={range.index}>
              <legend>
                数值 {range.index + 1} · {range.min} 至 {range.max}
              </legend>
              <p>
                {translateLine?.(mod.lines[range.lineIndex] ?? '') ?? mod.lines[range.lineIndex]}
              </p>
              <div className="target-bound-fields">
                {(['min', 'max'] as const).map((side) => (
                  <label key={side}>
                    {side === 'min' ? '最小值' : '最大值'}
                    <input
                      type="number"
                      step="any"
                      min={range.min}
                      max={range.max}
                      aria-label={`${mod.id} · 数值 ${range.index + 1} ${side === 'min' ? '最小值' : '最大值'}`}
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
            <p className="target-warning" role="alert">
              {message}
            </p>
          ) : null}
          <button type="button" aria-label={`保存数值条件 ${mod.id}`} onClick={save}>
            保存条件
          </button>
        </section>
      ) : null}
    </div>
  )
}
