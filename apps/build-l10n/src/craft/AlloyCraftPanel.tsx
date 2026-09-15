import {
  type AlloyCraftOperation,
  applyCraftStep,
  type CraftCatalog,
  type CraftState,
  type CraftTargetDefinitions,
  definitionTargetIdsForMods,
  evaluateTargetDefinitions,
  inspectCraftAlloys,
  inspectNumericLines,
  prepareAlloyCraft,
  targetDefinitionChanges,
} from '@poe2-tools/item-core'
import { type Ref, useMemo, useState } from 'react'
import { NumericControls } from './NumericControls'
import './essence-catalog.css'

interface Props {
  entryRef?: Ref<HTMLElement>
  configuration?: { alloyId: string }
  catalog: CraftCatalog
  definitions: CraftTargetDefinitions
  state: CraftState
  translations: Record<string, string>
  translateLine?: (line: string) => string | null
  disabled: boolean
  onPreview: (step: AlloyCraftOperation) => void
}

export function AlloyCraftPanel({
  entryRef,
  configuration,
  catalog,
  definitions,
  state,
  translations,
  translateLine,
  disabled,
  onPreview,
}: Props) {
  const [query, setQuery] = useState('')
  const context = useMemo(
    () => ({ catalog, state, configuration, definitions }),
    [catalog, state, configuration, definitions],
  )
  const [draft, setDraft] = useState<{
    context: typeof context
    selection: AlloyCraftOperation
  } | null>(null)
  const selection = draft?.context === context ? draft.selection : null
  const setSelection = (selection: AlloyCraftOperation | null) =>
    setDraft(selection ? { context, selection } : null)
  const entries = useMemo(() => {
    const base = catalog.bases.find((entry) => entry.id === state.baseId)
    return base
      ? inspectCraftAlloys(catalog, base).map((entry) => ({
          ...entry,
          prepared: prepareAlloyCraft(catalog, state, entry.alloy.id),
        }))
      : []
  }, [catalog, state])
  const local = (name: string) =>
    translations[name] ?? catalog.localizedNames?.['zh-CN']?.[name] ?? name
  const text = (line: string) => translateLine?.(line) ?? line
  const selected = entries.find((entry) => entry.alloy.id === selection?.alloyId)
  const prepared = selected?.prepared
  const mod = prepared?.ok ? prepared.value.mod : undefined
  const removable = prepared?.ok ? prepared.value.removableAffixes : []
  const targetLabels = (ids: string[]) =>
    definitions.targets
      .filter((target) => ids.includes(target.targetId))
      .map((target) => target.modId)
  const targetsFor = (id: string) => targetLabels(definitionTargetIdsForMods(definitions, [id]))
  const atRisk = [...new Set(removable.flatMap((entry) => targetsFor(entry.modId)))]
  const result = useMemo(
    () =>
      selection && (!configuration || configuration.alloyId === selection.alloyId)
        ? applyCraftStep(catalog, state, selection)
        : null,
    [catalog, state, selection, configuration],
  )
  const progress = useMemo(
    () =>
      result?.ok && definitions.targets.length
        ? evaluateTargetDefinitions(catalog, result.value, definitions)
        : null,
    [catalog, result, definitions],
  )
  const lostTargets = result?.ok
    ? targetLabels(targetDefinitionChanges(catalog, state, result.value, definitions).lostTargetIds)
    : []
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const visible = entries.filter(
    (entry) =>
      (!configuration || configuration.alloyId === entry.alloy.id) &&
      words.every((word) =>
        [
          entry.alloy.id,
          entry.alloy.name,
          local(entry.alloy.name),
          entry.mod?.id,
          entry.mod?.group,
          ...(entry.mod?.tags ?? []),
          ...(entry.mod?.lines.flatMap((line) => [line, text(line)]) ?? []),
        ]
          .join(' ')
          .toLowerCase()
          .includes(word),
      ),
  )
  if (!entries.length) return null
  return (
    <details className="essence-catalog essence-craft" open={configuration ? true : undefined}>
      <summary ref={entryRef}>合金制作</summary>
      <p>
        用于稀有装备：游戏随机移除一整组词缀，加入合金保证的工艺属性。这里选择一种可能结果进行演练；最多保留一组工艺。数值与移除对象仍随机。
      </p>
      <label>
        搜索合金材料
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="材料、属性、标签或 modId"
        />
      </label>
      {/* biome-ignore lint/a11y/noNoninteractiveTabindex: 可滚动材料列表允许键盘阅读不可用原因。 */}
      <section className="essence-catalog-list" tabIndex={0} aria-label="合金制作材料列表">
        {!visible.length ? <p>没有匹配的合金材料。</p> : null}
        {visible.map((entry) => (
          <article key={entry.alloy.id}>
            <h4>{local(entry.alloy.name)}</h4>
            {entry.mod ? <p>保证工艺属性：{entry.mod.lines.map(text).join('；')}</p> : null}
            {entry.prepared.ok ? (
              <button
                type="button"
                disabled={disabled}
                aria-label={`选择合金 ${local(entry.alloy.name)}`}
                onClick={() => {
                  const ranges = inspectNumericLines(entry.mod?.lines ?? [])
                  if (ranges.ok)
                    setSelection({
                      kind: 'alloy',
                      alloyId: entry.alloy.id,
                      removeModId: '',
                      values: ranges.value.map((range) => range.min),
                    })
                }}
              >
                选择材料
              </button>
            ) : (
              <p>{entry.prepared.error}</p>
            )}
          </article>
        ))}
      </section>
      {selection ? (
        <fieldset disabled={disabled}>
          <legend>{selected ? local(selected.alloy.name) : '合金结果'}</legend>
          {prepared && !prepared.ok ? <p role="status">{prepared.error}</p> : null}
          {mod ? (
            <>
              {atRisk.length ? <p>可能移除已有目标：{atRisk.join('、')}</p> : null}
              <label>
                指定移除整组
                <select
                  aria-label="合金移除结果"
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
                      {affix.modId} · {affix.lines.map(text).join('；')}
                    </option>
                  ))}
                </select>
              </label>
              {lostTargets.length ? <p>本次将移除已有目标：{lostTargets.join('、')}</p> : null}
              <NumericControls
                label="合金保证属性"
                patterns={mod.lines}
                values={selection.values}
                onChange={(values) => setSelection({ ...selection, values })}
                {...(translateLine ? { translateLine } : {})}
              />
              {progress ? (
                <p>
                  此完整结果满足 {progress.matches.length} / {definitions.targets.length}{' '}
                  组显式目标，已按目标的基础值或有效值口径核对。
                </p>
              ) : null}
              {selection.removeModId && result && !result.ok ? (
                <p role="status">{result.error}</p>
              ) : null}
              <button type="button" disabled={!result?.ok} onClick={() => onPreview(selection)}>
                预览合金结果
              </button>
            </>
          ) : null}
        </fieldset>
      ) : null}
    </details>
  )
}
