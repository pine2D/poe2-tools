import type { Issue, TranslatedTerm } from '@poe2-tools/guide-core'
import { TERM_STYLE, translatedText } from '../guide/translated-text'
import type { BlockSource } from './source'

export interface PageTranslation {
  id: string
  revision?: string
  text: string
  origin: 'engine' | 'cache' | 'dictionary'
  issues: readonly Issue[]
  terms?: readonly TranslatedTerm[]
}
export interface PageNotice {
  id: string
  revision?: string
  message: string
}
export interface PageResult {
  state: 'inline' | 'located' | 'sidebar' | 'stale'
  message: string
}
export const OWNED = 'data-poe2-guide-owned'
const UNSAFE =
  'table,pre,code,label,button,form,select,textarea,[contenteditable]:not([contenteditable="false"]),[role="button"]'

/** 只在已有节点边界插入，不 splitText，不重建原站子树或事件。 */
function insertionPoint(source: BlockSource): { parent: Element; after: Node } | null {
  let { container } = source
  if (container.closest(UNSAFE) || source.endOffset !== source.end.length) return null
  const blockLike = (el: Element) =>
    el.matches('p,div,section,article,li,h1,h2,h3,h4,h5,h6,blockquote,main,dt,dd,figcaption') ||
    el.ownerDocument.defaultView?.getComputedStyle(el).display === 'block'
  // 独立 span 标题可以提升到完整容器；不能把选中的半句冒充整个段落。
  while (!blockLike(container)) {
    const parent = container.parentElement
    if (!parent || parent.closest(UNSAFE) || parent.textContent?.trim() !== source.quote.trim())
      return null
    container = parent
  }
  const css = container.ownerDocument.defaultView?.getComputedStyle(container)
  if (
    css?.display.includes('grid') ||
    (css?.display.includes('flex') && !css.flexDirection.startsWith('column'))
  )
    return null
  let after: Node = source.end
  while (after.parentNode !== container) {
    if (!after.parentNode || after.parentNode === container.ownerDocument) return null
    // 选区结束在行内包装的中部时不能跨过仍有原文的尾部。
    for (let tail = after.nextSibling; tail; tail = tail.nextSibling)
      if (tail.textContent?.trim() && !(tail instanceof Element && tail.hasAttribute(OWNED)))
        return null
    after = after.parentNode
  }
  // 连续句子内部不人为断行；整页分段时，下一段是块元素或换行。
  for (let tail = after.nextSibling; tail; tail = tail.nextSibling) {
    if (tail instanceof Element && tail.hasAttribute(OWNED)) continue
    if (tail instanceof Element && (blockLike(tail) || tail.tagName === 'BR')) break
    if (tail.textContent?.trim()) return null
  }
  return { parent: container, after }
}

export function appendTranslation(
  source: BlockSource,
  result: PageTranslation | PageNotice,
): HTMLElement | null {
  const point = insertionPoint(source)
  if (!point) return null
  const doc = source.container.ownerDocument
  const host = doc.createElement('span')
  const notice = 'message' in result
  host.setAttribute(OWNED, notice ? 'notice' : 'translation')
  host.dataset.blockId = result.id
  const shadow = host.attachShadow({ mode: 'open' })
  const style = doc.createElement('style')
  style.textContent =
    ':host{display:block!important;margin:.45em 0 .8em!important;font:inherit!important;color:inherit!important;text-align:start!important;white-space:normal!important}:host([hidden]){display:none!important}.translation{display:block;padding:.35em .6em;border-inline-start:1px solid currentColor;background:color-mix(in srgb,currentColor 5%,transparent);overflow-wrap:anywhere;line-height:1.65;font-weight:400}.text{white-space:pre-wrap}small{display:block;font-size:.85em;margin-top:.25em}.notice{font-size:.9em;background:none}'
  style.textContent += TERM_STYLE
  const box = doc.createElement('span')
  box.className = notice ? 'translation notice' : 'translation'
  box.lang = 'zh-CN'
  if (notice) {
    box.setAttribute('role', 'status')
    box.textContent = result.message
  } else {
    const origin = `${result.origin === 'dictionary' ? '词典译文' : '机器译文'}${result.issues.length ? ' · 待核对' : ''}`
    box.setAttribute('aria-label', origin)
    box.title = origin
    const text = doc.createElement('span')
    text.className = 'text'
    text.append(translatedText(doc, result.text, result.terms, !point.parent.closest('a')))
    box.append(text)
    if (result.issues.length) {
      const note = doc.createElement('small')
      note.textContent = '待核对 · 在侧栏查看提示'
      box.append(note)
    }
  }
  shadow.append(style, box)
  point.parent.insertBefore(host, point.after.nextSibling)
  return host
}

/** 独立覆盖层，不修改原节点样式或用户选区。 */
export function outline(doc: Document, target: Element, message?: string): HTMLElement {
  const rect = target.getBoundingClientRect()
  const overlay = doc.createElement('div')
  overlay.setAttribute(OWNED, 'outline')
  overlay.style.cssText = `position:fixed;pointer-events:none;z-index:2147483647;box-sizing:border-box;border:2px solid #b99b5c;background:rgba(185,155,92,.12);left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;`
  if (message) {
    const shadow = overlay.attachShadow({ mode: 'open' })
    const label = doc.createElement('div')
    label.textContent = message
    label.style.cssText =
      'position:fixed;top:12px;left:12px;padding:10px;background:#151513;color:#fff;font:14px system-ui;'
    label.setAttribute('role', 'status')
    shadow.append(label)
  }
  doc.documentElement.append(overlay)
  return overlay
}
