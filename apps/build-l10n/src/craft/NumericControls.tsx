import { inspectNumericLines, renderNumericLines, sampleNumericValues } from '@poe2-tools/item-core'
import { useId, useMemo, useState } from 'react'
import './numeric.css'

interface NumericControlsProps {
  label: string
  patterns: string[]
  values: number[]
  onChange: (values: number[]) => void
  translateLine?: (line: string) => string | null
}

export function NumericControls({
  label,
  patterns,
  values,
  onChange,
  translateLine,
}: NumericControlsProps) {
  const id = useId()
  const [message, setMessage] = useState('')
  const ranges = useMemo(() => inspectNumericLines(patterns), [patterns])
  const preview = useMemo(() => renderNumericLines(patterns, values), [patterns, values])
  if (!ranges.ok) return <p role="alert">{ranges.error}</p>
  return (
    <section className="numeric-controls" aria-label={`${label}数值`}>
      <h4>{label}</h4>
      <div className="numeric-fields">
        {ranges.value.map((range) => (
          <label key={range.index} htmlFor={`${id}-${range.index}`}>
            <span>
              数值 {range.index + 1} · {range.min} 至 {range.max}
            </span>
            <span className="numeric-context">
              {translateLine?.(patterns[range.lineIndex] ?? '') ?? patterns[range.lineIndex]}
            </span>
            <input
              id={`${id}-${range.index}`}
              aria-label={`${label} · 数值 ${range.index + 1}`}
              type="number"
              min={range.min}
              max={range.max}
              step={range.step}
              value={Number.isFinite(values[range.index]) ? values[range.index] : ''}
              onChange={(event) => {
                const next = [...values]
                next[range.index] =
                  event.target.value === '' ? Number.NaN : Number(event.target.value)
                onChange(next)
                setMessage('')
              }}
            />
          </label>
        ))}
      </div>
      {ranges.value.length > 0 ? (
        <>
          <button
            type="button"
            aria-label={`按范围试掷：${label}`}
            onClick={() => {
              const sampled = sampleNumericValues(patterns, Math.random)
              if (sampled.ok) {
                onChange(sampled.value)
                setMessage('')
              } else setMessage(sampled.error)
            }}
          >
            按范围试掷
          </button>
          <p className="numeric-note">
            各范围按显示精度独立等概率试掷，仅为演练假设，不代表游戏真实分布；精度可能比游戏内部更粗。
          </p>
        </>
      ) : null}
      {message ? <p role="alert">{message}</p> : null}
      {preview.ok ? (
        <section className="numeric-preview" aria-label={`${label}数值预览`}>
          {preview.value.map((line) => (
            <div key={line}>
              {translateLine?.(line) ? <span>{translateLine(line)}</span> : null}
              <code>{line}</code>
            </div>
          ))}
        </section>
      ) : (
        <p role="alert">{preview.error}</p>
      )}
    </section>
  )
}
