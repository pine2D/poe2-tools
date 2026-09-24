import type { Lexicon } from '@poe2-tools/l10n-core'
import { isSupportedStat, statSelector } from '../adapters/coe-beta/stats'
export function attachStatLayer(doc: Document, lex: Lexicon) {
  const hosts = new Map<Element, HTMLElement>()
  const cache = new Map<string, string | null>()
  function render(stat: Element) {
    if (!isSupportedStat(stat)) return
    const original = stat.textContent ?? ''
    let translated = cache.get(original)
    if (translated === undefined) {
      translated = lex.translate(original, 'stat')
      if (cache.size > 2000) cache.clear()
      cache.set(original, translated)
    }
    let host = hosts.get(stat)
    if (!translated || translated === original) {
      host?.remove()
      hosts.delete(stat)
      return
    }
    if (!host?.isConnected) {
      host = doc.createElement('span')
      host.dataset.poe2L10n = 'stat'
      host.style.cssText = 'display:block;flex-basis:100%;font-size:0.95em;color:#b6dac4'
      host.attachShadow({ mode: 'open' })
      stat.after(host)
      hosts.set(stat, host)
    }
    if (stat.nextSibling !== host) stat.after(host)
    if (host.shadowRoot && host.shadowRoot.textContent !== translated)
      host.shadowRoot.textContent = translated
  }
  function scan(root: Node) {
    const element = root instanceof Element ? root : root.parentElement
    if (!element || element.closest('[data-poe2-l10n]')) return
    const stat = element.closest(statSelector)
    if (stat) render(stat)
    for (const child of element.querySelectorAll(statSelector)) render(child)
  }
  scan(doc.body)
  const observer = new MutationObserver((records) => {
    for (const record of records) {
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
      }
  })
  observer.observe(doc.body, { subtree: true, childList: true, characterData: true })
  return () => {
    observer.disconnect()
    for (const host of hosts.values()) host.remove()
    hosts.clear()
    cache.clear()
  }
}
