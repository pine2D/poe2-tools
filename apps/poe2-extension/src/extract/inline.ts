import type { Issue } from '@poe2-tools/guide-core'
import type { BlockSource } from './source'

export interface PageTranslation {
  id: string
  revision?: string
  text: string
  origin: 'engine' | 'cache' | 'dictionary'
  issues: readonly Issue[]
}
export interface PageResult {
  state: 'inline' | 'located' | 'sidebar' | 'stale'
  message: string
}
export const OWNED = 'data-poe2-guide-owned'
const UNSAFE =
  'table,pre,code,a,label,button,form,select,textarea,[contenteditable]:not([contenteditable="false"]),[role="button"]'

export function appendTranslation(
  source: BlockSource,
  result: PageTranslation,
): HTMLElement | null {
  const { container } = source
  // 不能把译文插进交互控件、表格、代码或原句的行内片段。
  if (
    container.closest(UNSAFE) ||
    container.querySelector('input,button,textarea,select') ||
    !container.matches('p,div,section,article,li,h1,h2,h3,h4,h5,h6,summary,blockquote,main')
  )
    return null
  if (container.querySelector('p,li,table,pre,h1,h2,h3,h4,h5,h6')) return null
  const doc = container.ownerDocument
  const host = doc.createElement('div')
  host.setAttribute(OWNED, 'translation')
  host.dataset.blockId = result.id
  const shadow = host.attachShadow({ mode: 'open' })
  const style = doc.createElement('style')
  style.textContent =
    ':host{display:block!important;margin:6px 0 12px!important;clear:both;font:normal 15px/1.6 system-ui,sans-serif!important;text-align:start!important;white-space:normal!important}:host([hidden]){display:none!important}.translation{padding:8px 12px;border-left:3px solid #b99b5c;background:#151513;color:#f0ede5;border-radius:3px;overflow-wrap:anywhere}.text{white-space:pre-wrap}small{display:block;color:#b9b3a5;font-size:12px}'
  const box = doc.createElement('div')
  box.className = 'translation'
  box.lang = 'zh-CN'
  const text = doc.createElement('div')
  text.className = 'text'
  text.textContent = result.text
  const note = doc.createElement('small')
  note.textContent = `${result.origin === 'dictionary' ? '词典译文' : '机器译文'}${result.issues.length ? ' · 待核对' : ''}`
  box.append(text, note)
  shadow.append(style, box)
  if (container.matches('li')) container.append(host)
  else container.after(host)
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
