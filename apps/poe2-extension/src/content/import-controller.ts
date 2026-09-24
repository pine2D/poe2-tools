import type { Term } from '@poe2-tools/l10n-core'
import { prepareImport } from '../adapters/coe-beta/import'
export function attachImport(doc: Document, terms: readonly Term[]) {
  let target: HTMLTextAreaElement | null = null
  let panel: HTMLElement | null = null
  const scan = () => {
    const input = doc.querySelector<HTMLTextAreaElement>('dialog #importerInput')
    if (input === target && panel?.isConnected) return
    panel?.remove()
    target = input
    if (!input) return
    panel = doc.createElement('section')
    panel.dataset.poe2L10n = 'import'
    panel.style.cssText =
      'background:#20252d;color:white;padding:12px;margin:8px 0;font:14px/1.6 sans-serif'
    const preview = doc.createElement('button')
    preview.type = 'button'
    preview.textContent = '预览中文转换'
    const result = doc.createElement('div')
    preview.addEventListener('click', () => {
      result.replaceChildren()
      const converted = prepareImport(input.value, terms)
      const message = doc.createElement('p')
      message.textContent = converted.ready
        ? '已识别。请核对两栏，再填入英文并点击原站 Proceed。'
        : `仅供对照：${converted.reasons.join('；')}`
      result.append(message)
      const columns = doc.createElement('div')
      columns.style.cssText = 'display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px'
      for (const [title, value] of [
        ['粘贴原文（含备注）', converted.original],
        ['英文预览（不提交交易备注／描述）', converted.english],
      ]) {
        const label = doc.createElement('label')
        label.textContent = title ?? ''
        const area = doc.createElement('textarea')
        area.readOnly = true
        area.value = value ?? ''
        area.style.cssText = 'display:block;width:100%;min-height:220px;font:12px/1.5 monospace'
        label.append(area)
        columns.append(label)
      }
      result.append(columns)
      const fill = doc.createElement('button')
      fill.type = 'button'
      fill.textContent = '填入英文到原站导入框'
      fill.disabled = !converted.ready
      fill.addEventListener('click', () => {
        if (!input.isConnected || input.value !== converted.original) {
          message.textContent = '原文已改变，请重新预览。'
          fill.disabled = true
          return
        }
        input.value = converted.english
        input.dispatchEvent(new Event('input', { bubbles: true }))
        fill.disabled = true
        message.textContent = '已填入英文。请点击原站 Proceed；导入结果由原站确认。'
      })
      result.append(fill)
    })
    panel.append(preview, result)
    input.after(panel)
  }
  scan()
  const observer = new MutationObserver(scan)
  observer.observe(doc.body, { childList: true, subtree: true })
  return () => {
    observer.disconnect()
    panel?.remove()
    target = null
  }
}
