import type { Lexicon } from '@poe2-tools/l10n-core'
import { boundaryAttributes, boundaryChanged } from '../adapters/coe-beta/boundaries'
import { contextualText, textContext, translatable } from '../adapters/coe-beta/regions'

const active = new WeakMap<Document, () => void>()

export function attachTextLayer(doc: Document, lexicon: Lexicon, bilingual = false): () => void {
  active.get(doc)?.()
  const state = new WeakMap<Text, { original: string; written: string; context: string }>()
  const owned = new Set<Text>()
  const cache = new Map<string, string | null>()
  function render(node: Text) {
    if (!node.isConnected || !translatable(node) || !node.data.trim()) return
    const entry = state.get(node)
    const context = textContext(node)
    if (entry?.written === node.data && entry.context === context) return
    const original = entry?.written === node.data ? entry.original : node.data
    const cacheKey = `${context}\0${original}`
    let translated = cache.get(cacheKey)
    if (translated === undefined) {
      translated = contextualText(original, context) ?? lexicon.translate(original)
      if (cache.size >= 2000) cache.clear()
      cache.set(cacheKey, translated)
    }
    if (translated === null || translated === original) {
      if (node.data !== original) node.data = original
      state.delete(node)
      owned.delete(node)
      return
    }
    const written = bilingual ? `${translated.trim()} · ${original.trim()}` : translated
    state.set(node, { original, written, context })
    owned.add(node)
    node.data = written
  }
  function scan(root: Node) {
    if (root.nodeType === 3) {
      render(root as Text)
      return
    }
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let node = walker.nextNode()
    while (node) {
      render(node as Text)
      node = walker.nextNode()
    }
  }
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'characterData' || boundaryChanged(record)) scan(record.target)
      else for (const node of record.addedNodes) scan(node)
    }
    for (const node of owned) {
      if (node.isConnected && translatable(node)) continue
      const entry = state.get(node)
      if (entry && node.data === entry.written) node.data = entry.original
      state.delete(node)
      owned.delete(node)
    }
  })
  scan(doc.body)
  observer.observe(doc.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeOldValue: true,
    attributeFilter: boundaryAttributes,
  })
  let closed = false
  const stop = () => {
    if (closed) return
    closed = true
    observer.disconnect()
    for (const node of owned) {
      const entry = state.get(node)
      if (entry && node.data === entry.written) node.data = entry.original
    }
    owned.clear()
    cache.clear()
    active.delete(doc)
  }
  active.set(doc, stop)
  return stop
}
