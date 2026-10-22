import type { GuideBlock } from '@poe2-tools/guide-core'
import { BASE_SKIP, excluded } from './visibility'

/** 只在页面会话内保存；不序列化、不发送到模型。 */
export interface BlockSource {
  container: Element
  start: Text
  startOffset: number
  end: Text
  endOffset: number
  quote: string
}
export type CaptureBlock = (block: GuideBlock, source: BlockSource) => void

export function sourceRange(source: BlockSource): Range {
  const range = source.start.ownerDocument.createRange()
  range.setStart(source.start, source.startOffset)
  range.setEnd(source.end, source.endOffset)
  return range
}

export function captureSource(
  container: Element,
  nodes: readonly Node[],
  skip = BASE_SKIP,
): BlockSource | null {
  const texts: Text[] = []
  const visit = (node: Node) => {
    if (node.nodeType === 3 && node.nodeValue?.length) texts.push(node as Text)
    else if (node.nodeType === 1 && !excluded(node as Element, skip))
      for (const child of Array.from(node.childNodes)) visit(child)
  }
  for (const node of nodes) visit(node)
  const start = texts[0],
    end = texts.at(-1)
  if (!start || !end) return null
  const source = { container, start, startOffset: 0, end, endOffset: end.length, quote: '' }
  source.quote = sourceRange(source).toString()
  return source
}

/** 对齐选区克隆与原节点，按原页面可见性移除克隆文字，保留首尾字符偏移。 */
export function selectedSources(
  range: Range,
  clone: Node,
): WeakMap<Node, { node: Text; from: number; to: number }> | null {
  const parts: { node: Text; from: number; to: number }[] = []
  const common = range.commonAncestorContainer
  const collect = (node: Node) => {
    if (node.nodeType === 3 && range.intersectsNode(node)) {
      const from = node === range.startContainer ? range.startOffset : 0
      const to = node === range.endContainer ? range.endOffset : (node.nodeValue?.length ?? 0)
      if (to > from) parts.push({ node: node as Text, from, to })
    } else for (const child of Array.from(node.childNodes)) collect(child)
  }
  collect(common)
  const copies: Text[] = []
  const copied = (node: Node) => {
    if (node.nodeType === 3 && node.nodeValue?.length) copies.push(node as Text)
    else for (const child of Array.from(node.childNodes)) copied(child)
  }
  copied(clone)
  const map = new WeakMap<Node, { node: Text; from: number; to: number }>()
  if (parts.length !== copies.length) return null
  for (let i = 0; i < copies.length; i++) {
    const part = parts[i],
      copy = copies[i]
    if (!part || !copy || part.node.data.slice(part.from, part.to) !== copy.data) return null
    map.set(copy, part)
  }
  // 脱离文档的克隆没有原页面的样式上下文；所有排除判断都针对原节点祖先。
  for (const copy of copies) {
    const original = map.get(copy)
    for (let el = original?.node.parentElement; el; el = el.parentElement) {
      if (excluded(el)) {
        copy.remove()
        break
      }
    }
  }
  return map
}
