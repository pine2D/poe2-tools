import type { GuideBlock } from '@poe2-tools/guide-core'
import { el } from '../guide/dom'
import { TERM_STYLE, translatedText } from '../guide/translated-text'
import { disclosure, icon, labelIcon } from '../ui/icons'
import { captureSelection } from './capture'
import { MAX_SELECTION_CHARS, type SelectionResult } from './protocol'

export type SelectionTranslator = (
  block: GuideBlock,
  signal: AbortSignal,
) => Promise<SelectionResult>
const ORIGIN = {
  engine: '机器译文',
  cache: '机器译文 · 缓存',
  dictionary: '词典译文',
  preserved: '原样保留',
}
// 气泡与网页各自用色；沿用页面浅/深基调，不向原站写入全局样式或字体。
const STYLE = `
:host { all: initial; position: fixed; z-index: 2147483647; display: block; max-width: calc(100vw - 24px); color-scheme: light; --paper: #fffdf7; --ink: #29251e; --muted: #625747; --accent: #73501e; --hover: #eee8db; }
:host([data-dark]) { color-scheme: dark; --paper: #211e18; --ink: #f0e8d9; --muted: #c2b49b; --accent: #e5bb70; --hover: #353026; }
* { box-sizing: border-box; }
.panel { width: max-content; max-width: min(420px, calc(100vw - 24px)); max-height: calc(100vh - 24px); overflow: auto; overflow-anchor: none; background: var(--paper); color: var(--ink); border-radius: 12px; box-shadow: 0 8px 32px #0003; padding: 8px 16px 12px; font: 15px/1.75 system-ui, sans-serif; overflow-wrap: anywhere; scrollbar-color: var(--muted) var(--paper); scrollbar-width: thin; }
.panel.expanded { width: 420px; }
.bubble-head { display: flex; gap: 2px; align-items: center; position: sticky; top: -8px; margin: 0 -8px 8px; padding-block: 4px; background: var(--paper); z-index: 1; }
button[data-action=move] { flex: 1; display: flex; align-items: center; justify-content: flex-start; gap: 8px; min-width: 0; padding-inline: 8px; color: var(--muted); font-size: 13px; font-weight: 500; cursor: grab; touch-action: none; }
button[data-action=move]:active { cursor: grabbing; }
button { appearance: none; display: inline-flex; align-items: center; justify-content: center; border: 0; border-radius: 6px; color: var(--ink); background: transparent; padding: 8px 12px; font: 500 14px/1.5 system-ui, sans-serif; cursor: pointer; min-height: 44px; }
button.icon-button { width: 44px; height: 44px; flex: 0 0 44px; padding: 0; color: var(--muted); }
.ui-icon { flex-shrink: 0; }
button[aria-pressed=true] { color: var(--accent); background: var(--hover); }
button[data-action=translate] { background: var(--accent); color: var(--paper); }
button:hover { background: var(--hover); }
button[data-action=translate]:hover { filter: brightness(1.12); }
button:disabled { opacity: .6; cursor: default; }
button:focus-visible, summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.actions { display: flex; gap: 8px; align-items: center; }
.actions:has(button:not([hidden])) { margin-block: 8px; }
p { margin: 0; white-space: pre-wrap; }
.output { margin-block: 8px 12px; font-size: 16px; line-height: 1.85; }
.source, .meta { color: var(--muted); font-size: 13px; line-height: 1.7; }
.source { padding-block: 4px 12px; }
.meta { margin-block: 8px; }
summary { min-height: 44px; display: flex; justify-content: space-between; align-items: center; gap: 8px; cursor: pointer; list-style: none; color: var(--muted); font-size: 13px; border-top: 1px solid color-mix(in srgb, var(--ink) 16%, transparent); }
summary::-webkit-details-marker { display: none; }
details[open] > summary .ui-icon { transform: rotate(180deg); }
.panel:not(.expanded) { position: relative; padding: 4px 52px 4px 8px; }
.panel:not(.expanded) .bubble-head { position: absolute; right: 8px; top: 8px; margin: 0; padding: 0; }
.panel:not(.expanded) button:is([data-action=move],[data-action=pin]) { display: none; }
::selection { background: var(--accent); color: var(--paper); }
[hidden] { display: none !important; }
@media (forced-colors: active) { .panel { border: 1px solid CanvasText; } button[aria-pressed=true] { outline: 2px solid Highlight; } }
`

export const MAX_BUBBLES = 6
interface Bubble {
  host: HTMLElement
  panel: HTMLElement
  range?: Range
  persistent: boolean
  pinned: boolean
  position(): void
  close(): void
  notify(message: string): void
  cleanup(): void
}

