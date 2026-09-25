import type { Term } from '@poe2-tools/l10n-core'
import { prepareImport } from '../adapters/coe-beta/import'
export function attachImport(doc: Document, terms: readonly Term[]) {
  let target: HTMLTextAreaElement | null = null
  let panel: HTMLElement | null = null
  let closed = false
  let revision = 0
  let invalidate: (() => void) | null = null
  const scan = () => {
    if (closed) return
    const input = doc.querySelector<HTMLTextAreaElement>('dialog[open] #importerInput')
    if (input === target && panel?.isConnected) return
    revision++
    invalidate = null
    panel?.remove()
    target = input
    if (!input) return
    const isActive = () =>
      !closed && target === input && input.isConnected && input.closest('dialog')?.open === true
    const returnInputFocus = (button: HTMLButtonElement, hadFocus: boolean) => {
      if (
        hadFocus &&
        isActive() &&
        (doc.activeElement === button || doc.activeElement === doc.body)
      )
        input.focus()
    }
    panel = doc.createElement('section')
    panel.dataset.poe2L10n = 'import'
    panel.style.cssText =
      'box-sizing:border-box;min-width:0;background:#20252d;color:white;padding:12px;margin:8px 0;font:14px/1.6 sans-serif;overflow-wrap:anywhere'
    const style = doc.createElement('style')
    style.textContent = `
      #noticeDialog:has([data-poe2-l10n="import"]) {
        box-sizing: border-box;
        width: 760px;
        max-width: calc(100vw - 24px) !important;
      }
      #noticeDialog:has([data-poe2-l10n="import"]) .message > .text { min-width: 0; flex: 1; }
      #noticeDialog:has([data-poe2-l10n="import"]) #importerInput {
        box-sizing: border-box;
        width: 100%;
        min-width: 0;
        max-width: 100%;
      }
    `
    const preview = doc.createElement('button')
    preview.type = 'button'
    preview.textContent = '预览中文转换'
    // 在首次转换前挂载，后续仅更新摘要，避免重复播报两栏装备全文。
    const message = doc.createElement('p')
    message.setAttribute('role', 'status')
    message.setAttribute('aria-live', 'polite')
    message.setAttribute('aria-atomic', 'true')
    const result = doc.createElement('div')
    preview.addEventListener('click', () => {
      if (!isActive() || !preview.isConnected) return
      const current = ++revision
      invalidate = null
      result.replaceChildren()
      const converted = prepareImport(input.value, terms)
      message.textContent = converted.ready
        ? '已识别。请核对两栏，再填入英文并点击原站 Proceed。'
        : '仅供对照，请逐项核对以下原因。'
      if (converted.issues.length) {
        const list = doc.createElement('ul')
        list.setAttribute('aria-label', '导入诊断')
        for (const issue of converted.issues) {
          const row = doc.createElement('li')
          if (issue.line !== null) {
            const lineNumber = issue.line
            const locate = doc.createElement('button')
            locate.type = 'button'
            locate.textContent = `第 ${issue.line} 行`
            locate.setAttribute('aria-label', `定位第 ${issue.line} 行`)
            locate.addEventListener('click', () => {
              if (!isActive() || current !== revision || input.value !== converted.original) return
              const lines = input.value.split('\n')
              const start = lines
                .slice(0, lineNumber - 1)
                .reduce((total, line) => total + line.length + 1, 0)
              const length = (lines[lineNumber - 1] ?? '').replace(/\r$/, '').length
              input.focus()
              input.setSelectionRange(start, start + length)
            })
            row.append(locate, doc.createTextNode('：'))
          }
          row.append(doc.createTextNode(issue.message))
          list.append(row)
        }
        result.append(list)
      }
      const columns = doc.createElement('div')
      columns.style.cssText =
        'display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:12px'
      for (const [title, value] of [
        ['粘贴原文（含备注）', converted.original],
        ['英文预览（不提交交易备注／描述）', converted.english],
      ]) {
        const label = doc.createElement('label')
        label.textContent = title ?? ''
        label.style.cssText = 'display:block;min-width:0'
        const area = doc.createElement('textarea')
        area.readOnly = true
        area.value = value ?? ''
        area.style.cssText =
          'display:block;box-sizing:border-box;width:100%;min-width:0;height:240px;min-height:160px;resize:vertical;margin-top:4px;font:12px/1.5 monospace'
        label.append(area)
        columns.append(label)
      }
      result.append(columns)
      const fill = doc.createElement('button')
      fill.type = 'button'
      fill.textContent = '填入英文到原站导入框'
      fill.disabled = !converted.ready
      invalidate = () => {
        revision++
        fill.disabled = true
        for (const button of result.querySelectorAll<HTMLButtonElement>('li button'))
          button.disabled = true
        message.textContent = '原文已改变，请重新预览。'
      }
      fill.addEventListener('click', () => {
        if (!isActive() || current !== revision || !fill.isConnected) return
        if (!input.isConnected || input.value !== converted.original) {
          message.textContent = '原文已改变，请重新预览。'
          fill.disabled = true
          return
        }
        const hadFocus = doc.activeElement === fill
        revision++
        invalidate = null
        input.value = converted.english
        input.dispatchEvent(new Event('input', { bubbles: true }))
        fill.disabled = true
        message.textContent = '已填入英文。请点击原站确认按钮；导入结果由原站确认。'
        const filledRevision = revision
        const restore = doc.createElement('button')
        restore.type = 'button'
        restore.textContent = '恢复粘贴原文'
        const invalidateRestore = () => {
          revision++
          restore.disabled = true
          message.textContent = '原文已改变，请重新预览。'
        }
        invalidate = invalidateRestore
        restore.addEventListener('click', () => {
          if (!isActive() || filledRevision !== revision || !restore.isConnected) return
          if (input.value !== converted.english) {
            invalidateRestore()
            return
          }
          const hadRestoreFocus = doc.activeElement === restore
          revision++
          invalidate = null
          input.value = converted.original
          input.dispatchEvent(new Event('input', { bubbles: true }))
          restore.disabled = true
          message.textContent = '已恢复粘贴原文。修改后请重新预览。'
          returnInputFocus(restore, hadRestoreFocus)
        })
        result.append(restore)
        returnInputFocus(fill, hadFocus)
      })
      result.append(fill)
    })
    panel.append(style, preview, message, result)
    input.after(panel)
  }
  const onInput = (event: Event) => {
    if (event.target === target) invalidate?.()
  }
  doc.addEventListener('input', onInput, true)
  scan()
  const observer = new MutationObserver(scan)
  observer.observe(doc.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['open'],
  })
  return () => {
    closed = true
    revision++
    invalidate = null
    doc.removeEventListener('input', onInput, true)
    observer.disconnect()
    panel?.remove()
    target = null
  }
}
