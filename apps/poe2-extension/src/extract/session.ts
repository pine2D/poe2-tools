import type { ExtractResult } from '@poe2-tools/guide-core'
import {
  appendTranslation,
  outline,
  type PageNotice,
  type PageResult,
  type PageTranslation,
} from './inline'
import { startPicker } from './picker'
import { type ExtractOptions, extractPage, type PageLocation } from './run'
import { type BlockSource, sourceRange } from './source'
import { excluded } from './visibility'

export type ReadingMode = 'inline' | 'sidebar'
export function createPageSession(doc: Document, loc: PageLocation) {
  let snapshot: string | null = null
  let url = ''
  let revision = ''
  let mode: ReadingMode = 'inline'
  const sources = new Map<string, BlockSource>()
  const ids = new Set<string>()
  const hosts = new Map<string, HTMLElement>()
  const changedIds = new Set<string>()
  let observer: MutationObserver | null = null
  let picker: ReturnType<typeof startPicker> | null = null
  let highlight: HTMLElement | null = null
  let highlightTimer: ReturnType<typeof setTimeout> | null = null
  const stale = (): PageResult => ({
    state: 'stale',
    message: '原文已变化或页面已更换，请重新读取。',
  })
  const unavailable = (): PageResult => ({
    state: 'sidebar',
    message: '此段没有可安全显示的原文位置，请在侧栏阅读。',
  })
  const valid = (source: BlockSource) => {
    if (
      url !== loc.href ||
      !source.start.isConnected ||
      !source.end.isConnected ||
      !source.container.isConnected ||
      !source.container.contains(source.start) ||
      !source.container.contains(source.end)
    )
      return false
    for (let node: Element | null = source.container; node; node = node.parentElement)
      if (excluded(node)) return false
    try {
      return sourceRange(source).toString() === source.quote
    } catch {
      return false
    }
  }
  const validate = () => {
    for (const [id, source] of sources)
      if (changedIds.has(id) || !valid(source)) {
        changedIds.add(id)
        hosts.get(id)?.remove()
        hosts.delete(id)
      }
  }
  const checked = (key: string, id: string): BlockSource | PageResult => {
    validate()
    if (!snapshot || snapshot !== key || loc.href !== url || changedIds.has(id) || !ids.has(id))
      return stale()
    return sources.get(id) ?? unavailable()
  }
  const clearHighlight = () => {
    highlight?.remove()
    highlight = null
    if (highlightTimer) clearTimeout(highlightTimer)
    highlightTimer = null
  }
  const cancelPicker = () => {
    picker?.cancel()
    picker = null
  }
  const clear = () => {
    cancelPicker()
    observer?.disconnect()
    observer = null
    clearHighlight()
    for (const host of hosts.values()) host.remove()
    hosts.clear()
    sources.clear()
    ids.clear()
    changedIds.clear()
    snapshot = null
    revision = ''
    doc.defaultView?.removeEventListener('pagehide', clear)
    doc.defaultView?.removeEventListener('popstate', validate)
    doc.defaultView?.removeEventListener('hashchange', validate)
  }
  const read = (options: ExtractOptions = { scope: 'full' }): ExtractResult => {
    clear()
    const selection = doc.getSelection()
    const result = extractPage(
      doc,
      loc,
      String(selection ?? ''),
      new Date().toISOString(),
      selection?.rangeCount ? selection.getRangeAt(0) : undefined,
      { ...options, onBlock: (block, source) => sources.set(block.id, source) },
    )
    if (!result.ok) return result
    snapshot = crypto.randomUUID()
    url = loc.href
    result.doc.source.snapshotId = snapshot
    for (const block of result.doc.blocks) ids.add(block.id)
    const Observer = doc.defaultView?.MutationObserver
    if (Observer) {
      observer = new Observer(validate)
      observer.observe(doc.body, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['hidden', 'style', 'class', 'open', 'aria-hidden'],
      })
    }
    doc.defaultView?.addEventListener('pagehide', clear)
    doc.defaultView?.addEventListener('popstate', validate)
    doc.defaultView?.addEventListener('hashchange', validate)
    return result
  }
  const render = (key: string, result: PageTranslation | PageNotice): PageResult => {
    if ((result.revision ?? '') !== revision) return stale()
    const source = checked(key, result.id)
    if ('state' in source) return source
    hosts.get(result.id)?.remove()
    hosts.delete(result.id)
    const host = appendTranslation(source, result)
    if (!host) return unavailable()
    host.hidden = mode === 'sidebar'
    hosts.set(result.id, host)
    return { state: 'inline', message: mode === 'sidebar' ? '可在原文旁显示' : '已在原文旁显示' }
  }
  return {
    version: 2,
    read,
    render: (key: string, result: PageTranslation) => render(key, result),
    notice: (key: string, result: PageNotice) => render(key, result),
    locate(key: string, id: string): PageResult {
      const source = checked(key, id)
      if ('state' in source) return source
      clearHighlight()
      source.container.scrollIntoView?.({ block: 'center', behavior: 'auto' })
      highlight = outline(doc, source.container)
      highlightTimer = setTimeout(clearHighlight, 1800)
      return { state: 'located', message: '已定位原文' }
    },
    setMode(next: ReadingMode) {
      mode = next
      validate()
      for (const host of hosts.values()) host.hidden = mode === 'sidebar'
    },
    reset(key: string, next: string) {
      if (key !== snapshot) throw Error('原文会话已过期')
      if (!/^\d+$/.test(next)) throw Error('无效的范围修订')
      if (Number(next) < Number(revision)) return
      revision = next
      for (const host of hosts.values()) host.remove()
      hosts.clear()
    },
    remove(key: string, id: string, expectedRevision = '') {
      if (key === snapshot && revision === expectedRevision) {
        hosts.get(id)?.remove()
        hosts.delete(id)
      }
    },
    status() {
      validate()
      return {
        snapshotId: snapshot,
        stale: !snapshot || url !== loc.href || changedIds.size > 0,
        changedIds: [...changedIds],
      }
    },
    async pickRegion(): Promise<ExtractResult | null> {
      cancelPicker()
      const current = startPicker(doc)
      picker = current
      const regionRoot = await current.result
      if (picker !== current) return null
      picker = null
      return regionRoot ? read({ scope: 'region', regionRoot }) : null
    },
    cancelPicker,
    clear,
  }
}
export type PageSession = ReturnType<typeof createPageSession>
