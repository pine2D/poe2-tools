import {
  CATALYSTS,
  type CraftCatalog,
  type CraftState,
  catalystChoices,
  estimateCatalystEffects,
  isBasicJewel,
  isRadiusJewel,
  usesExplicitModEffect,
} from '@poe2-tools/item-core'
import { useEffect, useId, useMemo, useState } from 'react'
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
  const [comparisonDraft, setComparison] = useState<{
    catalog: CraftCatalog
    catalyst: string
    quality: string
  } | null>(null)
  const comparison = comparisonDraft?.catalog === catalog ? comparisonDraft : null
  useEffect(() => {
    if (comparisonDraft && comparisonDraft.catalog !== catalog) setComparison(null)
  }, [catalog, comparisonDraft])
  const catalyst = comparison?.catalyst ?? state.catalyst?.id ?? 'Flesh'
  const quality = comparison?.quality ?? String(state.catalyst?.quality ?? 20)
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
  const hasEffect = usesExplicitModEffect(catalog, state)
  if (
    !base ||
    (!['Ring', 'Amulet'].includes(base.type) && !isBasicJewel(base) && !isRadiusJewel(base))
  )
    return null
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
    <section className="catalyst-panel" aria-label="催化剂效果预览" data-craft-tool="catalyst">
      {state.catalyst ? (
        <section aria-label="当前催化品质">
          <h4>
            当前催化品质：{CATALYSTS.find((entry) => entry.id === state.catalyst?.id)?.label} ·{' '}
            {state.catalyst.quality}%
          </h4>
          <p>起点已有品质不计材料费用；当前品质按实际演练步骤更新并保存。</p>
          {options.ok && state.catalyst.quality > options.value.maxQuality ? (
            <p>
              已有品质保留，不因当前上限降低而减少；只按当前已保存的类型与数值估算，不代表可重新施加到该数值。
            </p>
          ) : null}
        </section>
      ) : null}
      <details open={state.catalyst ? true : undefined}>
        <summary>比较催化剂效果</summary>
        {isRadiusJewel(base) ? (
          <p className="rehearsal-scope-note">
            范围属性作用于指定天赋，以下比较保留完整范围条件；未计算覆盖的天赋数量和角色总收益。
            缺少缩放资料时的显示精度估算不用于判定有效数值目标达成。
          </p>
        ) : null}
        <p className="rehearsal-scope-note">
          {comparison
            ? '正在比较手动指定的品质；制作和撤销会保留此选择。比较未施加到装备，不计材料费用。'
            : state.catalyst
              ? '跟随当前催化品质显示估算值；修改下方选项仅作比较，不改变已保存品质。'
              : '比较当前基础属性在指定品质下的估算值，未施加到装备，不计材料费用。'}
          每颗催化剂的品质增量仍待核实，预览品质不代表材料颗数。
          {hasEffect ? '比较包含已有工艺增效，命中催化标签时相加后一次计算。' : ''}
        </p>
        {options.ok ? (
          <>
            <div className="catalyst-fields">
              <label htmlFor={`${id}-type`}>
                催化剂类型
                <select
                  id={`${id}-type`}
                  value={catalyst}
                  onChange={(event) =>
                    setComparison({ catalog, catalyst: event.target.value, quality })
                  }
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
                  max={Math.max(
                    options.value.maxQuality,
                    catalyst === state.catalyst?.id && quality === String(state.catalyst.quality)
                      ? state.catalyst.quality
                      : 0,
                  )}
                  step={1}
                  value={quality}
                  onChange={(event) =>
                    setComparison({ catalog, catalyst, quality: event.target.value })
                  }
                />
              </label>
            </div>
            {comparison && state.catalyst ? (
              <button type="button" onClick={() => setComparison(null)}>
                按当前品质比较
              </button>
            ) : null}
            <p>
              当前可施加上限：{options.value.maxQuality}
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
                      ? ' · 工艺增效'
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
