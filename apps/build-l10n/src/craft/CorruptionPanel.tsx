import {
  applyCraftStep,
  type CraftCatalog,
  type CraftState,
  type VaalCraftOperation,
} from '@poe2-tools/item-core'
import { useEffect, useRef } from 'react'

interface Props {
  catalog: CraftCatalog
  state: CraftState
  draft: VaalCraftOperation | null
  busy: boolean
  canApply: boolean
  onPreview: (step: VaalCraftOperation | null) => void
  onApply: () => void
}

export function CorruptionPanel({
  catalog,
  state,
  draft,
  busy,
  canApply,
  onPreview,
  onApply,
}: Props) {
  const preview = useRef<HTMLElement>(null)
  useEffect(() => {
    if (draft) preview.current?.focus()
  }, [draft])
  if (catalog.bases.find((base) => base.id === state.baseId)?.type === 'Jewel') return null
  if (state.corrupted)
    return (
      <section className="craft-sockets" aria-label="腐化状态">
        <h3>已腐化</h3>
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
        手选“属性不变”或“增加一孔”查看后续路线，每次记录一颗瓦尔石。这不是随机抽取，也不代表成功率。
      </p>
      <p>
        瓦尔石还可能新增腐化属性或重选词缀，这两类结果尚未支持。预兆、特殊魂核和腐化珠宝另行接入。
      </p>
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
      {draft ? (
        <section ref={preview} tabIndex={-1} className="socket-preview" aria-label="腐化结果草稿">
          <h4>{draft.outcome === 'socket' ? '腐化增加一孔' : '腐化但属性不变'}</h4>
          {draft.outcome === 'socket' ? (
            <p>
              孔数 {state.sockets?.length ?? 0} → {(state.sockets?.length ?? 0) + 1}
              ，保留已有镶嵌物。
            </p>
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
