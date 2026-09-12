import {
  type CraftCatalog,
  type CraftState,
  type CraftTargetAlternative,
  type CraftTargetValues,
  ESSENCE_OMEN_RULES,
  type EssenceCraftOperation,
  type EssenceOmen,
  inspectEssences,
  inspectNumericLines,
  prepareEssenceCraft,
  renderNumericLines,
} from '@poe2-tools/item-core'
import { useMemo, useState } from 'react'
import { NumericControls } from './NumericControls'
import './essence-catalog.css'

interface EssenceCraftPanelProps {
  catalog: CraftCatalog
  state: CraftState
  translations: Record<string, string>
  translateLine?: (line: string) => string | null
  disabled: boolean
  onPreview: (step: EssenceCraftOperation) => void
  targetModIds?: string[]
  targetAlternatives?: CraftTargetAlternative[]
  targetValues?: CraftTargetValues[]
}

export function EssenceCraftPanel({
  catalog,
  state,
  translations,
  translateLine,
  disabled,
  onPreview,
  targetModIds = [],
  targetAlternatives = [],
  targetValues = [],
}: EssenceCraftPanelProps) {
  const [query, setQuery] = useState('')
  const [omen, setOmen] = useState<EssenceOmen | undefined>()
  const [selection, setSelection] = useState<EssenceCraftOperation | null>(null)
  const entries = useMemo(() => {
    const base = catalog.bases.find((entry) => entry.id === state.baseId)
    return base
      ? inspectEssences(catalog, base).map((inspection) => ({
          ...inspection,
          prepared: prepareEssenceCraft(catalog, state, inspection.essence.id, omen),
        }))
      : []
  }, [catalog, state, omen])
  const needle = query.trim().toLowerCase()
  const matches = entries.filter(({ essence, mod, modId }) =>
    [
      essence.id,
      essence.name,
      translations[essence.name],
      modId,
      ...(mod?.lines.flatMap((line) => [line, translateLine?.(line)]) ?? []),
    ].some((text) => text?.toLowerCase().includes(needle)),
  )
  const selected = selection
    ? entries.find(({ essence }) => essence.id === selection.essenceId)
    : undefined
  const prepared = selected?.prepared
  const mod = prepared?.ok ? prepared.value.mod : undefined
  const targeted =
    mod &&
    (targetModIds.includes(mod.id) ||
      targetAlternatives.some(
        (entry) => targetModIds.includes(entry.targetModId) && entry.modIds.includes(mod.id),
      ))
  const bounds = targetValues.find((entry) => entry.modId === mod?.id)?.bounds
  const meetsBounds =
    selection &&
    bounds?.every((bound) => {
      const value = selection.values[bound.index]
      return (
        value !== undefined &&
        Number.isFinite(value) &&
        (bound.min === undefined || value >= bound.min) &&
        (bound.max === undefined || value <= bound.max)
      )
    })
  const validValues = mod && selection ? renderNumericLines(mod.lines, selection.values).ok : false
  const replacement = prepared?.ok && prepared.value.mode === 'replace'
  const removableAffixes = prepared?.ok ? prepared.value.removableAffixes : []
  const affectedTargets = (modId: string) =>
    targetModIds.filter(
      (targetId) =>
        targetId === modId ||
        targetAlternatives.some(
          (entry) => entry.targetModId === targetId && entry.modIds.includes(modId),
        ),
    )
  const riskTargets = [
    ...new Set(removableAffixes.flatMap((affix) => affectedTargets(affix.modId))),
  ]
  const lostTargets = selection?.removeModId ? affectedTargets(selection.removeModId) : []
  const validRemoval =
    !replacement || removableAffixes.some((affix) => affix.modId === selection?.removeModId)

  return (
    <section className="essence-catalog essence-craft" aria-label="精华制作">
      <h3>精华制作</h3>
      <p>工艺词缀 {state.affixes.filter((affix) => affix.crafted).length}/1</p>
      <p>
        前三档精华将魔法装备升级为稀有；完美与腐化精华在稀有装备上移除一组，再加入保证工艺词缀。每次应用消耗一份精华，启用预兆时另消耗一份预兆。
      </p>
      <label>
        精华预兆
        <select
          aria-label="精华预兆"
          value={omen ?? ''}
          disabled={disabled}
          onChange={(event) => {
            setOmen((event.target.value || undefined) as EssenceOmen | undefined)
            setSelection(null)
          }}
        >
          <option value="">不使用精华预兆</option>
          {Object.entries(ESSENCE_OMEN_RULES).map(([id, rule]) => (
            <option key={id} value={id}>
              {translations[rule.name] ?? rule.name}
            </option>
          ))}
        </select>
      </label>
      {omen ? (
        <p>
          仅适用于完美或腐化精华，只移除
          {ESSENCE_OMEN_RULES[omen].kind === 'prefix' ? '前缀' : '后缀'}
          ；同侧具体词缀组仍随机，保证词缀不变。合法池交集按工具规则推导，真机待验收。
        </p>
      ) : null}
      <label>
        搜索可演练精华
        <input
          type="search"
          aria-label="搜索可演练精华"
          placeholder="中文、英文或保证属性"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      {disabled ? <p>请先应用或取消当前草稿。</p> : null}
      {!catalog.essences?.length ? <p>当前目录暂无精华数据。</p> : null}
      {catalog.essences?.length && matches.length === 0 ? <p>没有匹配的精华或保证属性。</p> : null}
      {/* biome-ignore lint/a11y/noNoninteractiveTabindex: 滚动区需要键盘焦点，确保内部操作全部禁用时仍能使用方向键滚动。 */}
      <section className="essence-catalog-list" aria-label="当前基底精华列表" tabIndex={0}>
        {matches.map(({ essence, prepared, mod, modId }) => {
          const label = translations[essence.name] ?? essence.name
          return (
            <article key={essence.id}>
              <header>
                <strong>{label}</strong>
                {label !== essence.name ? <span lang="en">{essence.name}</span> : null}
              </header>
              {mod ? (
                <>
                  <p>
                    {mod.kind === 'prefix' ? '前缀' : '后缀'} · {mod.id}
                  </p>
                  {mod.lines.map((line) => (
                    <div className="essence-catalog-line" key={line}>
                      {translateLine?.(line) ? <span>{translateLine(line)}</span> : null}
                      <code>{line}</code>
                    </div>
                  ))}
                </>
              ) : (
                <p>此效果尚未解析：{modId}</p>
              )}
              {!prepared.ok ? <p>{prepared.error}</p> : null}
              <button
                type="button"
                aria-label={`选择精华 ${label}`}
                disabled={disabled || !prepared.ok}
                onClick={() => {
                  if (!prepared.ok) return
                  const ranges = inspectNumericLines(prepared.value.mod.lines)
                  if (ranges.ok)
                    setSelection({
                      kind: 'essence',
                      essenceId: essence.id,
                      ...(omen === undefined ? {} : { omen }),
                      values: ranges.value.map((range) => range.min),
                    })
                }}
              >
                选择精华
              </button>
            </article>
          )
        })}
      </section>
      {selection && mod && selected ? (
        <section aria-label="精华保证结果">
          <h4>保证结果 · {translations[selected.essence.name] ?? selected.essence.name}</h4>
          {replacement ? (
            <>
              <p>游戏会随机移除一组词缀；以下指定结果仅用于演练，不代表可控制游戏结果。</p>
              {riskTargets.length ? (
                <p>移除池中的目标风险：{riskTargets.join('、')}。包含已接受的替代档位。</p>
              ) : null}
              <fieldset disabled={disabled}>
                <legend>选择本次演练移除的整组词缀</legend>
                {removableAffixes.map((affix) => {
                  const existing = catalog.modifiers.find((entry) => entry.id === affix.modId)
                  return (
                    <label className="essence-removal-option" key={affix.modId}>
                      <input
                        type="radio"
                        name="essence-removal"
                        checked={selection.removeModId === affix.modId}
                        onChange={() => setSelection({ ...selection, removeModId: affix.modId })}
                      />
                      <span>
                        {existing?.kind === 'prefix' ? '前缀' : '后缀'} · {affix.modId} ·{' '}
                        {existing?.name}
                      </span>
                      {existing && translations[existing.name] ? (
                        <span>{translations[existing.name]}</span>
                      ) : null}
                      {affix.lines.map((line, index) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: 原文允许重复行；静态文本不含局部状态。
                        <span className="essence-catalog-line" key={`${index}:${line}`}>
                          {translateLine?.(line) ? <span>{translateLine(line)}</span> : null}
                          <code>{line}</code>
                        </span>
                      ))}
                    </label>
                  )
                })}
              </fieldset>
              {lostTargets.length ? (
                <p>本次指定移除将失去目标：{lostTargets.join('、')}；将移除所选组的全部属性。</p>
              ) : null}
            </>
          ) : null}
          {targeted ? <p>保证目标词缀；数值仍需核对</p> : null}
          {targeted && bounds?.length ? (
            <p>
              {meetsBounds ? '当前数值满足此词缀的目标条件。' : '当前数值不满足此词缀的目标条件。'}
            </p>
          ) : null}
          <fieldset disabled={disabled}>
            <NumericControls
              label={translations[selected.essence.name] ?? selected.essence.name}
              patterns={mod.lines}
              values={selection.values}
              onChange={(values) => setSelection({ ...selection, values })}
              {...(translateLine ? { translateLine } : {})}
            />
          </fieldset>
          <button
            type="button"
            disabled={disabled || !validValues || !validRemoval}
            onClick={() => onPreview(selection)}
          >
            预览精华结果
          </button>
        </section>
      ) : null}
    </section>
  )
}
