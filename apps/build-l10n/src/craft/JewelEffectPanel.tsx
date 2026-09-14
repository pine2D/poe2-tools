import {
  type CraftCatalog,
  type CraftState,
  estimateCraftAffixEffects,
  usesJewelEffect,
} from '@poe2-tools/item-core'
import { useMemo } from 'react'
import './catalysts.css'

export function JewelEffectPanel({
  catalog,
  state,
  preview,
  translateLine,
}: {
  catalog: CraftCatalog
  state: CraftState
  preview: boolean
  translateLine?: (line: string) => string | null
}) {
  const enabled = usesJewelEffect(catalog, state)
  const result = useMemo(
    () => (enabled ? estimateCraftAffixEffects(catalog, state) : null),
    [catalog, state, enabled],
  )
  if (!result) return null
  const text = (line: string) => translateLine?.(line) ?? line
  return (
    <section className="catalyst-panel" aria-label="珠宝词缀增效">
      <details open>
        <summary>珠宝词缀增效</summary>
        <p>{preview ? '显示待应用结果，应用后才写入演练记录。' : '显示当前装备的有效值。'}</p>
        <p className="rehearsal-scope-note">
          词缀卡与制作数值保留基础值；反侧增效与命中标签的催化品质相加，再按来源内部精度计算一次。
          神圣石重掷、移除工艺或撤销后会重新计算。国服真机显示仍待验收。
        </p>
        {!result.ok ? (
          <p role="alert">{result.error}</p>
        ) : (
          result.value.groups.map((group) => (
            <article key={group.id} className="catalyst-group">
              <h4>
                {group.kind === 'prefix' ? '前缀' : '后缀'} ·{' '}
                {group.percent === null ? '增效未知' : `合计增效 ${group.percent}%`}
              </h4>
              {group.lines.map((line) => (
                <div key={line.before} className="catalyst-line">
                  <p>
                    <span className="catalyst-label">基础</span> <span>{text(line.before)}</span>
                  </p>
                  {line.after !== null ? (
                    <p>
                      <span className="catalyst-label">有效</span>{' '}
                      <strong>{text(line.after)}</strong>
                    </p>
                  ) : null}
                  <p className="rehearsal-scope-note">{line.reason}</p>
                </div>
              ))}
            </article>
          ))
        )}
      </details>
    </section>
  )
}
