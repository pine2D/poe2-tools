import {
  CATALYSTS,
  type CraftCatalog,
  type CraftState,
  catalystChoices,
  estimateCatalystEffects,
  isBasicJewel,
  usesJewelEffect,
} from '@poe2-tools/item-core'
import { useId, useMemo, useState } from 'react'
import './catalysts.css'

const KINDS = { implicit: '固有属性', prefix: '前缀', suffix: '后缀', corruption: '腐化强化' }

export function CatalystPreviewPanel({
  catalog,
  state,
  translations,
  translateLine,
}: {
  catalog: CraftCatalog
  state: CraftState
  translations: Record<string, string>
  translateLine?: (line: string) => string | null
}) {
  const id = useId()
  const [catalyst, setCatalyst] = useState(state.catalyst?.id ?? 'Flesh')
  const [quality, setQuality] = useState(String(state.catalyst?.quality ?? 20))
  const options = useMemo(() => catalystChoices(catalog, state), [catalog, state])
  const result = useMemo(
    () =>
      estimateCatalystEffects(
        catalog,
        state,
        catalyst,
        quality === '' ? Number.NaN : Number(quality),
      ),
    [catalog, state, catalyst, quality],
  )
  const base = catalog.bases.find((entry) => entry.id === state.baseId)
  const hasEffect = usesJewelEffect(catalog, state)
  if (!base || (!['Ring', 'Amulet'].includes(base.type) && !isBasicJewel(base))) return null
  const groups = result.ok
    ? result.value.groups.filter(
        (group) =>
          group.matched ||
          group.lines.some((line) => line.status === 'unknown' || line.status === 'estimated'),
      )
    : []
  const unchanged = result.ok ? result.value.groups.length - groups.length : 0
  const text = (line: string) => translateLine?.(line) ?? line
  return (
    <section className="catalyst-panel" aria-label="催化剂效果预览">
      {state.catalyst ? (
        <section aria-label="当前催化品质">
          <h4>
            当前催化品质：{CATALYSTS.find((entry) => entry.id === state.catalyst?.id)?.label} ·{' '}
            {state.catalyst.quality}%
          </h4>
          <p>起点已有品质不计材料费用；当前品质按实际演练步骤更新并保存。</p>
        </section>
      ) : null}
      <details open={state.catalyst ? true : undefined}>
        <summary>比较催化剂效果</summary>
        <p className="rehearsal-scope-note">
          {state.catalyst
            ? '默认显示当前催化品质下的估算值；修改下方选项仅作比较，不改变已保存品质。'
            : '比较当前基础属性在指定品质下的估算值，未施加到装备，不计材料费用。'}
          每颗催化剂的品质增量仍待核实，预览品质不代表材料颗数。
          {hasEffect ? '比较包含已有珠宝反侧增效，命中催化标签时相加后一次计算。' : ''}
        </p>
        {options.ok ? (
          <>
            <div className="catalyst-fields">
              <label htmlFor={`${id}-type`}>
                催化剂类型
                <select
                  id={`${id}-type`}
                  value={catalyst}
                  onChange={(event) => setCatalyst(event.target.value)}
                >
                  {options.value.choices.map((choice) => (
                    <option key={choice.id} value={choice.id}>
                      {translations[choice.name] ?? choice.name} · {choice.label}
                    </option>
                  ))}
                </select>
              </label>
              <label htmlFor={`${id}-quality`}>
                预览品质（%）
                <input
                  id={`${id}-quality`}
                  type="number"
                  min={0}
                  max={options.value.maxQuality}
                  step={1}
                  value={quality}
                  onChange={(event) => setQuality(event.target.value)}
                />
              </label>
            </div>
            <p>
              当前装备的预览上限：{options.value.maxQuality}
              %。切换类型会重新比较，不叠加不同催化效果。
            </p>
          </>
        ) : null}
        {!result.ok ? (
          <p role="alert">{result.error}</p>
        ) : (
          <>
            <p>
              按词缀标签匹配，优先采用来源缩放能力与内部精度；缺资料时仅按显示精度估算。游戏版本和真机显示仍待验收。
            </p>
            {groups.length === 0 ? <p>当前没有命中这类标签的属性。</p> : null}
            {groups.map((group) => (
              <article key={group.id} className="catalyst-group">
                <h4>
                  {KINDS[group.kind]}
                  {group.matched
                    ? ' · 标签命中'
                    : group.lines.some((line) => line.status === 'estimated')
                      ? ' · 珠宝增效'
                      : ' · 对应关系待核对'}
                </h4>
                {group.lines.map((line) => (
                  <div key={line.before} className="catalyst-line">
                    <p>
                      <span className="catalyst-label">基础</span> <span>{text(line.before)}</span>
                    </p>
                    {line.after !== null ? (
                      <div>
                        <p>
                          <span className="catalyst-label">
                            {hasEffect ? '增效与品质合并估算' : `${quality}% 估算`}
                          </span>{' '}
                          <strong>{text(line.after)}</strong>
                        </p>
                        <small className="catalyst-label">
                          {line.basis === 'metadata'
                            ? '依据：词缀缩放资料'
                            : '依据：目录显示精度，缩放资料缺失'}
                        </small>
                      </div>
                    ) : (
                      <p className="rehearsal-scope-note">{line.reason}</p>
                    )}
                  </div>
                ))}
              </article>
            ))}
            {unchanged > 0 ? <p>另有 {unchanged} 组属性未命中此类标签，保持当前数值。</p> : null}
          </>
        )}
      </details>
    </section>
  )
}
