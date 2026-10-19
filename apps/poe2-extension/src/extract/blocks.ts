import type { BlockKind, GuideBlock, Range } from '@poe2-tools/guide-core'

// 只读遍历：不改 DOM、不加监听。
const SKIP =
  'script,style,noscript,template,nav,header,footer,aside,form,button,input,textarea,select,svg,iframe,[hidden],[aria-hidden="true"]'
const BLOCKS: Readonly<Record<string, BlockKind>> = {
  H1: 'heading',
  H2: 'heading',
  H3: 'heading',
  H4: 'heading',
  H5: 'heading',
  H6: 'heading',
  P: 'paragraph',
  BLOCKQUOTE: 'paragraph',
  DT: 'paragraph',
  DD: 'paragraph',
  LI: 'list-item',
  TD: 'table-cell',
  TH: 'table-cell',
  PRE: 'verbatim',
}
const BLOCK_SELECTOR = Object.keys(BLOCKS).join(',').toLowerCase()
const EMPHASIS = new Set(['STRONG', 'B', 'EM', 'A', 'CODE'])
const MAX_BLOCKS = 5000
type EntityMarker = (element: Element, text: string) => boolean

export interface BlockSink {
  blocks: GuideBlock[]
  add(
    kind: BlockKind,
    text: string,
    extra?: { stageId?: string; entities?: Range[]; emphasis?: Range[] },
  ): void
}

export function createSink(): BlockSink {
  const blocks: GuideBlock[] = []
  return {
    blocks,
    add(kind, text, extra = {}) {
      if (blocks.length >= MAX_BLOCKS || !text.trim()) return
      const block: GuideBlock = { id: `b${blocks.length}`, kind, text: text.slice(0, 20000) }
      if (extra.stageId !== undefined) block.stageId = extra.stageId
      // 只留非空且不越界的范围（零长度范围会让 parseExtractResult 拒收整页）
      const fit = (rs: Range[] | undefined) =>
        rs?.filter(([a, b]) => a >= 0 && a < b && b <= block.text.length)
      const entities = fit(extra.entities)
      const emphasis = fit(extra.emphasis)
      if (entities?.length) block.entities = entities
      if (emphasis?.length) block.emphasis = emphasis
      blocks.push(block)
    },
  }
}

// 块级标签：在块文字里与相邻文字之间要隔开
const BLOCK_LEVEL = new Set([
  'DIV',
  'P',
  'LI',
  'UL',
  'OL',
  'SECTION',
  'ARTICLE',
  'TABLE',
  'TR',
  'TD',
  'TH',
  'DL',
  'DT',
  'DD',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'BLOCKQUOTE',
  'PRE',
  'FIGURE',
  'FIGCAPTION',
  'HR',
  'DETAILS',
  'SUMMARY',
])

// 块级标签，或页面样式把它显示成块（只读 getComputedStyle）。
// 未渲染的文档（DOMParser、测试环境）对行内元素给出空字符串，按行内处理。
function isBlockLevel(el: Element): boolean {
  if (BLOCK_LEVEL.has(el.tagName)) return true
  const display = el.ownerDocument.defaultView?.getComputedStyle(el).display ?? ''
  return display !== '' && !display.startsWith('inline') && display !== 'contents'
}

