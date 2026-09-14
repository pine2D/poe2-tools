import {
  type ArchitectCraftOperation,
  applyCraftStep,
  type CraftCatalog,
  type CraftState,
} from '@poe2-tools/item-core'
import { useEffect, useRef } from 'react'

export function ArchitectPanel({
  catalog,
  state,
  draft,
  busy,
  canApply,
  onPreview,
  onApply,
}: {
  catalog: CraftCatalog
  state: CraftState
  draft: ArchitectCraftOperation | null
  busy: boolean
  canApply: boolean
  onPreview: (step: ArchitectCraftOperation | null) => void
  onApply: () => void
}) {
  const preview = useRef<HTMLElement>(null)
  useEffect(() => {
    if (draft) preview.current?.focus()
  }, [draft])
  if (!state.corrupted || state.destroyed) return null
  const result = applyCraftStep(catalog, state, { kind: 'architect', outcome: 'destroy' })
  return (
    <section className="craft-sockets" aria-label="建筑师结果预演">
      <h3>建筑师宝珠：摧毁结果预演</h3>
      <p>
        用于比较失去当前装备时的路线成本。当前只开放指定摧毁结果；成功追加强化、特殊交互与随机概率尚未接入。
      </p>
      <button
        type="button"
        disabled={busy || draft !== null || !result.ok}
        onClick={() => onPreview({ kind: 'architect', outcome: 'destroy' })}
      >
        预演建筑师：摧毁物品
      </button>
      {!result.ok ? <p>{result.error}</p> : null}
      {draft ? (
        <section ref={preview} tabIndex={-1} className="socket-preview" aria-label="建筑师结果草稿">
          <h4>摧毁当前装备</h4>
          <p>
            尚未消耗材料。应用后记录一颗建筑师宝珠，装备及其镶嵌物消失，停止制作、面板估算与装备文本导出。
          </p>
          <p>已消耗的材料和起点成本仍保留。演练中可撤销；游戏中被摧毁的装备无法恢复。</p>
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
              应用建筑师摧毁结果
            </button>
          </div>
        </section>
      ) : null}
    </section>
  )
}
