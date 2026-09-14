import {
  applyCraftStep,
  type CatalogCorruption,
  type CraftCatalog,
  type CraftState,
  corruptionCandidates,
  corruptionEntries,
  inspectNumericLines,
  renderNumericLines,
  type VaalCraftOperation,
} from '@poe2-tools/item-core'
import { useEffect, useMemo, useRef, useState } from 'react'
import { NumericControls } from './NumericControls'
import { VaalRerollChoice } from './VaalRerollChoice'

interface Props {
  catalog: CraftCatalog
  state: CraftState
  draft: VaalCraftOperation | null
  busy: boolean
  canApply: boolean
  onPreview: (step: VaalCraftOperation | null) => void
  onApply: () => void
  translateLine?: (line: string) => string | null
}

function EnchantChoice({
  mod,
  disabled,
  onPreview,
  translateLine,
}: {
  mod: CatalogCorruption
  disabled: boolean
  onPreview: Props['onPreview']
  translateLine: Props['translateLine']
}) {
  const [values, setValues] = useState(() => {
    const ranges = inspectNumericLines(mod.lines)
    return ranges.ok ? ranges.value.map((range) => range.min) : []
  })
  const result = renderNumericLines(mod.lines, values)
  return (
    <fieldset disabled={disabled}>
      <legend>指定腐化强化的基础数值</legend>
      <NumericControls
        label="腐化强化"
        patterns={mod.lines}
        values={values}
        onChange={setValues}
        {...(translateLine ? { translateLine } : {})}
      />
      <button
        type="button"
        disabled={!result.ok}
        onClick={() => onPreview({ kind: 'vaal', outcome: 'enchant', modId: mod.id, values })}
      >
        预演腐化：新增强化属性
      </button>
    </fieldset>
  )
}

export function CorruptionPanel({
  catalog,
  state,
  draft,
  busy,
  canApply,
  onPreview,
  onApply,
  translateLine,
}: Props) {
  const preview = useRef<HTMLElement>(null)
  const corruptedHeading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (state.twiceCorrupted) corruptedHeading.current?.focus()
  }, [state.twiceCorrupted])

  const [selectedId, setSelectedId] = useState('')
  const candidates = useMemo(() => corruptionCandidates(catalog, state), [catalog, state])
  const selected = candidates.find((mod) => mod.id === selectedId)
  useEffect(() => {
    if (draft) preview.current?.focus()
  }, [draft])
  if (catalog.bases.find((base) => base.id === state.baseId)?.type === 'Jewel') return null
  if (state.corrupted)
    return (
      <section className="craft-sockets" aria-label="腐化状态">
        <h3 ref={corruptedHeading} tabIndex={-1}>
          {state.twiceCorrupted ? '已二重腐化' : '已腐化'}
        </h3>
        {corruptionEntries(state).map((entry, index) => (
          <article key={entry.modId} aria-label={index === 0 ? '当前腐化强化' : '第二组腐化强化'}>
            <h4>腐化强化 · 独立属性</h4>
            {entry.lines.map((line) => (
              <p key={line}>
                {translateLine?.(line) ? <span>{translateLine(line)}</span> : null}
                <code>{line}</code>
              </p>
            ))}
            {state.catalyst ? (
              <p>这里保留高级基础值；命中催化标签的实际贡献已计入支持的估算面板。</p>
            ) : null}
          </article>
        ))}
        {state.twiceCorrupted ? (
          <p>已完成二重腐化，不能再次使用建筑师宝珠；两组强化分别计入已支持的面板。</p>
        ) : null}
        <p>普通通货、精华、骨骼、破裂和巧匠石已停用。已有孔仍可镶嵌或覆盖已支持的符文与魂核。</p>
        <p>演练中可撤销以比较路线；游戏中的腐化不能撤销。</p>
      </section>
    )
  const unchanged = applyCraftStep(catalog, state, { kind: 'vaal', outcome: 'unchanged' })
  const socket = applyCraftStep(catalog, state, { kind: 'vaal', outcome: 'socket' })
  return (
    <section className="craft-sockets" aria-label="瓦尔结果预演">
      <h3>瓦尔石：指定结果预演</h3>
      <p>
        手选“属性不变”“增加一孔”“新增强化属性”或“重选词缀”查看后续路线，每次记录一颗瓦尔石。这不是随机抽取，也不代表成功率。
      </p>
      <p>预兆、特殊魂核和腐化珠宝尚未接入。腐化强化独立于固有属性及前后缀，不占显式词缀名额。</p>
      <div className="socket-actions">
        <button
          type="button"
          disabled={busy || draft !== null || !unchanged.ok}
          onClick={() => onPreview({ kind: 'vaal', outcome: 'unchanged' })}
        >
          预演腐化：属性不变
        </button>
        <button
          type="button"
          disabled={busy || draft !== null || !socket.ok}
          onClick={() => onPreview({ kind: 'vaal', outcome: 'socket' })}
        >
          预演腐化：增加一孔
        </button>
      </div>
      {!unchanged.ok ? <p>{unchanged.error}</p> : !socket.ok ? <p>{socket.error}</p> : null}
      <label>
        新增腐化强化
        <select
          aria-label="选择腐化强化"
          disabled={busy || draft !== null || !unchanged.ok}
          value={selected?.id ?? ''}
          onChange={(event) => setSelectedId(event.target.value)}
        >
          <option value="">选择强化属性（{candidates.length} 组可用）</option>
          {candidates.map((mod) => (
            <option key={mod.id} value={mod.id}>
              {mod.lines.map((line) => translateLine?.(line) ?? line).join('；')}
            </option>
          ))}
        </select>
      </label>
      {selected ? (
        <EnchantChoice
          key={selected.id}
          mod={selected}
          disabled={busy || draft !== null}
          onPreview={onPreview}
          translateLine={translateLine}
        />
      ) : null}
      <VaalRerollChoice
        catalog={catalog}
        state={state}
        disabled={busy || draft !== null || !unchanged.ok}
        onPreview={onPreview}
        translateLine={translateLine}
      />
      {draft ? (
        <section ref={preview} tabIndex={-1} className="socket-preview" aria-label="腐化结果草稿">
          <h4>
            {draft.outcome === 'socket'
              ? '腐化增加一孔'
              : draft.outcome === 'enchant'
                ? '新增腐化强化'
                : draft.outcome === 'reroll'
                  ? `重选词缀（${draft.replacements.length} 次替换）`
                  : '腐化但属性不变'}
          </h4>
          {draft.outcome === 'enchant' ? (
            <p>强化属性及面板变化见上方预览，应用后保留全部显式词缀与固有属性。</p>
          ) : null}
          {draft.outcome === 'socket' ? (
            <p>
              孔数 {state.sockets?.length ?? 0} → {(state.sockets?.length ?? 0) + 1}
              ，保留已有镶嵌物。
            </p>
          ) : null}
          {draft.outcome === 'reroll' ? (
            <p>按已指定顺序完成替换，整次只计一颗瓦尔石；保留稀有度、固有属性、品质与镶嵌物。</p>
          ) : null}
          <p>应用后标记腐化，停止普通制作。建议先完成品质、词缀和普通打孔。</p>
          <div className="socket-actions">
            <button type="button" onClick={() => onPreview(null)}>
              取消腐化结果
            </button>
            <button
              type="button"
              className="primary"
              disabled={busy || !canApply}
              onClick={onApply}
            >
              应用腐化结果
            </button>
          </div>
        </section>
      ) : null}
    </section>
  )
}
