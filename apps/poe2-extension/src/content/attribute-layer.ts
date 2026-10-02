import type { Lexicon } from '@poe2-tools/l10n-core'
import { boundaryAttributes, boundaryChanged } from '../adapters/coe-beta/boundaries'
import { regions } from '../adapters/coe-beta/regions'
import { searchLabel } from '../adapters/coe-beta/search'
import { isUserContent } from '../adapters/coe-beta/user-content'

const attributes = ['placeholder', 'title', 'aria-label'] as const
const controls = 'input:not([type="hidden"]), textarea, button, a, [role="button"]'
const excluded =
  '#inventoryZone .tabs, [contenteditable], [data-poe2-l10n], code, pre, [hidden], .hidden, [id*="_ad"]'
const active = new WeakMap<Document, () => void>()
// 补充名称依赖这些用途类；hover/selected 等外观变化无需重扫。
const namingClasses = ['dropdown', 'editing', 'requirements', 'iconed']
function namingBoundaryChanged(record: MutationRecord): boolean {
  if (record.type !== 'attributes' || record.attributeName !== 'class') return false
  const before = new Set((record.oldValue ?? '').split(/\s+/))
  const after = (record.target as Element).classList
  return namingClasses.some((name) => before.has(name) !== after.contains(name))
}
export function attachAttributeLayer(doc: Document, lex: Lexicon, bilingual = false) {
  active.get(doc)?.()
  const owned = new Map<Element, Map<string, { original: string; written: string }>>()
  const fallbackLabels = new Map<Element, string>()
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
    const label = fallbackLabels.get(element)
    if (label !== undefined && element.getAttribute('aria-label') === label)
      element.removeAttribute('aria-label')
    fallbackLabels.delete(element)
  }
  function renderFallbackLabel(element: Element) {
    const previous = fallbackLabels.get(element)
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
    const search =
      element instanceof HTMLInputElement &&
      !element.hasAttribute('aria-labelledby') &&
      !element.hasAttribute('title') &&
      !element.labels?.length &&
      !element.placeholder.trim() &&
      (current === null || current === previous)
        ? searchLabel(element)
        : null
    const translated = search?.[0] ?? (canLabel && source ? lex.translate(source, 'ui') : null)
    if (!translated) {
      if (previous !== undefined && current === previous) element.removeAttribute('aria-label')
      fallbackLabels.delete(element)
      return
    }
    const written = bilingual
      ? `${translated.trim()} · ${(search?.[1] ?? source)?.trim()}`
      : translated
    fallbackLabels.set(element, written)
    if (current !== written) element.setAttribute('aria-label', written)
  }
  function render(element: Element) {
    if (!eligible(element)) {
      restore(element)
      return
    }
    for (const name of attributes) {
      if (name === 'aria-label' && fallbackLabels.get(element) === element.getAttribute(name))
        continue
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
    renderFallbackLabel(element)
    if (owned.get(element)?.size === 0) owned.delete(element)
  }
  function scan(root: Node) {
    if (!(root instanceof Element)) return
    render(root)
    for (const element of root.querySelectorAll(controls)) render(element)
  }
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (
        boundaryChanged(record) ||
        namingBoundaryChanged(record) ||
        record.attributeName === 'disabled'
      )
        scan(record.target)
      else if (
        record.type === 'attributes' &&
        [...attributes, 'tooltip', 'aria-labelledby', 'disabled', 'readonly'].some(
          (name) => name === record.attributeName,
        )
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
    // label 可在输入框之外新增、移除或修改 for；只在关联结构变化时重查输入名称。
    if (
      records.some(
        (record) =>
          record.attributeName === 'for' ||
          [...record.addedNodes, ...record.removedNodes].some(
            (node) =>
              node instanceof Element && (node.matches('label') || node.querySelector('label')),
          ),
      )
    )
      for (const input of doc.querySelectorAll('input')) render(input)
    for (const element of new Set([...owned.keys(), ...fallbackLabels.keys()]))
      if (!eligible(element)) restore(element)
  })
  scan(doc.body)
  observer.observe(doc.body, {
    childList: true,
    characterData: true,
    subtree: true,
    attributes: true,
    attributeOldValue: true,
    attributeFilter: [
      ...attributes,
      'tooltip',
      'aria-labelledby',
      'alt',
      'for',
      'disabled',
      'readonly',
      ...boundaryAttributes,
    ],
  })
  let closed = false
  const stop = () => {
    if (closed) return
    closed = true
    observer.disconnect()
    for (const element of new Set([...owned.keys(), ...fallbackLabels.keys()])) restore(element)
    active.delete(doc)
  }
  active.set(doc, stop)
  return stop
}
