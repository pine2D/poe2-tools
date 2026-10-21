import type { PreparedBlock } from '@poe2-tools/guide-core'
import { el } from './dom'

/** 保持提取顺序，连续列表和表格块按源结构组合。 */
export function blockLayout(doc: Document, root: HTMLElement) {
  let tableId: string | undefined
  let rowId: string | undefined
  let table: HTMLTableElement | null = null
  let row: HTMLTableRowElement | null = null
  let listId: string | undefined
  let list: HTMLUListElement | null = null
  return (block: PreparedBlock, node: HTMLElement) => {
    const structure = block.processing?.structure
    if (block.kind === 'table-cell' && structure?.tableId) {
      list = null
      listId = undefined
      if (tableId !== structure.tableId || !table) {
        tableId = structure.tableId
        rowId = undefined
        table = el(doc, 'table', { class: 'guide-table' })
        root.append(el(doc, 'div', { class: 'guide-table-wrap' }, table))
      }
      if (rowId !== structure.rowId || !row) {
        rowId = structure.rowId
        row = el(doc, 'tr')
        table.append(row)
      }
      const cell = el(
        doc,
        structure.header ? 'th' : 'td',
        { 'aria-colindex': String((structure.column ?? 0) + 1) },
        node,
      )
      row.append(cell)
    } else {
      table = null
      row = null
      tableId = undefined
      rowId = undefined
      if (block.kind === 'list-item' && structure?.listId) {
        if (listId !== structure.listId || !list) {
          listId = structure.listId
          list = el(doc, 'ul', { class: 'guide-list' })
          root.append(list)
        }
        list.append(el(doc, 'li', {}, node))
      } else {
        list = null
        listId = undefined
        root.append(node)
      }
    }
  }
}