export function installSelection(doc: Document, win: Window, translate: SelectionTranslator) {
  const cards = new Set<Bubble>()
  let active: Bubble | undefined
  const raise = (card: Bubble) => {
    cards.delete(card)
    cards.add(card)
    active = card
    const ordered = [...cards].sort((a, b) => Number(a.pinned) - Number(b.pinned))
    ordered.forEach((c, i) => {
      c.host.style.zIndex = String(2147483647 - MAX_BUBBLES + i)
    })
  }
  const dismiss = () => {
    for (const c of [...cards]) c.close()
  }
  const transient = () => {
    for (const c of [...cards]) if (!c.persistent) c.close()
  }
  const button = (text: string, action: string, fn: () => void) => {
    const b = el(doc, 'button', { type: 'button', 'data-action': action }, text)
    b.addEventListener('pointerdown', (e) => e.preventDefault())
    b.addEventListener('click', (e) => {
      if (e.isTrusted) fn()
    })
    return b
  }
  const shell = (range?: Range): Bubble => {
    const restoreFocus = doc.activeElement instanceof HTMLElement ? doc.activeElement : null
    const host = el(doc, 'div', { 'data-poe2-guide-owned': '', 'data-poe2-selection': '' })
    const anchor = range?.commonAncestorContainer
    const ancestor = anchor?.nodeType === 1 ? (anchor as Element) : anchor?.parentElement
    let dark = win.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
    for (let p: Element | null = ancestor ?? doc.body; p; p = p.parentElement) {
      const rgb = win
        .getComputedStyle(p)
        .backgroundColor.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/)
      if (rgb && (rgb[4] === undefined || Number(rgb[4]) > 0.8)) {
        dark = Number(rgb[1]) * 0.2126 + Number(rgb[2]) * 0.7152 + Number(rgb[3]) * 0.0722 < 125
        break
      }
    }
    if (dark) host.setAttribute('data-dark', '')
    const shadow = host.attachShadow({ mode: 'open' })
    const panel = el(doc, 'section', { class: 'panel', 'aria-label': '选中文字翻译' })
    const notice = el(doc, 'p', { class: 'meta', role: 'status', hidden: true })
    shadow.append(el(doc, 'style', {}, STYLE + TERM_STYLE), panel)
    doc.documentElement.append(host)
    const rect = range?.getBoundingClientRect()
    let moved = false
    let positioned = false
    let expanded = false
    let validityTimer: ReturnType<typeof setInterval> | undefined
    const card: Bubble = {
      host,
      panel,
      ...(range ? { range } : {}),
      persistent: false,
      pinned: false,
      cleanup() {},
      notify(message) {
        notice.textContent = message
        notice.hidden = false
        card.position()
      },
      position() {
        const width = Math.min(win.innerWidth, doc.documentElement.clientWidth || win.innerWidth)
        host.style.maxWidth = `${Math.max(1, width - 24)}px`
        panel.style.maxWidth = `${Math.max(1, width - 24)}px`
        const size = host.getBoundingClientRect()
        const below = (rect?.bottom ?? 12) + 8
        const wasExpanded = expanded
        expanded = panel.classList.contains('expanded')
        const x = positioned
          ? parseFloat(host.style.left)
          : (rect?.left ?? win.innerWidth - size.width - 20)
        let y = positioned
          ? parseFloat(host.style.top)
          : below + size.height > win.innerHeight
            ? (rect?.top ?? below) - size.height - 8
            : below
        // 首次展开为译文留足空间；之后原文/详情只在面板内生长，标题位置保持。
        if (expanded && !wasExpanded && !moved) y = Math.min(y, win.innerHeight - 300)
        y = Math.max(12, Math.min(y, win.innerHeight - (expanded ? 180 : 72)))
        host.style.left = `${Math.max(12, Math.min(x, width - size.width - 12))}px`
        host.style.top = `${y}px`
        panel.style.maxHeight = `${Math.max(60, win.innerHeight - y - 12)}px`
        positioned = true
      },
      close() {
        if (!cards.delete(card)) return
        clearInterval(validityTimer)
        card.cleanup()
        if (doc.activeElement === host && restoreFocus?.isConnected)
          restoreFocus.focus({ preventScroll: true })
        host.remove()
        if (active === card) active = [...cards].at(-1)
      },
    }
    if (range) {
      const quote = range.toString(),
        href = win.location.href
      validityTimer = setInterval(() => {
        if (
          !range.startContainer.isConnected ||
          !range.endContainer.isConnected ||
          range.toString() !== quote ||
          win.location.href !== href
        )
          card.close()
      }, 400)
    }
    const move = (x: number, y: number) => {
      moved = true
      card.persistent = true
      host.style.left = `${x}px`
      host.style.top = `${y}px`
      card.position()
    }
    if (range) {
      const handle = el(
        doc,
        'button',
        {
          type: 'button',
          'data-action': 'move',
          title: '拖动译文；聚焦后也可按方向键移动',
          'aria-label': '移动译文，使用拖动或方向键',
        },
        icon(doc, 'move'),
        '划词译文',
      )
      let drag: { id: number; x: number; y: number; left: number; top: number } | undefined
      handle.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return
        e.preventDefault()
        handle.focus({ preventScroll: true })
        drag = {
          id: e.pointerId,
          x: e.clientX,
          y: e.clientY,
          left: parseFloat(host.style.left),
          top: parseFloat(host.style.top),
        }
        handle.setPointerCapture?.(e.pointerId)
      })
      handle.addEventListener('pointermove', (e) => {
        if (drag?.id === e.pointerId)
          move(drag.left + e.clientX - drag.x, drag.top + e.clientY - drag.y)
      })
      handle.addEventListener('pointerup', (e) => {
        if (drag?.id === e.pointerId) {
          drag = undefined
          handle.releasePointerCapture?.(e.pointerId)
        }
      })
      handle.addEventListener('lostpointercapture', () => {
        drag = undefined
      })
      handle.addEventListener('keydown', (e) => {
        const direction: Record<string, [number, number]> = {
          ArrowLeft: [-1, 0],
          ArrowRight: [1, 0],
          ArrowUp: [0, -1],
          ArrowDown: [0, 1],
        }
        const d = direction[e.key]
        if (!d) return
        e.preventDefault()
        e.stopPropagation()
        const step = e.shiftKey ? 32 : 12
        move(parseFloat(host.style.left) + d[0] * step, parseFloat(host.style.top) + d[1] * step)
      })
      const pin = button('置顶', 'pin', () => {
        card.pinned = !card.pinned
        card.persistent = true
        pin.setAttribute('aria-pressed', String(card.pinned))
        labelIcon(pin, card.pinned ? 'unpin' : 'pin', card.pinned ? '取消置顶' : '置顶译文')
        host.toggleAttribute('data-pinned', card.pinned)
        raise(card)
      })
      labelIcon(pin, 'pin', '置顶译文')
      pin.setAttribute('aria-pressed', 'false')
      pin.title = '固定在当前网页内的其他译文气泡上方'
      const close = button('关闭', 'close', card.close)
      labelIcon(close, 'close', '关闭译文')
      panel.append(el(doc, 'div', { class: 'bubble-head' }, handle, pin, close))
    }
    panel.append(notice)
    cards.add(card)
    raise(card)
    host.addEventListener('pointerdown', () => raise(card), true)
    host.addEventListener('focusin', () => raise(card))
    return card
  }

  const show = (range: Range, block: GuideBlock) => {
    const quote = range.toString(),
      href = win.location.href
    const card = shell(range)
    const { host, panel, position } = card
    let abort: AbortController | null = null
    const valid = () =>
      range.startContainer.isConnected &&
      range.endContainer.isConnected &&
      range.toString() === quote &&
      win.location.href === href
    const live = () => cards.has(card)
    card.cleanup = () => {
      abort?.abort()
    }
    const status = el(doc, 'p', { class: 'meta', role: 'status', hidden: true })
    const output = el(doc, 'p', { class: 'output', hidden: true })
    const source = el(
      doc,
      'details',
      { hidden: true },
      disclosure(doc, `原文 · ${block.text.length} 字符`),
      el(doc, 'p', { class: 'source' }, block.text),
    )
    const issues = el(doc, 'p', { class: 'meta', hidden: true })
    const copy = button('复制译文', 'copy', () => {
      void Promise.resolve()
        .then(() => win.navigator.clipboard.writeText(output.textContent ?? ''))
        .then(
          () => {
            if (live()) {
              labelIcon(copy, 'check', '已复制译文')
              card.notify('已复制译文。')
            }
          },
          () => {
            if (live()) card.notify('复制失败，请选中译文手动复制。')
          },
        )
    })
    labelIcon(copy, 'copy', '复制译文')
    copy.hidden = true
    panel.querySelector('[data-action=pin]')?.before(copy)
    const usage = el(doc, 'p', { class: 'meta' })
    const usageDetails = el(doc, 'details', { hidden: true }, disclosure(doc, '翻译详情'), usage)
    const cancel = button('取消', 'cancel', () => {
      abort?.abort()
      abort = null
      status.textContent = '已取消翻译。'
      start.disabled = false
      start.textContent = '重新翻译'
      if (doc.activeElement === host) start.focus({ preventScroll: true })
      cancel.hidden = true
    })
    cancel.hidden = true
    const start = button('翻译选中文字', 'translate', () => {
      if (!valid()) {
        card.close()
        return
      }
      const current = captureSelection(doc, win.location, range)
      if (!current || JSON.stringify(current) !== JSON.stringify(block)) {
        card.close()
        return
      }
      card.persistent = true
      abort?.abort()
      const request = new AbortController()
      abort = request
      panel.classList.add('expanded')
      source.hidden = false
      status.hidden = false
      output.hidden = true
      issues.hidden = true
      copy.hidden = true
      status.textContent = '正在翻译…'
      start.disabled = true
      cancel.hidden = false
      start.textContent = '翻译中…'
      cancel.focus({ preventScroll: true })
      position()
      void translate(block, request.signal)
        .then(
          (result) => {
            if (!live() || request.signal.aborted) return
            if (!valid()) {
              card.close()
              return
            }
            if (result.ok) {
              output.replaceChildren(translatedText(doc, result.text, result.terms))
              output.hidden = false
              copy.hidden = false
              usage.textContent = result.usage
              usageDetails.hidden = !result.usage
              status.textContent = [ORIGIN[result.origin], result.message]
                .filter(Boolean)
                .join(' · ')
              issues.textContent = result.issues.length
                ? `有 ${result.issues.length} 条待核对提示，请结合原文确认专名和含义。`
                : ''
              issues.hidden = !result.issues.length
              start.hidden = true
            } else {
              status.textContent = result.message
              start.textContent = '重试翻译'
            }
          },
          () => {
            if (live() && !request.signal.aborted) {
              status.textContent = '翻译中断，请手动重试。'
              start.textContent = '重试翻译'
            }
          },
        )
        .finally(() => {
          if (!live() || abort !== request) return
          abort = null
          start.disabled = false
          if (doc.activeElement === host && host.shadowRoot?.activeElement === cancel)
            (start.hidden ? copy : start).focus({ preventScroll: true })
          cancel.hidden = true
          position()
        })
    })
    panel.append(
      el(doc, 'div', { class: 'actions' }, start, cancel),
      output,
      status,
      issues,
      source,
      usageDetails,
    )
    position()
    return card
  }
  const select = (event: Event) => {
    if (!event.isTrusted || [...cards].some((c) => event.composedPath().includes(c.host))) return
    if (event instanceof KeyboardEvent && !(event.shiftKey || event.key === 'Shift')) return
    const selection = win.getSelection()
    if (!selection?.rangeCount || selection.isCollapsed) {
      transient()
      return
    }
    const range = selection.getRangeAt(0).cloneRange()
    const same = [...cards].find(
      (c) =>
        c.range?.startContainer === range.startContainer &&
        c.range.startOffset === range.startOffset &&
        c.range.endContainer === range.endContainer &&
        c.range.endOffset === range.endOffset,
    )
    if (same) {
      raise(same)
      return
    }
    transient()
    if (cards.size >= MAX_BUBBLES) {
      active?.notify(`已打开 ${MAX_BUBBLES} 个气泡，请先关闭一个再翻译新选区。`)
      return
    }
    if (range.toString().length > MAX_SELECTION_CHARS) {
      const card = shell(range)
      card.notify(`选区超过 ${MAX_SELECTION_CHARS} 字符，请缩小后再试。`)
      return
    }
    const block = captureSelection(doc, win.location, range)
    if (block) {
      const card = show(range, block)
      if (event instanceof KeyboardEvent && event.key === 'Shift')
        card.host.shadowRoot
          ?.querySelector<HTMLButtonElement>('[data-action=translate]')
          ?.focus({ preventScroll: true })
    }
  }
  const key = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && active) {
      event.preventDefault()
      active.close()
    }
  }
  const resize = () => {
    for (const c of cards) c.position()
  }
  doc.addEventListener('pointerup', select)
  doc.addEventListener('keyup', select)
  doc.addEventListener('keydown', key, true)
  const onPageHide = () => destroy()
  win.addEventListener('pagehide', onPageHide)
  win.addEventListener('popstate', dismiss)
  win.addEventListener('hashchange', dismiss)
  win.addEventListener('resize', resize)
  const toast = shell()
  toast.notify('本页划词已启用。选中文字后，点击“翻译选中文字”；译文可置顶、拖动并同时保留。')
  const toastTimer = setTimeout(toast.close, 4500)
  toast.cleanup = () => clearTimeout(toastTimer)
  function destroy() {
    dismiss()
    doc.removeEventListener('pointerup', select)
    doc.removeEventListener('keyup', select)
    doc.removeEventListener('keydown', key, true)
    win.removeEventListener('pagehide', onPageHide)
    win.removeEventListener('popstate', dismiss)
    win.removeEventListener('hashchange', dismiss)
    win.removeEventListener('resize', resize)
  }
  return { destroy }
}
