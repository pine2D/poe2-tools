import type { GuideBlock } from '@poe2-tools/guide-core'
import { collectBlocks, createSink } from '../blocks'

const DEFAULT_ROOTS = ['article', 'main', '[role="main"]', '#content', '.content']

// 候选容器里取正文最长的一个；都没有则用 body。
export function pickRoot(doc: Document, preferred: readonly string[] = DEFAULT_ROOTS): Element {
  let best: Element | null = null
  let size = 0
  for (const selector of preferred) {
    for (const el of Array.from(doc.querySelectorAll(selector))) {
      const length = (el.textContent ?? '').trim().length
      if (length > size) {
        best = el
        size = length
      }
    }
  }
  return best ?? doc.body
}

export function extractGeneric(doc: Document): GuideBlock[] {
  const sink = createSink()
  collectBlocks(pickRoot(doc), sink)
  return sink.blocks
}
