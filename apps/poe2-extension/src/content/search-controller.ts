import type { Lexicon } from '@poe2-tools/l10n-core'
import { searchDomain, submitSearch } from '../adapters/coe-beta/search'

const chinese = /\p{Script=Han}/u
export function attachSearch(doc: Document, lexicon: Lexicon): () => void {
  const composing = new WeakSet<HTMLInputElement>()
  let panel: HTMLElement | null = null
  let revision = 0
  let active: HTMLInputElement | null = null
  let closed = false
  function clear() {
    revision++
    panel?.remove()
    panel = null
    active = null
  }
  function show(input: HTMLInputElement) {
    clear()
    const domain = searchDomain(input)
    if (!domain || !chinese.test(input.value) || composing.has(input)) return
    active = input
    const query = input.value
    const current = revision
    const candidates = lexicon.search(query, domain)
    panel = doc.createElement('div')
    panel.dataset.poe2L10n = 'search'
    panel.setAttribute('aria-label', '中文搜索候选')
    panel.style.cssText =
      'position:relative;z-index:20;background:#20252d;color:#fff;padding:8px;border:1px solid #8499ae;max-height:240px;overflow:auto;font:14px/1.6 sans-serif'
    const label = doc.createElement('div')
    label.textContent = candidates.length
      ? `“${query}”：选择英文查询（方向键移动，Enter 选择，Escape 取消）`
      : `“${query}”：未找到术语，请缩短关键词或输入英文。`
    panel.append(label)
    const unique = new Map(candidates.map((c) => [c.term.en, c.term]))
    for (const term of unique.values()) {
      const button = doc.createElement('button')
      button.type = 'button'
      button.textContent = `${term.zh} → ${term.en}`
      button.style.cssText = 'display:block;text-align:left;margin:4px 0;white-space:normal'
      button.addEventListener('click', () => {
        if (closed || current !== revision || !input.isConnected || input.value !== query) return
        clear()
        submitSearch(input, term.en)
        panel = doc.createElement('div')
        panel.dataset.poe2L10n = 'search'
        panel.textContent = `中文查询：${query} → ${term.en}。可在上方继续输入中文。`
        input.parentElement?.append(panel)
        active = input
        input.focus()
      })
      panel.append(button)
    }
    input.parentElement?.append(panel)
  }
  function handle(event: Event) {
    const input = event.target
    if (!(input instanceof HTMLInputElement) || !searchDomain(input)) return
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
    if (!panel || composing.has(active as HTMLInputElement)) return
    if (event.target !== active && !(event.target instanceof Node && panel.contains(event.target)))
      return
    if (event.key === 'Escape') {
      event.preventDefault()
      clear()
      return
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    const buttons = [...panel.querySelectorAll('button')]
    if (!buttons.length) return
    event.preventDefault()
    event.stopPropagation()
    const index = buttons.indexOf(doc.activeElement as HTMLButtonElement)
    buttons[
      (index + (event.key === 'ArrowDown' ? 1 : buttons.length - 1) + buttons.length) %
        buttons.length
    ]?.focus()
  }
  for (const type of ['input', 'keyup', 'compositionstart', 'compositionend'])
    doc.addEventListener(type, handle, true)
  doc.addEventListener('keydown', key, true)
  return () => {
    closed = true
    clear()
    for (const type of ['input', 'keyup', 'compositionstart', 'compositionend'])
      doc.removeEventListener(type, handle, true)
    doc.removeEventListener('keydown', key, true)
  }
}
