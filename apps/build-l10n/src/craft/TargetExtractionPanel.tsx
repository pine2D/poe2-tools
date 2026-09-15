import {
  type CraftCatalog,
  type CraftState,
  type ExtractedCraftTargets,
  extractCraftTargets,
} from '@poe2-tools/item-core'
import { useEffect, useMemo, useState } from 'react'

export function TargetExtractionPanel({
  context: targetContext,
  catalog,
  state,
  busy,
  onApply,
  translateLine,
}: {
  context?: unknown
  catalog: CraftCatalog
  state: CraftState
  busy: boolean
  onApply: (targets: ExtractedCraftTargets) => void
  translateLine?: (line: string) => string | null
}) {
  const context = useMemo(
    () => ({ catalog, state, busy, targetContext }),
    [catalog, state, busy, targetContext],
  )
  const [draft, setDraft] = useState<{
    context: typeof context
    ids: string[]
    values: boolean
    fracture: boolean
  } | null>(null)
  useEffect(() => {
    setDraft((value) => (value?.context === context ? value : null))
  }, [context])
  const active = !busy && draft?.context === context ? draft : null
  const result = useMemo(
    () =>
      active
        ? extractCraftTargets(
            catalog,
            state,
            active.ids.flatMap((id) =>
              state.affixes
                .filter((affix) => (affix.affixId ?? affix.modId) === id)
                .map((affix) => ({
                  modId: affix.modId,
                  ...(affix.affixId === undefined ? {} : { affixId: affix.affixId }),
                })),
            ),
            active.values,
            active.fracture,
          )
        : null,
    [catalog, state, active],
  )
  return (
    <div className="target-extraction">
      <button
        type="button"
        disabled={busy || state.affixes.length === 0}
        aria-expanded={active !== null}
        onClick={() =>
          setDraft(
            active
              ? null
              : {
                  context,
                  ids: state.affixes.map((a) => a.affixId ?? a.modId),
                  values: false,
                  fracture: false,
                },
          )
        }
      >
        从当前装备提取目标
      </button>
      {active ? (
        <fieldset aria-label="提取制作目标">
          <legend>选择要制作出的词缀</legend>
          <p>读取当前已应用装备。只提取显式词缀，固有属性、品质和孔位可在各自区域另设条件。</p>
          <div className="target-extraction-choices">
            {state.affixes.map((affix) => {
              const mod = catalog.modifiers.find((m) => m.id === affix.modId)
              const key = affix.affixId ?? affix.modId
              return (
                <label key={key}>
                  <input
                    type="checkbox"
                    aria-label={`提取词缀 ${affix.modId}${affix.affixId === undefined ? '' : ` · ${affix.affixId}`}`}
                    checked={active.ids.includes(key)}
                    onChange={(e) =>
                      setDraft({
                        ...active,
                        ids: e.target.checked
                          ? [...active.ids, key]
                          : active.ids.filter((id) => id !== key),
                      })
                    }
                  />
                  <span>
                    {mod?.kind === 'prefix' ? '前缀' : '后缀'} · {mod?.name ?? affix.modId}
                    {affix.lines.map((line) => (
                      <span className="target-meta" key={line}>
                        {translateLine?.(line) ?? line}
                      </span>
                    ))}
                  </span>
                </label>
              )
            })}
          </div>
          <label>
            <input
              type="checkbox"
              checked={active.values}
              onChange={(e) => setDraft({ ...active, values: e.target.checked })}
            />
            复制基础数值为精确条件
          </label>
          <p>
            开启后要求与当前基础值相等，不包含催化或其他增效；应用后可在目标中改为上下限。关闭时只要求所选档位。
          </p>
          {state.affixes.some((a) => a.fractured) ? (
            <label>
              <input
                type="checkbox"
                checked={active.fracture}
                onChange={(e) => setDraft({ ...active, fracture: e.target.checked })}
              />
              保留所选词缀的破裂要求
            </label>
          ) : null}
          <p>
            将替换显式目标，清除原有替代档位、数量和破裂要求，固有目标保留。引用被移除目标的指引需要重新选择。
          </p>
          {result?.ok ? (
            <p>
              已选 {result.value.targetModIds.length} 组，
              {result.value.targetValues.reduce((count, entry) => count + entry.bounds.length, 0)}{' '}
              项精确数值条件。
            </p>
          ) : result ? (
            <p role="alert">{result.error}</p>
          ) : null}
          <div className="socket-actions">
            <button type="button" onClick={() => setDraft(null)}>
              取消提取
            </button>
            <button
              type="button"
              disabled={!result?.ok}
              onClick={() => {
                if (result?.ok) {
                  onApply(result.value)
                  setDraft(null)
                }
              }}
            >
              用所选词缀替换显式目标
            </button>
          </div>
        </fieldset>
      ) : null}
    </div>
  )
}
