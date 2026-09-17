import {
  type ArchitectCraftOperation,
  applyCraftStep,
  architectCandidates,
  type CatalogCorruption,
  type CraftCatalog,
  type CraftState,
  inspectNumericLines,
  renderNumericLines,
} from '@poe2-tools/item-core'
import { useEffect, useMemo, useRef, useState } from 'react'
import { NumericControls } from './NumericControls'

function EnchantChoice({
  mod,
  disabled,
  onPreview,
  translateLine,
}: {
  mod: CatalogCorruption
  disabled: boolean
  onPreview: (step: ArchitectCraftOperation) => void
  translateLine?: (line: string) => string | null
}) {
  const [values, setValues] = useState(() => {
    const result = inspectNumericLines(mod.lines)
    return result.ok ? result.value.map((range) => range.min) : []
  })
  const result = renderNumericLines(mod.lines, values)
  return (
    <fieldset disabled={disabled}>
      <legend>指定追加强化的基础数值</legend>
      <NumericControls
        label="建筑师强化"
        patterns={mod.lines}
        values={values}
        onChange={setValues}
        {...(translateLine ? { translateLine } : {})}
      />
      <button
        type="button"
        disabled={!result.ok}
        onClick={() => onPreview({ kind: 'architect', outcome: 'enchant', modId: mod.id, values })}
      >
        预演建筑师：新增强化
      </button>
    </fieldset>
  )
}

export function ArchitectPanel({
  catalog,
  state,
  draft,
  busy,
  canApply,
  onPreview,
  onApply,
  translateLine,
}: {
  catalog: CraftCatalog
  state: CraftState
  draft: ArchitectCraftOperation | null
  busy: boolean
  canApply: boolean
  onPreview: (step: ArchitectCraftOperation | null) => void
  onApply: () => void
  translateLine?: (line: string) => string | null
}) {
  const preview = useRef<HTMLElement>(null)
  const [selectedId, setSelectedId] = useState('')
  const candidates = useMemo(() => architectCandidates(catalog, state), [catalog, state])
  const selected = candidates.find((mod) => mod.id === selectedId)
  useEffect(() => {
    if (draft) preview.current?.focus()
  }, [draft])
  if (!state.corrupted || state.destroyed || state.twiceCorrupted) return null
  const result = applyCraftStep(catalog, state, { kind: 'architect', outcome: 'destroy' })
  return (
    <section className="craft-sockets" aria-label="建筑师结果预演" data-craft-tool="architect">
      <h3>建筑师宝珠：指定结果预演</h3>
      <p>
        指定“追加强化”或“摧毁”比较路线，每次计一颗建筑师宝珠。成功后标记二重腐化，保留原属性、品质与孔内物。
      </p>
      <p>
        组合按目录的基底资格、词缀组和附加标签建模，交互规则待真机核对；手选结果不表示真实成功率。特殊腐化仍未开放。
      </p>
      <label>
        追加腐化强化
        <select
          aria-label="选择建筑师强化"
          value={selected?.id ?? ''}
          disabled={busy || draft !== null || !result.ok}
          onChange={(event) => setSelectedId(event.target.value)}
        >
          <option value="">选择强化属性（{candidates.length} 组候选）</option>
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
          {...(translateLine ? { translateLine } : {})}
        />
      ) : null}
      <button
        type="button"
        disabled={busy || draft !== null || !result.ok}
        onClick={() => onPreview({ kind: 'architect', outcome: 'destroy' })}
      >
        预演建筑师：摧毁物品
      </button>
      {!result.ok ? <p>{result.error}</p> : null}
      {draft ? (
        <section
          ref={preview}
          tabIndex={-1}
          className="socket-preview"
          aria-label="建筑师结果草稿"
          data-craft-pending
        >
          <h4>{draft.outcome === 'destroy' ? '摧毁当前装备' : '追加腐化强化'}</h4>
          <p>尚未消耗材料。应用后记录一颗建筑师宝珠。</p>
          {draft.outcome === 'destroy' ? (
            <>
              <p>装备及其镶嵌物消失，停止制作、面板估算与装备文本导出。</p>
              <p>已消耗的材料和起点成本仍保留。演练中可撤销；游戏中被摧毁的装备无法恢复。</p>
            </>
          ) : (
            <p>
              追加一组普通腐化强化，标记二重腐化。已有孔仍可镶嵌，不能再次使用建筑师宝珠；结果及数值变化见上方比较。
            </p>
          )}
          <div className="socket-actions">
            <button type="button" onClick={() => onPreview(null)}>
              取消建筑师结果
            </button>
            <button
              type="button"
              className="primary"
              disabled={busy || !canApply}
              onClick={onApply}
            >
              {draft.outcome === 'destroy' ? '应用建筑师摧毁结果' : '应用建筑师强化结果'}
            </button>
          </div>
        </section>
      ) : null}
    </section>
  )
}
