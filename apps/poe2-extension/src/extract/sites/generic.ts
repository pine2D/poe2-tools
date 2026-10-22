import type { ExtractionDiagnostic, GuideBlock } from '@poe2-tools/guide-core'
import { collectBlocks, createSink } from '../blocks'
import type { CaptureBlock } from '../source'
import { excluded, readableSize } from '../visibility'

const DEFAULT_ROOTS = ['article', 'main', '[role="main"]', '#content', '.content']

// 可读正文而非脚本/导航长度决定候选；相邻正文卡片归入共同内容容器。
export function pickRoot(doc: Document, preferred: readonly string[] = DEFAULT_ROOTS): Element {
  let best: Element | null = null
  let size = 0
  const eligible = (el: Element) => {
    for (let n: Element | null = el; n; n = n.parentElement) if (excluded(n)) return false
    return true
  }
  for (const selector of preferred)
    for (const el of Array.from(doc.querySelectorAll(selector))) {
      if (!eligible(el)) continue
      const length = readableSize(el)
      if (length > size) {
        best = el
        size = length
      }
    }
  if (!best) return doc.body
  if (preferred !== DEFAULT_ROOTS) return best
  let root = best
  let cursor = best
  const main = 'main,[role="main"],#content,.content'
  while (
    !cursor.matches(main) &&
    cursor.parentElement &&
    cursor.parentElement !== doc.documentElement
  ) {
    const parent = cursor.parentElement
    if (!eligible(parent)) break
    const expanded = readableSize(parent)
    const extra = expanded - size
    const siblings = Array.from(parent.children).filter((e) => e !== cursor && !excluded(e))
    const title =
      parent !== doc.body &&
      siblings.some(
        (e) => e.matches('h1,h2,h3,header,[role="heading"]') || e.querySelector('h1,h2,h3'),
      )
    if (extra >= Math.max(80, size * 0.15) || (title && extra > 0) || parent.matches(main)) {
      root = parent
      size = expanded
    }
    // 空包装本身不扩范围，但不能阻断外层相邻正文的发现。
    cursor = parent
  }
  return root
}

export function extractGeneric(
  doc: Document,
  diagnostics: ExtractionDiagnostic[] = [],
  onBlock?: CaptureBlock,
): GuideBlock[] {
  const sink = createSink(diagnostics)
  const root = pickRoot(doc)
  collectBlocks(root, sink, '', undefined, root !== doc.body, onBlock)
  return sink.blocks
}
