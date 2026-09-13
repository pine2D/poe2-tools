import {
  type CraftCatalog,
  type CraftState,
  type CraftTargetAlternative,
  type CraftTargetValues,
  inspectNumericLines,
  type LiquidEmotionCraftOperation,
  matchesTargetInterval,
  prepareLiquidEmotionCraft,
  renderNumericLines,
} from '@poe2-tools/item-core'
import { type Ref, useMemo, useState } from 'react'
import { NumericControls } from './NumericControls'
import './essence-catalog.css'

interface Props {
  entryRef?: Ref<HTMLElement>
  configuration?: { emotionId: string }
  catalog: CraftCatalog
  state: CraftState
  translations: Record<string, string>
  translateLine?: (line: string) => string | null
  disabled: boolean
  onPreview: (step: LiquidEmotionCraftOperation) => void
  targetModIds?: string[]
  targetAlternatives?: CraftTargetAlternative[]
  targetValues?: CraftTargetValues[]
}

/** 材料固定属性身份，移除对象与数值只代表用户选择的演练结果。 */
export function LiquidEmotionCraftPanel({
  entryRef,
  catalog,
  state,
  translations,
  translateLine,
  disabled,
  onPreview,
  configuration,
  targetModIds = [],
  targetAlternatives = [],
  targetValues = [],
}: Props) {
  const [query, setQuery] = useState('')
  const [selection, setSelection] = useState<LiquidEmotionCraftOperation | null>(null)
  const entries = useMemo(
    () =>
      (catalog.liquidEmotions ?? []).map((emotion) => ({
        emotion,
        prepared: prepareLiquidEmotionCraft(catalog, state, emotion.id),
      })),
    [catalog, state],
  )
  const local = (name: string) =>
    translations[name] ?? catalog.localizedNames?.['zh-CN']?.[name] ?? name
  const selected = entries.find((entry) => entry.emotion.id === selection?.emotionId)
  const prepared = selected?.prepared
  const mod = prepared?.ok ? prepared.value.mod : undefined
  const removable = prepared?.ok ? prepared.value.removableAffixes : []
  const targetsFor = (id: string) =>
    targetModIds.filter(
      (target) =>
        target === id ||
        targetAlternatives.some((a) => a.targetModId === target && a.modIds.includes(id)),
    )
  const removedTargets = selection ? targetsFor(selection.removeModId) : []
  const atRisk = [...new Set(removable.flatMap((affix) => targetsFor(affix.modId)))]
  const goal = targetValues.find((entry) => entry.modId === mod?.id)
  const valid =
    selection &&
    mod &&
    (!configuration || configuration.emotionId === selection.emotionId) &&
    renderNumericLines(mod.lines, selection.values).ok &&
    removable.some((affix) => affix.modId === selection.removeModId)
  if (!entries.length || catalog.bases.find((base) => base.id === state.baseId)?.type !== 'Jewel')
    return null
  return (
    <details className="essence-catalog essence-craft" open={configuration ? true : undefined}>
      <summary ref={entryRef}>液态情感制作</summary>
      <p>
        游戏随机移除一组词缀，加入材料保证的工艺属性。这里选择一种可能结果进行演练；已有工艺最多一组。
      </p>
      <label>
        搜索液态情感
        <input
          type="search"
          aria-label="搜索液态情感"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      {/* biome-ignore lint/a11y/noNoninteractiveTabindex: 材料列表可滚动，允许键盘聚焦滚动并阅读不可用原因。 */}
      <section className="essence-catalog-list" tabIndex={0} aria-label="液态情感材料列表">
        {entries
          .filter(
            ({ emotion }) =>
              (!configuration || emotion.id === configuration.emotionId) &&
              [emotion.id, emotion.name, local(emotion.name)].some((text) =>
                text.toLowerCase().includes(query.trim().toLowerCase()),
              ),
          )
          .map(({ emotion, prepared: result }) => (
            <article key={emotion.id}>
              <h4>{local(emotion.name)}</h4>
              {result.ok ? (
                <>
                  <p>
                    {result.value.mod.lines.map((line) => translateLine?.(line) ?? line).join('；')}
                  </p>
                  <button
                    type="button"
                    aria-label={`选择液态情感 ${local(emotion.name)}`}
                    disabled={disabled}
                    onClick={() => {
                      const ranges = inspectNumericLines(result.value.mod.lines)
                      if (ranges.ok)
                        setSelection({
                          kind: 'liquid-emotion',
                          emotionId: emotion.id,
                          removeModId: '',
                          values: ranges.value.map((range) => range.min),
                        })
                    }}
                  >
                    选择材料
                  </button>
                </>
              ) : (
                <p>{result.error}</p>
              )}
            </article>
          ))}
      </section>
      {selection && mod ? (
        <fieldset disabled={disabled}>
          <legend>{selected ? local(selected.emotion.name) : '液态情感结果'}</legend>
          {targetsFor(mod.id).length ? (
            <p>保证属性对应目标：{targetsFor(mod.id).join('、')}</p>
          ) : null}
          {atRisk.length ? <p>可能移除已有目标：{atRisk.join('、')}</p> : null}
          <label>
            指定移除整组
            <select
              aria-label="液态情感移除结果"
              value={selection.removeModId}
              onChange={(event) => setSelection({ ...selection, removeModId: event.target.value })}
            >
              <option value="">选择要演练的移除结果</option>
              {removable.map((affix) => (
                <option key={affix.modId} value={affix.modId}>
                  {affix.modId} ·{' '}
                  {affix.lines.map((line) => translateLine?.(line) ?? line).join('；')}
                </option>
              ))}
            </select>
          </label>
          {removedTargets.length ? <p>本次将移除已有目标：{removedTargets.join('、')}</p> : null}
          <NumericControls
            label="液态情感保证属性"
            patterns={mod.lines}
            values={selection.values}
            onChange={(values) => setSelection({ ...selection, values })}
            {...(translateLine ? { translateLine } : {})}
          />
          {goal ? (
            <p>
              {goal.bounds.every((bound) => {
                const value = selection.values[bound.index]
                return (
                  value !== undefined &&
                  Number.isFinite(value) &&
                  matchesTargetInterval({ min: value, max: value }, bound)
                )
              })
                ? '演练数值满足该目标区间。'
                : '演练数值尚未满足该目标区间。'}
            </p>
          ) : null}
          <button type="button" disabled={!valid} onClick={() => onPreview(selection)}>
            预览液态情感结果
          </button>
        </fieldset>
      ) : null}
    </details>
  )
}
