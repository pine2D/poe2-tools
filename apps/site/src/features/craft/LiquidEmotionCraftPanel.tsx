import {
  applyCraftStep,
  type CraftCatalog,
  type CraftState,
  type CraftTargetDefinitions,
  definitionTargetIdsForMods,
  inspectLiquidEmotions,
  inspectNumericLines,
  type LiquidEmotionCraftOperation,
  matchesTargetInterval,
  prepareLiquidEmotionCraft,
  projectCraftTargetValues,
  renderNumericLines,
  resolveCraftAffix,
  targetDefinitionChanges,
} from '@poe2-tools/item-core'
import { type Ref, useMemo, useState } from 'react'
import { matchesLiquidEmotion } from './liquidEmotionSearch'
import { NumericControls } from './NumericControls'
import './essence-catalog.css'

interface Props {
  entryRef?: Ref<HTMLElement>
  configuration?: { emotionId: string }
  catalog: CraftCatalog
  definitions: CraftTargetDefinitions
  state: CraftState
  translations: Record<string, string>
  translateLine?: (line: string) => string | null
  disabled: boolean
  onPreview: (step: LiquidEmotionCraftOperation) => void
}

/** 材料固定属性身份，移除对象与数值只代表用户选择的演练结果。 */
export function LiquidEmotionCraftPanel({
  entryRef,
  catalog,
  definitions,
  state,
  translations,
  translateLine,
  disabled,
  onPreview,
  configuration,
}: Props) {
  const [query, setQuery] = useState('')
  const context = useMemo(
    () => ({ catalog, state, configuration, definitions }),
    [catalog, state, configuration, definitions],
  )
  const [draft, setDraft] = useState<{
    context: typeof context
    selection: LiquidEmotionCraftOperation
  } | null>(null)
  const selection = draft?.context === context ? draft.selection : null
  const setSelection = (selection: LiquidEmotionCraftOperation | null) =>
    setDraft(selection ? { context, selection } : null)
  const entries = useMemo(() => {
    const base = catalog.bases.find((entry) => entry.id === state.baseId)
    if (!base) return []
    return inspectLiquidEmotions(catalog, base).map((inspection) => ({
      ...inspection,
      options: inspection.outcomes.map((mod) => {
        const resultKind = inspection.outcomes.length > 1 ? mod.kind : undefined
        return {
          mod,
          resultKind,
          prepared: prepareLiquidEmotionCraft(catalog, state, inspection.emotion.id, resultKind),
        }
      }),
    }))
  }, [catalog, state])
  const local = (name: string) =>
    translations[name] ?? catalog.localizedNames?.['zh-CN']?.[name] ?? name
  const selected = entries.find((entry) => entry.emotion.id === selection?.emotionId)
  const prepared = selected?.options.find(
    (option) => option.resultKind === selection?.resultKind,
  )?.prepared
  const mod = prepared?.ok ? prepared.value.mod : undefined
  const removable = prepared?.ok ? prepared.value.removableAffixes : []
  const targetLabels = (ids: string[]) =>
    definitions.targets
      .filter((target) => ids.includes(target.targetId))
      .map((target) => target.modId)
  const targetsFor = (id: string) => targetLabels(definitionTargetIdsForMods(definitions, [id]))
  const result = selection ? applyCraftStep(catalog, state, selection) : null
  const removedTargets = result?.ok
    ? targetLabels(targetDefinitionChanges(catalog, state, result.value, definitions).lostTargetIds)
    : []
  const atRisk = [...new Set(removable.flatMap((affix) => targetsFor(affix.modId)))]
  const goal = definitions.values.find((entry) => entry.modId === mod?.id)
  const projected = mod
    ? projectCraftTargetValues(catalog, result?.ok ? result.value : state, mod, goal)
    : null
  const targetText = mod && selection ? renderNumericLines(mod.lines, selection.values) : null
  const actualTargetValues =
    projected?.ok && targetText?.ok ? projected.value.read(targetText.value) : null
  const meetsBounds =
    actualTargetValues?.ok &&
    goal?.bounds.every((bound) =>
      matchesTargetInterval(actualTargetValues.value[bound.index], bound),
    )
  const removed = selection?.removeModId
    ? resolveCraftAffix(state, {
        modId: selection.removeModId,
        ...(selection.removeAffixId === undefined ? {} : { affixId: selection.removeAffixId }),
      })
    : null
  const valid =
    selection &&
    mod &&
    (!configuration || configuration.emotionId === selection.emotionId) &&
    renderNumericLines(mod.lines, selection.values).ok &&
    removed?.ok &&
    removable.some(
      (affix) =>
        (affix.affixId ?? affix.modId) ===
        (removed.value.affix.affixId ?? removed.value.affix.modId),
    )
  if (!entries.length || catalog.bases.find((base) => base.id === state.baseId)?.type !== 'Jewel')
    return null
  return (
    <details
      data-craft-tool="emotion"
      className="essence-catalog essence-craft"
      open={configuration ? true : undefined}
    >
      <summary ref={entryRef}>液态情感制作</summary>
      <p>
        游戏随机移除一组词缀，加入材料对应的工艺属性。这里选择一种可能结果进行演练；已有工艺最多一组。双侧材料的结果选择仅用于演练。
      </p>
      {state.pendingDesecration ? (
        <p>
          {state.pendingDesecration.options
            ? '已固定揭示候选，请先完成揭示；固定候选后的再加工尚待核实。'
            : '当前可演练移除明文词缀、保留未揭示占位的结果。占位被移除的分支尚待核实，此处未列出全部随机结果。'}
        </p>
      ) : null}
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
            (entry) =>
              (!configuration || entry.emotion.id === configuration.emotionId) &&
              matchesLiquidEmotion(entry, query, local, translateLine),
          )
          .map(({ emotion, options, reason }) => (
            <article key={emotion.id}>
              <h4>{local(emotion.name)}</h4>
              {options.map(({ mod: outcome }) => (
                <p key={outcome.id}>
                  {options.length > 1
                    ? `${outcome.kind === 'prefix' ? '前缀' : '后缀'}工艺：`
                    : '保证工艺属性：'}
                  {outcome.lines.map((line) => translateLine?.(line) ?? line).join('；')}
                </p>
              ))}
              {options.some((option) => option.prepared.ok) ? (
                <button
                  type="button"
                  aria-label={`选择液态情感 ${local(emotion.name)}`}
                  disabled={disabled}
                  onClick={() => {
                    const ranges = inspectNumericLines(
                      options.length === 1 ? (options[0]?.mod.lines ?? []) : [],
                    )
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
              ) : (
                <p>
                  {reason ??
                    options
                      .map((option) => (option.prepared.ok ? '' : option.prepared.error))
                      .filter(Boolean)[0]}
                </p>
              )}
            </article>
          ))}
      </section>
      {selection ? (
        <fieldset disabled={disabled}>
          <legend>{selected ? local(selected.emotion.name) : '液态情感结果'}</legend>
          {selected && selected.options.length > 1 ? (
            <label>
              选择要演练的工艺结果
              <select
                aria-label="液态情感保证结果"
                value={selection.resultKind ?? ''}
                onChange={(event) => {
                  const option = selected.options.find(
                    (entry) => entry.resultKind === event.target.value,
                  )
                  const ranges = inspectNumericLines(option?.mod.lines ?? [])
                  if (ranges.ok)
                    setSelection({
                      kind: 'liquid-emotion',
                      emotionId: selection.emotionId,
                      ...(option?.resultKind ? { resultKind: option.resultKind } : {}),
                      removeModId: '',
                      values: ranges.value.map((range) => range.min),
                    })
                }}
              >
                <option value="">选择一种可能结果</option>
                {selected.options.map((option) => (
                  <option
                    key={option.mod.id}
                    value={option.resultKind}
                    disabled={!option.prepared.ok}
                  >
                    {option.mod.kind === 'prefix' ? '前缀' : '后缀'}工艺 ·{' '}
                    {option.mod.lines.map((line) => translateLine?.(line) ?? line).join('；')}
                    {option.prepared.ok ? '' : `（${option.prepared.error}）`}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {prepared && !prepared.ok ? <p role="status">{prepared.error}</p> : null}
          {mod ? (
            <>
              {targetsFor(mod.id).length ? (
                <p>保证属性对应目标：{targetsFor(mod.id).join('、')}</p>
              ) : null}
              {atRisk.length ? <p>可能移除已有目标：{atRisk.join('、')}</p> : null}
              <label>
                指定移除整组
                <select
                  aria-label="液态情感移除结果"
                  value={selection.removeAffixId ?? selection.removeModId}
                  onChange={(event) => {
                    const affix = removable.find(
                      (entry) => (entry.affixId ?? entry.modId) === event.target.value,
                    )
                    const { removeAffixId: _, ...rest } = selection
                    setSelection({
                      ...rest,
                      removeModId: affix?.modId ?? '',
                      ...(affix?.affixId === undefined ? {} : { removeAffixId: affix.affixId }),
                    })
                  }}
                >
                  <option value="">选择要演练的移除结果</option>
                  {removable.map((affix) => (
                    <option key={affix.affixId ?? affix.modId} value={affix.affixId ?? affix.modId}>
                      {affix.modId} ·{' '}
                      {affix.lines.map((line) => translateLine?.(line) ?? line).join('；')}
                    </option>
                  ))}
                </select>
              </label>
              {removedTargets.length ? (
                <p>本次将移除已有目标：{removedTargets.join('、')}</p>
              ) : null}
              <NumericControls
                label="液态情感保证属性"
                patterns={mod.lines}
                values={selection.values}
                onChange={(values) => setSelection({ ...selection, values })}
                {...(translateLine ? { translateLine } : {})}
              />
              {goal ? (
                <p>{meetsBounds ? '演练数值满足该目标区间。' : '演练数值尚未满足该目标区间。'}</p>
              ) : null}
              <button type="button" disabled={!valid} onClick={() => onPreview(selection)}>
                预览液态情感结果
              </button>
            </>
          ) : null}
        </fieldset>
      ) : null}
    </details>
  )
}
