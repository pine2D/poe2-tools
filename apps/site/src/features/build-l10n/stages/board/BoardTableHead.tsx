// 对照表列头：第一行阶段名（唯一的金属注意力落点），第二行天赋点数、待核对数、作者备注与“逐项核对”
import { useState } from 'react'
import type { MissEntry } from '../../preview/locate'
import { spanText } from '../../preview/markup'
import type { Stage } from '../stages'
import { type FieldMaps, passiveDelta } from './board'

// 作者备注：默认两行摘要，可展开全文（触屏与键盘都能操作）；未被截断时点击不切换
function StageNote({ note }: { note: string }) {
  // 展开态跟随 toggle 事件记录，点击时按记录判定（不读点击当下的 open，各环境切换时机不同）
  const [open, setOpen] = useState(false)
  return (
    <details className="stageboard__note" onToggle={(event) => setOpen(event.currentTarget.open)}>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: summary 是原生可交互的展开控件（键盘 Enter/Space 也会触发 click） */}
      <summary
        onClick={(event) => {
          const details = event.currentTarget.parentElement as HTMLElement
          if (!open && details.dataset.clamped === 'false') event.preventDefault()
        }}
      >
        <span className="stageboard__note-text">{note}</span>
        <span className="stageboard__note-more" aria-hidden="true">
          <span className="stageboard__note-open">展开全文</span>
          <span className="stageboard__note-close">收起</span>
        </span>
      </summary>
    </details>
  )
}

export interface BoardTableHeadProps {
  stages: readonly Stage[]
  fieldMaps: FieldMaps
  misses: ReadonlyMap<string, readonly MissEntry[]>
  onReview(fileId: string): void
}

export function BoardTableHead({ stages, fieldMaps, misses, onReview }: BoardTableHeadProps) {
  return (
    <thead>
      <tr>
        <td className="stageboard__corner" rowSpan={2} />
        {stages.map((stage) => (
          <th key={stage.file.id} scope="col" className="stageboard__stage">
            <span className="stageboard__stage-name pt-stagehead" data-user-text="">
              {stage.label}
            </span>
          </th>
        ))}
      </tr>
      <tr>
        {stages.map((stage, column) => {
          const count = stage.file.preview.passives.length
          const previous = column > 0 ? stages[column - 1]?.file.preview.passives.length : undefined
          const missCount = misses.get(stage.file.id)?.length ?? 0
          const description = fieldMaps.get(stage.file.id)?.get('description')
          const note = description?.rows.map((row) => spanText(row.zh ?? row.en)).join(' ') ?? ''
          return (
            <td key={stage.file.id} className="stageboard__stage-info">
              <span className="stageboard__stage-meta">
                <span>
                  天赋 {count} 点{previous === undefined ? '' : passiveDelta(count - previous)}
                </span>
                {missCount > 0 && <span className="stageboard__miss">待核对 {missCount}</span>}
              </span>
              {note !== '' && <StageNote note={note} />}
              <button
                type="button"
                className="pt-btn pt-btn--quiet pt-btn--xs"
                aria-label={`逐项核对 ${stage.label}`}
                onClick={() => onReview(stage.file.id)}
              >
                逐项核对
              </button>
            </td>
          )
        })}
      </tr>
    </thead>
  )
}
