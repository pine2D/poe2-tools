import type { Lexicon } from '@poe2-tools/l10n-core'
import { boundaryAttributes, boundaryChanged } from '../adapters/coe-beta/boundaries'
import { regions } from '../adapters/coe-beta/regions'
import { isUserContent } from '../adapters/coe-beta/user-content'

const attributes = ['placeholder', 'title', 'aria-label'] as const
const controls = 'input:not([type="hidden"]), textarea, button, a, [role="button"]'
const excluded =
  '#inventoryZone .tabs, [contenteditable], [data-poe2-l10n], code, pre, [hidden], .hidden, [id*="_ad"]'
const active = new WeakMap<Document, () => void>()
export function attachAttributeLayer(doc: Document, lex: Lexicon, bilingual = false) {
  active.get(doc)?.()
  const owned = new Map<Element, Map<string, { original: string; written: string }>>()
  const iconLabels = new Map<Element, string>()
  function eligible(element: Element) {
    return (
      element.isConnected &&
      element.matches(controls) &&
      !!element.closest(regions) &&
      !element.closest(excluded) &&
      !isUserContent(element)
    )
  }
  function restore(element: Element) {
    for (const [name, entry] of owned.get(element) ?? []) {
      if (element.getAttribute(name) === entry.written) element.setAttribute(name, entry.original)
    }
    owned.delete(element)
    const label = iconLabels.get(element)
    if (label !== undefined && element.getAttribute('aria-label') === label)
      element.removeAttribute('aria-label')
    iconLabels.delete(element)
  }
  function renderIconLabel(element: Element) {
    const previous = iconLabels.get(element)
    const current = element.getAttribute('aria-label')
    const source = element.getAttribute('tooltip')
    const canLabel =
      element.matches(
        '#simulatorConditionRequirements button.iconed, #calculatorZone .requirements button.iconed',
      ) &&
      !element.textContent?.trim() &&
      !element.hasAttribute('aria-labelledby') &&
      !element.hasAttribute('title') &&
      !element.querySelector('img[alt]:not([alt=""])') &&
      (current === null || current === previous)
    const translated = canLabel && source ? lex.translate(source, 'ui') : null
    if (!translated) {
      if (previous !== undefined && current === previous) element.removeAttribute('aria-label')
      iconLabels.delete(element)
      return
    }
    const written = bilingual ? `${translated.trim()} · ${source?.trim()}` : translated
    iconLabels.set(element, written)
    if (current !== written) element.setAttribute('aria-label', written)
  }
  function render(element: Element) {
    if (!eligible(element)) {
      restore(element)
      return
    }
    for (const name of attributes) {
      if (name === 'aria-label' && iconLabels.get(element) === element.getAttribute(name)) continue
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
    renderIconLabel(element)
    if (owned.get(element)?.size === 0) owned.delete(element)
  }
  function scan(root: Node) {
    if (!(root instanceof Element)) return
    render(root)
    for (const element of root.querySelectorAll(controls)) render(element)
  }
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (boundaryChanged(record)) scan(record.target)
      else if (
        record.type === 'attributes' &&
        [...attributes, 'tooltip', 'aria-labelledby'].some((name) => name === record.attributeName)
      )
        render(record.target as Element)
      else {
        const target =
          record.target instanceof Element ? record.target : record.target.parentElement
        const button = target?.closest('button')
        if (button) render(button)
        for (const node of record.addedNodes) scan(node)
      }
    }
    for (const element of new Set([...owned.keys(), ...iconLabels.keys()]))
      if (!eligible(element)) restore(element)
  })
  scan(doc.body)
  observer.observe(doc.body, {
    childList: true,
    characterData: true,
    subtree: true,
    attributes: true,
    attributeOldValue: true,
    attributeFilter: [...attributes, 'tooltip', 'aria-labelledby', ...boundaryAttributes],
  })
  let closed = false
  const stop = () => {
    if (closed) return
    closed = true
    observer.disconnect()
    for (const element of new Set([...owned.keys(), ...iconLabels.keys()])) restore(element)
    active.delete(doc)
  }
  active.set(doc, stop)
  return stop
}
