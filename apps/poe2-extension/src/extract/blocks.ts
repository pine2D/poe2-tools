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
      const fit = (rs: Range[] | undefined) => rs?.filter(([, b]) => b <= block.text.length)
      const entities = fit(extra.entities)
      const emphasis = fit(extra.emphasis)
      if (entities?.length) block.entities = entities
      if (emphasis?.length) block.emphasis = emphasis
      blocks.push(block)
    },
  }
}

// 拼接元素文字并合并空白，同时记录强调元素的范围。
function textWithEmphasis(el: Element): { text: string; emphasis: Range[] } {
  let text = ''
  const emphasis: Range[] = []
  const visit = (node: Node) => {
    if (node.nodeType === 3) {
      const piece = (node.nodeValue ?? '').replace(/\s+/g, ' ')
      text += text.endsWith(' ') && piece.startsWith(' ') ? piece.slice(1) : piece
      return
    }
    if (node.nodeType !== 1) return
    const child = node as Element
    if (child.matches(SKIP)) return
    if (child.tagName === 'BR') {
      text += ' '
      return
    }
    const start = text.length
    for (const n of Array.from(child.childNodes)) visit(n)
    if (EMPHASIS.has(child.tagName)) {
      const lead = text.slice(start).length - text.slice(start).trimStart().length
      const end = text.trimEnd().length
      if (end > start + lead) emphasis.push([start + lead, end])
    }
  }
  for (const n of Array.from(el.childNodes)) visit(n)
  const lead = text.length - text.trimStart().length
  const trimmed = text.trim()
  return {
    text: trimmed,
    emphasis: emphasis
      .map(([a, b]): Range => [a - lead, b - lead])
      .filter(([a, b]) => a >= 0 && b <= trimmed.length && a < b),
  }
}

export function collectBlocks(root: Element, sink: BlockSink, extraSkip = ''): void {
  const skip = extraSkip ? `${SKIP},${extraSkip}` : SKIP
  const visit = (el: Element) => {
    if (el.matches(skip)) return
    const kind = BLOCKS[el.tagName]
    if (kind && !el.querySelector(BLOCK_SELECTOR)) {
      if (kind === 'verbatim') sink.add('verbatim', (el.textContent ?? '').trim())
      else {
        const { text, emphasis } = textWithEmphasis(el)
        sink.add(kind, text, { emphasis })
      }
      return
    }
    if (el.tagName === 'DIV' && !el.querySelector(BLOCK_SELECTOR)) {
      const direct = Array.from(el.childNodes)
        .filter((n) => n.nodeType === 3)
        .map((n) => n.nodeValue ?? '')
        .join(' ')
      if (direct.trim().length >= 40) {
        const { text, emphasis } = textWithEmphasis(el)
        sink.add('paragraph', text, { emphasis })
        return
      }
    }
    for (const child of Array.from(el.children)) visit(child)
  }
  visit(root)
}
