import type { TranslatedTerm } from '@poe2-tools/guide-core'

// 与原文标注同样克制；鼠标 title，键盘展开英文。伪元素不进入复制文本。
export const TERM_STYLE = `
.poe2-term { text-decoration: underline dotted; text-decoration-color: color-mix(in srgb,currentColor 50%,transparent); text-underline-offset: .2em; cursor: help; }
.poe2-term:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; border-radius: 2px; }
.poe2-term:focus-visible::after { content: "（" attr(data-en) "）"; font-size: .9em; font-weight: 400; }
`
/** 消息边界再次校验偏移，始终构造文本节点，不能引入 HTML 或改写译文。 */
export function translatedText(
  doc: Document,
  text: string,
  terms: readonly TranslatedTerm[] = [],
  focusable = true,
): DocumentFragment {
  const fragment = doc.createDocumentFragment()
  let cursor = 0
  if (Array.isArray(terms))
    for (const t of terms.slice(0, 32)) {
      if (
        !t ||
        !Number.isInteger(t.start) ||
        !Number.isInteger(t.end) ||
        t.start < cursor ||
        t.end <= t.start ||
        t.end > text.length ||
        typeof t.zh !== 'string' ||
        typeof t.en !== 'string' ||
        !t.en ||
        t.en.length > 300 ||
        text.slice(t.start, t.end) !== t.zh
      )
        continue
      fragment.append(doc.createTextNode(text.slice(cursor, t.start)))
      const span = doc.createElement('span')
      span.className = 'poe2-term'
      span.textContent = t.zh
      span.title = `${t.zh} · ${t.en}`
      span.dataset.en = t.en
      if (focusable) {
        span.tabIndex = 0
        span.setAttribute('aria-label', span.title)
      }
      fragment.append(span)
      cursor = t.end
    }
  fragment.append(doc.createTextNode(text.slice(cursor)))
  return fragment
}
