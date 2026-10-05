// 阶段看板的小部件：变化标记字、空格、分组行
import type { Change } from '../stages'
import { markOf } from './board'

export function MarkTag({ change }: { change: Change | null }) {
  const mark = markOf(change)
  if (mark === null) return null
  return (
    <span className="stageboard__mark" aria-hidden="true">
      {mark.text}
    </span>
  )
}

export function NoneCell() {
  return (
    <span className="stageboard__none">
      <span aria-hidden="true">—</span>
      <span className="visually-hidden">本阶段无</span>
    </span>
  )
}

export function SectionRow({ label, colSpan }: { label: string; colSpan: number }) {
  return (
    <tr className="stageboard__section">
      <th scope="rowgroup" colSpan={colSpan}>
        <span className="stageboard__section-label">{label}</span>
      </th>
    </tr>
  )
}
