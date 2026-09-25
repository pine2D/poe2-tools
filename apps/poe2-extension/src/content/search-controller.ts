import type { Lexicon } from '@poe2-tools/l10n-core'
import {
  isConditionSearch,
  searchCandidates,
  searchDomain,
  submitSearch,
} from '../adapters/coe-beta/search'

const chinese = /\p{Script=Han}/u
export function attachSearch(doc: Document, lexicon: Lexicon): () => void {
  const composing = new WeakSet<HTMLInputElement>()
  let panel: HTMLElement | null = null
  let exactButton: HTMLButtonElement | null = null
  let revision = 0
  let active: HTMLInputElement | null = null
  let closed = false
  let selected: HTMLButtonElement | null = null
  let restoreInput = () => {}
  let sequence = 0
  let selectOption = (_button: HTMLButtonElement) => {}
  function positionPanel() {
    if (!panel || !active || panel.style.position !== 'fixed') return
    const rect = active.getBoundingClientRect()
    const view = doc.defaultView
    if (!view) return
    // 有效布局下，输入框完全离开视口时撤下失去锚点的固定浮层。
    if (
      rect.width > 0 &&
      rect.height > 0 &&
      (rect.bottom <= 0 ||
        rect.top >= view.innerHeight ||
        rect.right <= 0 ||
        rect.left >= view.innerWidth)
    ) {
      clear()
      return
    }
    const width = Math.min(rect.width, view.innerWidth - 16)
    panel.style.width = `${Math.max(0, width)}px`
    panel.style.left = `${Math.max(8, Math.min(rect.left, view.innerWidth - width - 8))}px`
    const below = view.innerHeight - rect.bottom - 8
    const above = rect.top - 8
    const useAbove = below < Math.min(240, above)
    panel.style.top = useAbove ? 'auto' : `${rect.bottom}px`
    panel.style.bottom = useAbove ? `${view.innerHeight - rect.top}px` : 'auto'
    panel.style.maxHeight = `${Math.max(0, Math.min(240, useAbove ? above : below))}px`
  }
  function clear() {
    revision++
    restoreInput()
    restoreInput = () => {}
    selected = null
    selectOption = () => {}
    const previous = panel
    panel = null
    active = null
    exactButton = null
    previous?.remove()
  }
  function show(input: HTMLInputElement) {
    clear()
    const domain = searchDomain(input)
    if (!domain || !chinese.test(input.value) || composing.has(input)) return
    active = input
    const query = input.value
    const current = revision
    const candidates = searchCandidates(input, lexicon)
    const keepFocus = isConditionSearch(input)
    panel = doc.createElement('div')
    panel.dataset.poe2L10n = 'search'
    panel.setAttribute('aria-label', '中文搜索候选')
    // 原站输入容器会裁剪溢出；使用视口浮层，避免提示撑宽控件或失焦时移动清空按钮。
    const panelStyle =
      `${keepFocus ? 'position:relative;' : 'position:fixed;box-sizing:border-box;'}` +
      'z-index:20;background:#20252d;color:#fff;padding:8px;border:1px solid #8499ae;max-height:240px;overflow:auto;overflow-wrap:anywhere;font:14px/1.6 sans-serif'
    panel.style.cssText = panelStyle
    const label = doc.createElement('div')
    label.textContent = candidates.length
      ? `“${query}”：选择英文查询（方向键移动，Enter 选择，Escape 取消）`
      : `“${query}”：未找到术语，请缩短关键词或输入英文。`
    panel.append(label)
    const owned = new Map<string, { original: string | null; written: string }>()
    const setInput = (name: string, value: string) => {
      const previous = owned.get(name)
      owned.set(name, {
        original: previous ? previous.original : input.getAttribute(name),
        written: value,
      })
      input.setAttribute(name, value)
    }
    label.id = `poe2-l10n-search-help-${++sequence}`
    setInput(
      'aria-describedby',
      [input.getAttribute('aria-describedby'), label.id].filter(Boolean).join(' '),
    )
    restoreInput = () => {
      for (const [name, state] of owned) {
        const value = input.getAttribute(name)
        if (value !== state.written) {
          // 原站可能在列表属性中追加说明：只撤下本次提示ID，不覆盖新说明或复活旧说明。
          if (name === 'aria-describedby' && value?.split(/\s+/).includes(label.id)) {
            const remaining = value.split(/\s+/).filter((id) => id && id !== label.id)
            if (remaining.length) input.setAttribute(name, remaining.join(' '))
            else input.removeAttribute(name)
          }
          continue
        }
        if (state.original === null) input.removeAttribute(name)
        else input.setAttribute(name, state.original)
      }
    }
    if (keepFocus) {
      panel.id = `poe2-l10n-conditions-${++sequence}`
      panel.setAttribute('role', 'listbox')
      label.setAttribute('role', 'presentation')
      setInput('role', 'combobox')
      setInput('aria-expanded', 'true')
      setInput('aria-controls', panel.id)
      setInput('aria-autocomplete', 'list')
      selectOption = (button) => setInput('aria-activedescendant', button.id)
    }
    const exact = new Set(
      candidates.filter((candidate) => candidate.exact).map((candidate) => candidate.term.en),
    )
    const unique = new Map(candidates.map((c) => [c.term.en, c.term]))
    for (const term of unique.values()) {
      const button = doc.createElement('button')
      button.type = 'button'
      button.textContent = `${term.zh} → ${term.en}`
      button.style.cssText = 'display:block;text-align:left;margin:4px 0;white-space:normal'
      if (keepFocus) {
        button.id = `${panel.id}-option-${unique.size}-${panel.children.length}`
        button.tabIndex = -1
        button.setAttribute('role', 'option')
        button.setAttribute('aria-selected', 'false')
        button.addEventListener('mousedown', (event) => event.preventDefault())
      }
      button.addEventListener('click', () => {
        if (closed || current !== revision || !input.isConnected || input.value !== query) return
        if (searchDomain(input) !== domain || panel?.parentElement !== input.parentElement) {
          clear()
          return
        }
        if (
          keepFocus &&
          !searchCandidates(input, lexicon).some((candidate) => candidate.term.en === term.en)
        ) {
          show(input)
          return
        }
        clear()
        submitSearch(input, term.en)
        if (closed || !input.isConnected || searchDomain(input) !== domain) return
        panel = doc.createElement('div')
        panel.dataset.poe2L10n = 'search'
        panel.style.cssText = panelStyle
        panel.textContent = `中文查询：${query} → ${term.en}。可在上方继续输入中文。`
        input.parentElement?.append(panel)
        active = input
        positionPanel()
        input.focus()
      })
      if (exact.size === 1 && exact.has(term.en)) exactButton = button
      panel.append(button)
    }
    input.parentElement?.append(panel)
    positionPanel()
  }
  function handle(event: Event) {
    const input = event.target
    if (!(input instanceof HTMLInputElement) || !searchDomain(input)) return
    if (event.type === 'focusin') {
      if (active !== input || !panel) show(input)
      return
    }
    if (event.type === 'compositionstart') {
      composing.add(input)
      clear()
      return
    }
    if (event.type === 'compositionend') {
      composing.delete(input)
      show(input)
      return
    }
    if (event.type === 'input') {
      if (composing.has(input) || chinese.test(input.value)) {
        event.stopImmediatePropagation()
        if (!composing.has(input)) show(input)
      } else clear()
    }
    if (event.type === 'keyup' && (composing.has(input) || chinese.test(input.value)))
      event.stopImmediatePropagation()
  }
  function key(event: KeyboardEvent) {
    if (!panel || event.isComposing || composing.has(active as HTMLInputElement)) return
    if (event.target !== active && !(event.target instanceof Node && panel.contains(event.target)))
      return
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      const input = active
      // 先归还焦点，再撤下面板，避免 focusin 将刚取消的候选重新展开。
      if (input?.isConnected) input.focus()
      clear()
      return
    }
    if (event.key === 'Enter' && event.target === active && chinese.test(active?.value ?? '')) {
      event.preventDefault()
      event.stopPropagation()
      const choice = selected ?? exactButton
      choice?.click()
      return
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    const buttons = [...panel.querySelectorAll('button')]
    if (!buttons.length) return
    event.preventDefault()
    event.stopPropagation()
    const keepFocus = !!active && isConditionSearch(active)
    const index = buttons.indexOf(
      keepFocus ? (selected as HTMLButtonElement) : (doc.activeElement as HTMLButtonElement),
    )
    const next =
      index < 0
        ? event.key === 'ArrowDown'
          ? 0
          : buttons.length - 1
        : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
    if (keepFocus) {
      selected?.setAttribute('aria-selected', 'false')
      if (selected) selected.style.outline = ''
      selected = buttons[next] ?? null
      selected?.setAttribute('aria-selected', 'true')
      if (selected) selected.style.outline = '2px solid #b6dac4'
      if (selected) selectOption(selected)
      selected?.scrollIntoView?.({ block: 'nearest' })
    } else buttons[next]?.focus()
  }
  function focusOut(event: FocusEvent) {
    if (
      !panel ||
      (event.target !== active && !(event.target instanceof Node && panel.contains(event.target)))
    )
      return
    const next = event.relatedTarget
    if (next === active || (next instanceof Node && panel.contains(next))) return
    clear()
  }
  const observer = new MutationObserver(() => {
    if (
      active &&
      (!active.isConnected ||
        !panel?.isConnected ||
        panel.parentElement !== active.parentElement ||
        !searchDomain(active))
    )
      clear()
  })
  observer.observe(doc.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'id', 'type', 'readonly', 'disabled'],
  })
  doc.addEventListener('scroll', positionPanel, true)
  doc.defaultView?.addEventListener('resize', positionPanel)
  doc.addEventListener('focusout', focusOut, true)
  for (const type of ['input', 'keyup', 'compositionstart', 'compositionend', 'focusin'])
    doc.addEventListener(type, handle, true)
  doc.addEventListener('keydown', key, true)
  return () => {
    closed = true
    observer.disconnect()
    doc.removeEventListener('scroll', positionPanel, true)
    doc.defaultView?.removeEventListener('resize', positionPanel)
    doc.removeEventListener('focusout', focusOut, true)
    clear()
    for (const type of ['input', 'keyup', 'compositionstart', 'compositionend', 'focusin'])
      doc.removeEventListener(type, handle, true)
    doc.removeEventListener('keydown', key, true)
  }
}
