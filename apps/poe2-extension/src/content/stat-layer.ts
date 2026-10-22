import type { Lexicon } from '@poe2-tools/l10n-core'
import { boundaryAttributes, boundaryChanged } from '../adapters/coe-beta/boundaries'
import { compoundStat } from '../adapters/coe-beta/compound-stat'
import { displayText } from '../adapters/coe-beta/display-text'
import { materialDescription } from '../adapters/coe-beta/material-descriptions'
import { contextualText, textContext } from '../adapters/coe-beta/regions'
import {
  isSupportedStat,
  itemNameSelector,
  materialDescriptionSelector,
  modifierDetailsSelector,
  propertySelector,
  statSelector,
} from '../adapters/coe-beta/stats'
import { adoptL1 } from './l1'
import type { CountedStop } from './text-layer'

export type { CountedStop } from './text-layer'

/** textContent 会吞掉 br 的词边界；只读取显式换行，不依赖布局或改写原站 DOM。 */
function statText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
  if (node.nodeName === 'BR') return '\n'
  return Array.from(node.childNodes, statText).join('')
}

export function attachStatLayer(doc: Document, lex: Lexicon, bilingual = false): CountedStop {
  const hosts = new Map<Element, HTMLElement>()
  const cache = new Map<string, string | null>()
  const originalAttribute = 'data-poe2-l10n-original'
  const diagnosticAttribute = 'data-poe2-l10n-stat-status'
  const diagnosed = new Set<Element>()
  const style = doc.createElement('style')
  style.dataset.poe2L10nStyle = 'stat-visibility'
  // 仅隐藏已译出的视觉原文；原站读取、复制与更新仍使用同一套英文节点。
  style.textContent = `[${originalAttribute}="stat"] { display: none !important; }`
  if (!bilingual) doc.head.append(style)
  function modifierDetailsText(details: Element): string | null {
    let changed = false
    let result = ''
    const walker = doc.createTreeWalker(details, NodeFilter.SHOW_TEXT)
    let node = walker.nextNode()
    while (node) {
      const text = node as Text
      const translated = contextualText(text.data, textContext(text), lex) ?? text.data
      if (translated !== text.data) changed = true
      result += translated
      node = walker.nextNode()
    }
    return changed ? result : null
  }
  function propertyText(property: Element): string | null {
    let changed = false
    const parts = Array.from(property.childNodes, (part) => {
      const nodes: Text[] = []
      if (part.nodeType === 3) nodes.push(part as Text)
      else {
        const walker = doc.createTreeWalker(part, NodeFilter.SHOW_TEXT)
        let node = walker.nextNode()
        while (node) {
          nodes.push(node as Text)
          node = walker.nextNode()
        }
      }
      return nodes
        .map((node) => {
          const translated =
            contextualText(node.data, 'property') ?? lex.translate(node.data) ?? node.data
          if (translated !== node.data) changed = true
          return translated
        })
        .join('')
        .trim()
    }).filter(Boolean)
    return changed ? parts.join(' ') : null
  }
  function render(stat: Element) {
    if (!isSupportedStat(stat)) return
    const original = statText(stat)
    const canonical = displayText(original)
    const kind = stat.matches(itemNameSelector)
      ? 'name'
      : stat.matches(propertySelector)
        ? 'property'
        : stat.matches(modifierDetailsSelector)
          ? 'details'
          : stat.matches(materialDescriptionSelector)
            ? 'material'
            : stat.matches('.modifierTable .row > .label .text')
              ? 'data-stat'
              : 'stat'
    const key = `${kind}\0${original}`
    let translated = cache.get(key)
    if (translated === undefined) {
      translated =
        kind === 'name'
          ? original.trim() === 'New Item'
            ? '新物品'
            : null
          : kind === 'property'
            ? propertyText(stat)
            : kind === 'details'
              ? modifierDetailsText(stat)
              : kind === 'material'
                ? materialDescription(original)
                : kind === 'data-stat'
                  ? compoundStat(canonical, lex)
                  : lex.translate(canonical, 'stat')
      if (cache.size > 2000) cache.clear()
      cache.set(key, translated)
    }
    if (kind === 'stat' || kind === 'data-stat') {
      const status =
        translated && translated !== original
          ? 'translated'
          : (lex.resolveStat?.(canonical).status ?? 'unmatched')
      stat.setAttribute(diagnosticAttribute, status)
      diagnosed.add(stat)
    }
    let host = hosts.get(stat)
    if (!translated || translated === original) {
      host?.remove()
      hosts.delete(stat)
      stat.removeAttribute(originalAttribute)
      return
    }
    if (!host?.isConnected) {
      host = doc.createElement('span')
      host.dataset.poe2L10n = 'stat'
      host.style.cssText = 'display:block;flex-basis:100%;font-size:0.95em'
      adoptL1(host.attachShadow({ mode: 'open' }))
      stat.after(host)
      hosts.set(stat, host)
    }
    if (stat.nextSibling !== host) stat.after(host)
    if (!bilingual) stat.setAttribute(originalAttribute, 'stat')
    host.title = original
    if (host.shadowRoot && host.shadowRoot.textContent !== translated)
      host.shadowRoot.textContent = translated
  }
  function removeClonedHosts(root: Element) {
    // 原站 cloneNode 会复制宿主标记，但不会复制 Shadow DOM；这些空壳不在 hosts 中。
    const selector = '[data-poe2-l10n="stat"]'
    if (root.matches(selector) && !root.shadowRoot) root.remove()
    for (const host of root.querySelectorAll(selector)) if (!host.shadowRoot) host.remove()
    const originals = `[${originalAttribute}="stat"]`
    if (root.matches(originals) && !hosts.has(root)) root.removeAttribute(originalAttribute)
    for (const original of root.querySelectorAll(originals))
      if (!hosts.has(original)) original.removeAttribute(originalAttribute)
    if (root.hasAttribute(diagnosticAttribute) && !diagnosed.has(root))
      root.removeAttribute(diagnosticAttribute)
    for (const original of root.querySelectorAll(`[${diagnosticAttribute}]`))
      if (!diagnosed.has(original)) original.removeAttribute(diagnosticAttribute)
  }
  function scan(root: Node) {
    const element = root instanceof Element ? root : root.parentElement
    if (!element) return
    removeClonedHosts(element)
    if (element.closest('[data-poe2-l10n]')) return
    const stat = element.closest(statSelector)
    if (stat) render(stat)
    for (const child of element.querySelectorAll(statSelector)) render(child)
  }
  scan(doc.body)
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'attributes') {
        if (boundaryChanged(record)) scan(record.target)
        continue
      }
      // 只检查发生变化的词缀与新增子树，不因插入中文层重扫整个结果表。
      const target = record.target instanceof Element ? record.target : record.target.parentElement
      const stat = target?.closest(statSelector)
      if (stat) render(stat)
      for (const added of record.addedNodes) scan(added)
    }
    for (const [stat, host] of hosts)
      if (!isSupportedStat(stat)) {
        host.remove()
        hosts.delete(stat)
        stat.removeAttribute(originalAttribute)
      }
    for (const stat of diagnosed)
      if (!isSupportedStat(stat)) {
        stat.removeAttribute(diagnosticAttribute)
        diagnosed.delete(stat)
      }
  })
  observer.observe(doc.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeOldValue: true,
    attributeFilter: boundaryAttributes,
  })
  return Object.assign(
    () => {
      observer.disconnect()
      for (const [stat, host] of hosts) {
        host.remove()
        stat.removeAttribute(originalAttribute)
      }
      hosts.clear()
      for (const stat of diagnosed) stat.removeAttribute(diagnosticAttribute)
      diagnosed.clear()
      removeClonedHosts(doc.body)
      style.remove()
      cache.clear()
    },
    // 每个宿主是一条用户可见的中文词缀行；不再受支持的词缀在变更回调末尾剔除（上方 MutationObserver 回调）
    { count: () => hosts.size },
  )
}
