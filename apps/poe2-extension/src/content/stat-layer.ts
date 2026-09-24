import type { Lexicon } from '@poe2-tools/l10n-core'
export function attachStatLayer(doc: Document, lex: Lexicon) {
  const hosts = new Map<Element, HTMLElement>()
  const cache = new Map<string, string | null>()
  function render(stat: Element) {
    if (!stat.isConnected || !stat.closest('main,dialog') || stat.closest('[data-poe2-l10n]'))
      return
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
      host.style.cssText = 'display:block;font-size:0.95em;color:#b6dac4'
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
    const stat = element.closest('.stat')
    if (stat) render(stat)
    for (const child of element.querySelectorAll('.stat')) render(child)
  }
  scan(doc.body)
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      scan(record.target)
      for (const added of record.addedNodes) scan(added)
    }
    for (const [stat, host] of hosts)
      if (!stat.isConnected) {
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
