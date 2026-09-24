import type { Lexicon } from '@poe2-tools/l10n-core'
import { regions } from '../adapters/coe-beta/regions'

const attributes = ['placeholder', 'title', 'aria-label'] as const
const controls = 'input:not([type="hidden"]), textarea, button, a, [role="button"]'
const excluded =
  '#inventoryZone .tabs, [contenteditable], [data-poe2-l10n], code, pre, [hidden], .hidden, [id*="_ad"]'
const active = new WeakMap<Document, () => void>()
export function attachAttributeLayer(doc: Document, lex: Lexicon, bilingual = false) {
  active.get(doc)?.()
  const owned = new Map<Element, Map<string, { original: string; written: string }>>()
  function eligible(element: Element) {
    return (
      element.isConnected &&
      element.matches(controls) &&
      !!element.closest(regions) &&
      !element.closest(excluded)
    )
  }
  function restore(element: Element) {
    for (const [name, entry] of owned.get(element) ?? []) {
      if (element.getAttribute(name) === entry.written) element.setAttribute(name, entry.original)
    }
    owned.delete(element)
  }
  function render(element: Element) {
    if (!eligible(element)) {
      restore(element)
      return
    }
    for (const name of attributes) {
      if (name === 'placeholder' && !element.matches('input, textarea')) continue
      const original = element.getAttribute(name)
      const entries = owned.get(element)
      if (original !== null && entries?.get(name)?.written === original) continue
      entries?.delete(name)
      const translated = original ? lex.translate(original, 'ui') : null
      if (!translated || translated === original) continue
      const state = entries ?? new Map()
      const written = bilingual ? `${translated.trim()} · ${original?.trim()}` : translated
      state.set(name, { original: original as string, written })
      owned.set(element, state)
      element.setAttribute(name, written)
    }
    if (owned.get(element)?.size === 0) owned.delete(element)
  }
  function scan(root: Node) {
    if (!(root instanceof Element)) return
    render(root)
    for (const element of root.querySelectorAll(controls)) render(element)
  }
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'attributes') render(record.target as Element)
      else for (const node of record.addedNodes) scan(node)
    }
    for (const element of owned.keys()) if (!eligible(element)) restore(element)
  })
  scan(doc.body)
  observer.observe(doc.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: [...attributes],
  })
  let closed = false
  const stop = () => {
    if (closed) return
    closed = true
    observer.disconnect()
    for (const element of owned.keys()) restore(element)
    active.delete(doc)
  }
  active.set(doc, stop)
  return stop
}
