import type { GuideBlock } from '@poe2-tools/guide-core'
import { extractPage, type PageLocation } from '../extract/run'
import { combineSelection, MAX_SELECTION_CHARS } from './protocol'

const PRIVATE =
  'input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]'
export function captureSelection(
  doc: Document,
  loc: PageLocation,
  range: Range,
): GuideBlock | null {
  if (
    range.collapsed ||
    !range.startContainer.isConnected ||
    !range.endContainer.isConnected ||
    range.toString().length > MAX_SELECTION_CHARS
  )
    return null
  const parent = (n: Node) => (n.nodeType === 1 ? (n as Element) : n.parentElement)
  if (
    parent(range.startContainer)?.closest(PRIVATE) ||
    parent(range.endContainer)?.closest(PRIVATE)
  )
    return null
  const common = parent(range.commonAncestorContainer)
  if (!common || common.closest('[data-poe2-guide-owned]')) return null
  // 跨节点选区不能借道读取编辑器；不只检查起止节点。
  for (const input of common.querySelectorAll(PRIVATE)) if (range.intersectsNode(input)) return null
  const result = extractPage(doc, loc, '', '', range, { scope: 'selection' })
  return result.ok ? combineSelection(result.doc.blocks) : null
}
