// 新版介绍页徽标由空 span 的 ::after 生成，不能用文本节点翻译。
const labels = [
  ['emulator', 'Emulator', '制作演练'],
  ['calculator', 'Calculator', '计算器'],
  ['simulator', 'Simulator', '流程模拟'],
  ['legacy', 'Legacy', '历史版本'],
] as const
export function attachPageLabels(doc: Document, bilingual = false): () => void {
  const style = doc.createElement('style')
  style.dataset.poe2L10n = 'page-labels'
  style.textContent = labels
    .map(
      ([name, en, zh]) =>
        `main .layout article li > span.${name}:empty::after { content: "${zh}${bilingual ? ` · ${en}` : ''}"; }`,
    )
    .join('\n')
  const sync = () => {
    if (doc.location.pathname === '/whats-new') {
      if (!style.isConnected) doc.head.append(style)
    } else style.remove()
  }
  const observer = new MutationObserver(sync)
  observer.observe(doc.body, { childList: true, subtree: true })
  doc.defaultView?.addEventListener('popstate', sync)
  sync()
  return () => {
    observer.disconnect()
    doc.defaultView?.removeEventListener('popstate', sync)
    style.remove()
  }
}
