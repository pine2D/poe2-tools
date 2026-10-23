import type { Lexicon } from '@poe2-tools/l10n-core'
import { boundaryAttributes, boundaryChanged } from '../adapters/coe-beta/boundaries'
import { contextualText, textContext, translatable } from '../adapters/coe-beta/regions'

/** 停止函数，附带“当前页面上正显示中文的处数”（弹窗“已翻译 N 处”，第三期裁定 5） */
export type CountedStop = (() => void) & { count(): number }
const active = new WeakMap<Document, () => void>()
// 基底搜索结果卡片标题栏定高 31px、nowrap；中英对照名称在此单行省略，完整名称放进 title。
const fitLabel = '.itemSearchResults > .item .header > .center > .label'
const fitAttribute = 'data-poe2-l10n-fit'

export function attachTextLayer(doc: Document, lexicon: Lexicon, bilingual = false): CountedStop {
  active.get(doc)?.()
  const style = doc.createElement('style')
  style.dataset.poe2L10nStyle = 'bilingual-headers'
  // 数值列仍用原站 nowrap；只让双语表头换行，避免挤占词缀列。
  // 结果卡片：只对本层写过对照名称的标题省略；按钮区换行，不缩小按钮与文字。
  // 名称区仍按原站先压窄两侧（各留 5px 内边距），装不下时才省略：上限进入 flex 自动最小宽度。
  style.textContent = `
    .modInfluenceGroup > .header > :is(.tiers, .weight-col) { white-space: pre; }
    .itemSearchResults > .item .header > .center:has(> .label[${fitAttribute}]) { max-width: calc(100% - 20px); }
    .itemSearchResults > .item .header .label[${fitAttribute}] { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .itemSearchResults > .item .editButtonZone { flex-wrap: wrap; }
  `
  if (bilingual) doc.head.append(style)
  const state = new WeakMap<Text, { original: string; written: string; context: string }>()
  const owned = new Set<Text>()
  const cache = new Map<string, string | null>()
  // 本层标记过的卡片标题 → 写入的文字节点与 title（原站自带 title 时为 null，不覆盖）
  const fitted = new Map<Element, { node: Text; title: string | null }>()
  function release(label: Element) {
    const entry = fitted.get(label)
    if (!entry) return
    if (entry.title !== null && label.getAttribute('title') === entry.title)
      label.removeAttribute('title')
    label.removeAttribute(fitAttribute)
    fitted.delete(label)
  }
  function fit(node: Text) {
    const label = node.parentElement
    if (!bilingual || !label?.matches(fitLabel)) return
    const previous = fitted.get(label)
    const current = label.getAttribute('title')
    const ours = previous?.title ?? null
    const title =
      current === null || (ours !== null && current === ours)
        ? (label.textContent ?? '').trim()
        : null
    if (title !== null && current !== title) label.setAttribute('title', title)
    label.setAttribute(fitAttribute, '')
    fitted.set(label, { node, title })
  }
  function selectedOriginal(node: Text): string | null {
    // 原站把选项标签复制到 .current；只借用同一下拉框已选节点的已知原文，
    // 不对任意中文反向猜译，也不修改选项的 value/search。
    const current = node.parentElement?.closest('.dropdown .current')
    const selected = current?.closest('.dropdown')?.querySelector('li.selected')
    if (!selected) return null
    const originals = new Set<string>()
    const walker = doc.createTreeWalker(selected, NodeFilter.SHOW_TEXT)
    let source = walker.nextNode()
    while (source) {
      const entry = state.get(source as Text)
      if (entry?.written === node.data) originals.add(entry.original)
      source = walker.nextNode()
    }
    return originals.size === 1 ? (originals.values().next().value ?? null) : null
  }
  function render(node: Text) {
    if (!node.isConnected || !translatable(node) || !node.data.trim()) return
    const entry = state.get(node)
    const context = textContext(node)
    if (entry?.written === node.data && entry.context === context) return
    const original =
      entry?.written === node.data ? entry.original : (selectedOriginal(node) ?? node.data)
    const cacheKey = `${context}\0${original}`
    let translated = cache.get(cacheKey)
    if (translated === undefined) {
      translated = contextualText(original, context, lexicon) ?? lexicon.translate(original)
      if (cache.size >= 2000) cache.clear()
      cache.set(cacheKey, translated)
    }
    if (translated === null || translated === original) {
      if (node.data !== original) node.data = original
      state.delete(node)
      owned.delete(node)
      if (node.parentElement && fitted.get(node.parentElement)?.node === node)
        release(node.parentElement)
      return
    }
    const separator = context === 'modifier-table-header' ? '\n' : ' · '
    const written = bilingual
      ? original.replace(
          /\S[\s\S]*\S|\S/,
          () => `${translated.trim()}${separator}${original.trim()}`,
        )
      : translated
    state.set(node, { original, written, context })
    owned.add(node)
    node.data = written
    fit(node)
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
      if (node.isConnected && translatable(node)) {
        if (state.get(node)?.context !== textContext(node)) render(node)
        continue
      }
      const entry = state.get(node)
      if (entry && node.data === entry.written) node.data = entry.original
      state.delete(node)
      owned.delete(node)
    }
    for (const [label, entry] of fitted)
      if (!owned.has(entry.node) || entry.node.parentElement !== label) release(label)
  })
  const onRoute = () => scan(doc.body)
  doc.defaultView?.addEventListener('popstate', onRoute)
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
  const stop = Object.assign(
    () => {
      if (closed) return
      closed = true
      observer.disconnect()
      doc.defaultView?.removeEventListener('popstate', onRoute)
      for (const node of owned) {
        const entry = state.get(node)
        if (entry && node.data === entry.written) node.data = entry.original
      }
      owned.clear()
      for (const label of [...fitted.keys()]) release(label)
      cache.clear()
      style.remove()
      active.delete(doc)
    },
    // 断开的节点在下一次变更回调末尾剔除（上方 MutationObserver 回调），计数随之减少
    { count: () => owned.size },
  )
  active.set(doc, stop)
  return stop
}