// 拼接一串节点的文字并合并空白，同时记录强调元素的范围；块级子元素前后补空格。
function textWithEmphasis(
  nodes: readonly Node[],
  skip: string = SKIP,
  entityMarker?: EntityMarker,
): { text: string; emphasis: Range[]; entities: Range[] } {
  let text = ''
  const emphasis: Range[] = []
  const entities: Range[] = []
  const gap = () => {
    if (text && !text.endsWith(' ')) text += ' '
  }
  const visit = (node: Node) => {
    if (node.nodeType === 3) {
      const piece = (node.nodeValue ?? '').replace(/\s+/g, ' ')
      text += text.endsWith(' ') && piece.startsWith(' ') ? piece.slice(1) : piece
      return
    }
    if (node.nodeType !== 1) return
    const child = node as Element
    if (child.matches(skip)) return
    if (child.tagName === 'BR') {
      text += ' '
      return
    }
    const block = isBlockLevel(child)
    if (block) gap()
    const start = text.length
    for (const n of Array.from(child.childNodes)) visit(n)
    if (EMPHASIS.has(child.tagName) || entityMarker) {
      const lead = text.slice(start).length - text.slice(start).trimStart().length
      const end = text.trimEnd().length
      if (end > start + lead) {
        if (EMPHASIS.has(child.tagName)) emphasis.push([start + lead, end])
        if (entityMarker?.(child, text.slice(start + lead, end))) entities.push([start + lead, end])
      }
    }
    if (block) gap()
  }
  for (const n of nodes) visit(n)
  const lead = text.length - text.trimStart().length
  const trimmed = text.trim()
  return {
    text: trimmed,
    emphasis: emphasis
      .map(([a, b]): Range => [a - lead, b - lead])
      .filter(([a, b]) => a >= 0 && b <= trimmed.length && a < b),
    entities: entities
      .map(([a, b]): Range => [a - lead, b - lead])
      .filter(([a, b]) => a >= 0 && b <= trimmed.length && a < b),
  }
}

const directText = (nodes: readonly Node[]) =>
  nodes
    .filter((n) => n.nodeType === 3)
    .map((n) => n.nodeValue ?? '')
    .join(' ')

export function collectBlocks(
  root: Element,
  sink: BlockSink,
  extraSkip = '',
  entityMarker?: EntityMarker,
): void {
  const skip = extraSkip ? `${SKIP},${extraSkip}` : SKIP
  const nested = (el: Element) => el.querySelector(BLOCK_SELECTOR) !== null
  // 含块级后代的元素：子块之间连续的行内内容（文字与行内元素）单独成块。
  // 本身是块标签（如 li）时照收；其他容器（div 等）沿用“直接文字满 40 字才算段落”，
  // 不够时零碎文字丢弃，但行内包装元素（span、a、自定义元素）里可能还有 div 正文，照常递归。
  const flush = (parent: Element, run: Node[]) => {
    if (!run.length) return
    const own = BLOCKS[parent.tagName]
    if (!own && directText(run).trim().length < 40) {
      for (const node of run) if (node.nodeType === 1) visit(node as Element)
      return
    }
    const { text, emphasis, entities } = textWithEmphasis(run, skip, entityMarker)
    sink.add(parent.tagName === 'LI' ? 'list-item' : 'paragraph', text, { emphasis, entities })
  }
  const visit = (el: Element) => {
    if (el.matches(skip)) return
    const kind = BLOCKS[el.tagName]
    if (!nested(el)) {
      if (kind) {
        if (kind === 'verbatim') sink.add('verbatim', (el.textContent ?? '').trim())
        else {
          const { text, emphasis, entities } = textWithEmphasis(
            Array.from(el.childNodes),
            skip,
            entityMarker,
          )
          sink.add(kind, text, { emphasis, entities })
        }
        return
      }
      if (el.tagName === 'DIV' && directText(Array.from(el.childNodes)).trim().length >= 40) {
        const { text, emphasis, entities } = textWithEmphasis(
          Array.from(el.childNodes),
          skip,
          entityMarker,
        )
        sink.add('paragraph', text, { emphasis, entities })
        return
      }
      for (const child of Array.from(el.children)) visit(child)
      return
    }
    let run: Node[] = []
    for (const node of Array.from(el.childNodes)) {
      if (node.nodeType === 3) {
        run.push(node)
        continue
      }
      if (node.nodeType !== 1) continue
      const child = node as Element
      if (child.matches(skip)) continue
      if (!nested(child) && !child.matches(BLOCK_SELECTOR) && !isBlockLevel(child)) {
        run.push(child)
        continue
      }
      flush(el, run)
      run = []
      visit(child)
    }
    flush(el, run)
  }
  visit(root)
}
