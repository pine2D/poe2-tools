import {
  applyFluxCraft,
  type CraftCatalog,
  type CraftState,
  FLUXES,
  type FluxCraftOperation,
  inspectNumericLines,
  prepareFluxCraft,
} from '@poe2-tools/item-core'
import { type Ref, useMemo, useState } from 'react'
import { NumericControls } from './NumericControls'
import './essence-catalog.css'

interface Props {
  entryRef?: Ref<HTMLElement>
  configuration?: { fluxId: string }
  catalog: CraftCatalog
  state: CraftState
  translations: Record<string, string>
  translateLine?: (line: string) => string | null
  disabled: boolean
  onPreview: (operation: FluxCraftOperation) => void
}

/** 材料作用于全部适用实例；每条数值草稿绑定完整前态，不以词缀类型合并。 */
export function FluxCraftPanel({
  entryRef,
  configuration,
  catalog,
  state,
  translations,
  translateLine,
  disabled,
  onPreview,
}: Props) {
  const fluxId = configuration?.fluxId
  const context = useMemo(
    () => ({ catalog, state, fluxId, disabled }),
    [catalog, state, fluxId, disabled],
  )
  const [draft, setDraft] = useState<{
    context: typeof context
    operation: FluxCraftOperation
  } | null>(null)
  const selected = draft?.context === context && !disabled ? draft.operation : null
  const entries = useMemo(
    () => FLUXES.map((flux) => ({ flux, prepared: prepareFluxCraft(catalog, state, flux.id) })),
    [catalog, state],
  )
  const selectedEntry = entries.find((entry) => entry.flux.id === selected?.fluxId)
  const changes = selectedEntry?.prepared.ok ? selectedEntry.prepared.value.changes : []
  const preview = useMemo(
    () => (selected ? applyFluxCraft(catalog, state, selected) : null),
    [catalog, state, selected],
  )
  const local = (name: string) =>
    translations[name] ?? catalog.localizedNames?.['zh-CN']?.[name] ?? name
  const text = (line: string) => translateLine?.(line) ?? line
  return (
    <details className="essence-catalog essence-craft" open={configuration ? true : undefined}>
      <summary ref={entryRef}>溶剂制作</summary>
      <p>
        一次转换全部适用抗性，每条分别选择基础数值。混沌抗性不能反向转换；这里只指定结果，不计算游戏概率。
      </p>
      <section className="essence-catalog-list" aria-label="溶剂制作材料列表">
        {entries
          .filter((entry) => !configuration || entry.flux.id === fluxId)
          .map(({ flux, prepared }) => (
            <article key={flux.id}>
              <h4>{local(flux.name)}</h4>
              <p lang="en">{flux.name}</p>
              {prepared.ok ? (
                <p>本次转换 {prepared.value.changes.length} 条抗性，应用后消耗 1 份。</p>
              ) : (
                <p>{prepared.error}</p>
              )}
              <button
                type="button"
                aria-label={`选择溶剂 ${local(flux.name)}`}
                disabled={disabled || !prepared.ok}
                onClick={() => {
                  if (!prepared.ok) return
                  const rolls: FluxCraftOperation['rolls'] = []
                  for (const { affix, toMod } of prepared.value.changes) {
                    const ranges = inspectNumericLines(toMod.lines)
                    if (!ranges.ok) return
                    rolls.push({
                      affixId: affix.affixId,
                      modId: toMod.id,
                      values: ranges.value.map((range) => range.min),
                    })
                  }
                  setDraft({ context, operation: { kind: 'flux', fluxId: flux.id, rolls } })
                }}
              >
                选择溶剂
              </button>
            </article>
          ))}
      </section>
      {selected ? (
        <section aria-label="溶剂转换结果选择">
          <h4>{local(selectedEntry?.flux.name ?? selected.fluxId)} · 全部转换结果</h4>
          {changes.map(({ affix, fromMod, toMod }, index) => {
            const roll = selected.rolls[index]
            if (!roll) return null
            return (
              <article key={affix.affixId}>
                <p>
                  第 {index + 1} 条 · {fromMod.name || fromMod.id} → {toMod.name || toMod.id}
                </p>
                {affix.lines.map((line) => (
                  <p key={line}>{text(line)}</p>
                ))}
                <NumericControls
                  label={`溶剂结果 ${affix.affixId}`}
                  patterns={toMod.lines}
                  values={roll.values}
                  {...(translateLine ? { translateLine } : {})}
                  onChange={(values) =>
                    setDraft({
                      context,
                      operation: {
                        ...selected,
                        rolls: selected.rolls.map((entry) =>
                          entry.affixId === affix.affixId ? { ...entry, values } : entry,
                        ),
                      },
                    })
                  }
                />
              </article>
            )
          })}
          {preview && !preview.ok ? <p role="alert">{preview.error}</p> : null}
          <button type="button" onClick={() => setDraft(null)}>
            取消转换选择
          </button>
          <button
            type="button"
            disabled={!preview?.ok}
            onClick={() => {
              if (preview?.ok) onPreview(selected)
            }}
          >
            预览溶剂结果
          </button>
        </section>
      ) : null}
    </details>
  )
}
