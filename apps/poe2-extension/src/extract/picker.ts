import { OWNED, outline } from './inline'
import { excluded } from './visibility'

export function startPicker(doc: Document): { result: Promise<Element | null>; cancel(): void } {
  let finish: (element: Element | null) => void = () => {}
  const result = new Promise<Element | null>((resolve) => {
    finish = resolve
  })
  let overlay: HTMLElement | null = null
  let ended = false
  const targetOf = (event: Event) => {
    const target = event.target as Element | null
    if (!target?.closest || target.closest(`[${OWNED}]`)) return null
    const region =
      target.closest('section,article,[role="region"],main') ?? target.closest('p,li,div')
    if (!region || region === doc.body || excluded(region)) return null
    for (let parent: Element | null = target; parent; parent = parent.parentElement)
      if (excluded(parent) && !parent.matches('input,button')) return null
    return region
  }
  const cleanup = (element: Element | null) => {
    if (ended) return
    ended = true
    clearTimeout(timer)
    overlay?.remove()
    doc.removeEventListener('pointermove', move, true)
    doc.removeEventListener('click', click, true)
    doc.removeEventListener('keydown', key, true)
    doc.removeEventListener('pointerdown', block, true)
    finish(element)
  }
  const move = (event: Event) => {
    const target = targetOf(event)
    overlay?.remove()
    if (target) overlay = outline(doc, target, '点击选择高亮区域 · Esc 取消 · 30 秒后自动取消')
  }
  const block = (event: Event) => {
    event.preventDefault()
    event.stopImmediatePropagation()
  }
  const click = (event: Event) => {
    block(event)
    const target = targetOf(event)
    if (target) cleanup(target)
  }
  const key = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      block(event)
      cleanup(null)
    }
  }
  const timer = setTimeout(() => cleanup(null), 30000)
  doc.addEventListener('pointermove', move, true)
  doc.addEventListener('pointerdown', block, true)
  doc.addEventListener('click', click, true)
  doc.addEventListener('keydown', key, true)
  overlay = outline(doc, doc.body, '点击选择正文区域 · Esc 取消 · 30 秒后自动取消')
  return { result, cancel: () => cleanup(null) }
}
