import type { GuideBlock } from '@poe2-tools/guide-core'
import { el } from '../guide/dom'
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
:host { all: initial; position: fixed; z-index: 2147483647; display: block; max-width: calc(100vw - 24px); color-scheme: light; --paper: #fffdf7; --ink: #29251e; --muted: #625747; --accent: #73501e; }
:host([data-dark]) { color-scheme: dark; --paper: #211e18; --ink: #f0e8d9; --muted: #c2b49b; --accent: #e5bb70; }
* { box-sizing: border-box; }
.panel { width: max-content; max-width: min(400px, calc(100vw - 24px)); max-height: calc(100vh - 24px); overflow: auto; background: var(--paper); color: var(--ink); border-radius: 12px; box-shadow: 0 6px 28px #0003; padding: 12px; font: 15px/1.65 system-ui, sans-serif; overflow-wrap: anywhere; scrollbar-color: var(--muted) var(--paper); }
.panel.expanded { width: 400px; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
button { appearance: none; border: 1px solid color-mix(in srgb, var(--ink) 25%, transparent); border-radius: 5px; color: var(--ink); background: transparent; padding: 5px 10px; font: 600 14px/1.5 system-ui, sans-serif; cursor: pointer; min-height: 36px; }
button[data-action=translate] { background: var(--accent); color: var(--paper); border-color: transparent; }
button:hover { filter: brightness(1.12); }
button:disabled { opacity: .6; cursor: default; }
button:focus-visible, summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
p { margin: 10px 0; white-space: pre-wrap; }
.source, .meta { color: var(--muted); font-size: 13px; }
.source { max-height: 90px; overflow: auto; }
.output { margin-block: 14px; }
summary { cursor: pointer; }
::selection { background: var(--accent); color: var(--paper); }
[hidden] { display: none !important; }
`

export function installSelection(doc: Document, win: Window, translate: SelectionTranslator) {
  let host: HTMLElement | null = null,
    abort: AbortController | null = null
  let restoreFocus: HTMLElement | null = null
  let epoch = 0
  let timer: ReturnType<typeof setInterval> | undefined,
    toastTimer: ReturnType<typeof setTimeout> | undefined
  const dismiss = () => {
    epoch++
    abort?.abort()
    abort = null
    clearInterval(timer)
    clearTimeout(toastTimer)
    if (doc.activeElement === host && restoreFocus?.isConnected)
      restoreFocus.focus({ preventScroll: true })
    host?.remove()
    host = null
  }
  const button = (text: string, action: string, fn: () => void) => {
    const b = el(doc, 'button', { type: 'button', 'data-action': action }, text)
    b.addEventListener('pointerdown', (e) => e.preventDefault())
    b.addEventListener('click', (e) => {
      if (e.isTrusted) fn()
    })
    return b
  }
  const shell = (range?: Range) => {
    dismiss()
    restoreFocus = doc.activeElement instanceof HTMLElement ? doc.activeElement : null
    host = el(doc, 'div', { 'data-poe2-guide-owned': '', 'data-poe2-selection': '' })
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
    shadow.append(el(doc, 'style', {}, STYLE), panel)
    doc.documentElement.append(host)
    const rect = range?.getBoundingClientRect()
    const position = () => {
      if (!host) return
      const height = host.getBoundingClientRect().height,
        width = host.getBoundingClientRect().width
      host.style.left = `${Math.max(12, Math.min(rect?.left ?? win.innerWidth - width - 20, win.innerWidth - width - 12))}px`
      const below = (rect?.bottom ?? 12) + 8
      host.style.top = `${Math.max(12, Math.min(below + height > win.innerHeight ? (rect?.top ?? below) - height - 8 : below, win.innerHeight - height - 12))}px`
    }
    return { panel, position }
  }

  const show = (range: Range, block: GuideBlock) => {
    const quote = range.toString(),
      href = win.location.href
    const { panel, position } = shell(range)
    const version = epoch
    const valid = () =>
      range.startContainer.isConnected &&
      range.endContainer.isConnected &&
      range.toString() === quote &&
      win.location.href === href
    const live = () => epoch === version && !!host
    const status = el(doc, 'p', { class: 'meta', role: 'status', hidden: true })
    const output = el(doc, 'p', { class: 'output', hidden: true })
    const source = el(
      doc,
      'details',
      { hidden: true },
      el(doc, 'summary', {}, `原文 · ${block.text.length} 字符`),
      el(doc, 'p', { class: 'source' }, block.text),
    )
    const issues = el(doc, 'p', { class: 'meta', hidden: true })
    const copy = button('复制译文', 'copy', () => {
      void Promise.resolve()
        .then(() => win.navigator.clipboard.writeText(output.textContent ?? ''))
        .then(
          () => {
            if (live()) status.textContent = '已复制译文。'
          },
          () => {
            if (live()) status.textContent = '复制失败，请选中译文手动复制。'
          },
        )
    })
    copy.hidden = true
    const close = button('关闭', 'close', dismiss)
    const cancel = button('取消', 'cancel', () => {
      abort?.abort()
      abort = null
      clearInterval(timer)
      status.textContent = '已取消翻译。'
      start.disabled = false
      start.textContent = '重新翻译'
      if (doc.activeElement === host) start.focus({ preventScroll: true })
      cancel.hidden = true
    })
    cancel.hidden = true
    const start = button('翻译选中文字', 'translate', () => {
      if (!valid()) {
        dismiss()
        return
      }
      const current = captureSelection(doc, win.location, range)
      if (!current || JSON.stringify(current) !== JSON.stringify(block)) {
        dismiss()
        return
      }
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
      timer = setInterval(() => {
        if (!valid()) dismiss()
      }, 400)
      void translate(block, request.signal)
        .then(
          (result) => {
            if (!live() || request.signal.aborted) return
            if (!valid()) {
              dismiss()
              return
            }
            if (result.ok) {
              output.textContent = result.text
              output.hidden = false
              copy.hidden = false
              status.textContent = [ORIGIN[result.origin], result.message, result.usage]
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
          clearInterval(timer)
          abort = null
          start.disabled = false
          if (
            doc.activeElement === host &&
            panel.getRootNode() instanceof ShadowRoot &&
            (panel.getRootNode() as ShadowRoot).activeElement === cancel
          )
            (start.hidden ? copy : start).focus({ preventScroll: true })
          cancel.hidden = true
          position()
        })
    })
    panel.append(
      el(doc, 'div', { class: 'actions' }, start, cancel, copy, close),
      source,
      status,
      output,
      issues,
    )
    position()
  }
  const select = (event: Event) => {
    if (!event.isTrusted || (host && event.composedPath().includes(host))) return
    // 普通键入不干预网页；仅响应键盘扩选或鼠标选择结束。
    if (event instanceof KeyboardEvent && !(event.shiftKey || event.key === 'Shift')) return
    const selection = win.getSelection()
    if (!selection?.rangeCount || selection.isCollapsed) {
      dismiss()
      return
    }
    const range = selection.getRangeAt(0).cloneRange()
    if (range.toString().length > MAX_SELECTION_CHARS) {
      const { panel, position } = shell(range)
      panel.append(
        el(doc, 'p', { role: 'status' }, `选区超过 ${MAX_SELECTION_CHARS} 字符，请缩小后再试。`),
        button('关闭', 'close', dismiss),
      )
      position()
      return
    }
    const block = captureSelection(doc, win.location, range)
    if (block) {
      show(range, block)
      if (event instanceof KeyboardEvent && event.key === 'Shift')
        host?.shadowRoot
          ?.querySelector<HTMLButtonElement>('[data-action=translate]')
          ?.focus({ preventScroll: true })
    } else dismiss()
  }
  const key = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && host) {
      event.preventDefault()
      dismiss()
    }
  }
  doc.addEventListener('pointerup', select)
  doc.addEventListener('keyup', select)
  doc.addEventListener('keydown', key, true)
  const onPageHide = () => destroy()
  win.addEventListener('pagehide', onPageHide)
  win.addEventListener('popstate', dismiss)
  win.addEventListener('hashchange', dismiss)
  win.addEventListener('resize', dismiss)
  // 激活反馈本身不读取选区、不请求翻译。
  const { panel, position } = shell()
  panel.append(el(doc, 'p', { role: 'status' }, '本页划词已启用。选中文字后，点击“翻译选中文字”。'))
  position()
  toastTimer = setTimeout(dismiss, 4500)
  function destroy() {
    dismiss()
    doc.removeEventListener('pointerup', select)
    doc.removeEventListener('keyup', select)
    doc.removeEventListener('keydown', key, true)
    win.removeEventListener('pagehide', onPageHide)
    win.removeEventListener('popstate', dismiss)
    win.removeEventListener('hashchange', dismiss)
    win.removeEventListener('resize', dismiss)
  }
  return { destroy }
}
