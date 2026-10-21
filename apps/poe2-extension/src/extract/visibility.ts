// 正文页眉不等于站点导航；仅排除明确的站点区域与控件。
export const BASE_SKIP =
  'script,style,noscript,template,nav,footer,aside,form,button,input,textarea,select,svg,iframe,canvas,[hidden],[aria-hidden="true"],[role="navigation"],[role="banner"],[role="complementary"],[data-poe2-guide-owned]'

export function excluded(el: Element, skip = BASE_SKIP): boolean {
  if (el.matches(skip)) return true
  const closed = el.closest('details:not([open])')
  if (closed && el !== closed && !el.closest('summary')) return true
  const inline = (el as HTMLElement).style
  const style = el.ownerDocument.defaultView?.getComputedStyle(el)
  return (
    inline?.display === 'none' ||
    inline?.visibility === 'hidden' ||
    style?.display === 'none' ||
    style?.visibility === 'hidden' ||
    style?.contentVisibility === 'hidden'
  )
}

export function headingLevel(el: Element): number | undefined {
  if (/^H[1-6]$/.test(el.tagName)) return Number(el.tagName.slice(1))
  if (el.getAttribute('role') === 'heading') {
    const level = Number(el.getAttribute('aria-level'))
    return level >= 1 && level <= 6 ? level : 2
  }
  // 常见的卡片/任务章节标题；仅限短文本且没有正文块后代。
  if (
    /\b(?:section|chapter|zone)[-_](?:title|heading|header)\b/i.test(el.className) &&
    (el.textContent?.length ?? 0) <= 200 &&
    !el.querySelector('p,li,table,h1,h2,h3,h4,h5,h6')
  )
    return 2
  return undefined
}

export function readableSize(root: Element): number {
  const walk = (node: Node): number => {
    if (node.nodeType === 3) return (node.nodeValue ?? '').trim().length
    if (node.nodeType !== 1 || excluded(node as Element)) return 0
    return Array.from(node.childNodes).reduce((sum, n) => sum + walk(n), 0)
  }
  return walk(root)
}
