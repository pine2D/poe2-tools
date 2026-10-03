import type { Term } from '@poe2-tools/l10n-core'
import { prepareImport } from '../adapters/coe-beta/import'
import { FULL_DISCLAIMER, SHORT_PROVENANCE } from '../provenance'
import { adoptL1, createGem } from './l1'

// 原站对话框的布局放宽（spec §6.9 宿主全局样式例外 3）：只改布局，不改颜色与字体；第一条规则是 0.2.0 原文加 overflow-y: auto（spec B.12 第 11 条），另两条逐字沿用 0.2.0
const DIALOG_CSS = `
      #noticeDialog:has([data-poe2-l10n="import"]) {
        box-sizing: border-box;
        width: 760px;
        max-width: calc(100vw - 24px) !important;
        overflow-y: auto;
      }
      #noticeDialog:has([data-poe2-l10n="import"]) .message > .text { min-width: 0; flex: 1; }
      #noticeDialog:has([data-poe2-l10n="import"]) #importerInput {
        box-sizing: border-box;
        width: 100%;
        min-width: 0;
        max-width: 100%;
      }
    `
export function attachImport(doc: Document, terms: readonly Term[]) {
  let target: HTMLTextAreaElement | null = null
  let host: HTMLElement | null = null
  let dialogStyle: HTMLStyleElement | null = null
  let closed = false
  let revision = 0
  let invalidate: (() => void) | null = null
  const scan = () => {
    if (closed) return
    const input = doc.querySelector<HTMLTextAreaElement>('dialog[open] #importerInput')
    if (input === target && host?.isConnected) return
    revision++
    invalidate = null
    host?.remove()
    dialogStyle?.remove()
    target = input
    if (!input) return
    const isActive = () =>
      !closed && target === input && input.isConnected && input.closest('dialog')?.open === true
    host = doc.createElement('section')
    host.dataset.poe2L10n = 'import'
    host.style.cssText = 'display:block;box-sizing:border-box;min-width:0;margin:12px 0'
    const shadow = host.attachShadow({ mode: 'open' })
    adoptL1(shadow)
    const panel = doc.createElement('div')
    panel.className = 'panel'
    const head = doc.createElement('div')
    head.className = 'head'
    const heading = doc.createElement('strong')
    heading.className = 'title'
    heading.textContent = '装备文本转换'
    const by = doc.createElement('span')
    by.className = 'by'
    by.textContent = SHORT_PROVENANCE
    head.append(createGem(doc, 16), heading, by)
    const body = doc.createElement('div')
    body.className = 'body'
    const disclaimer = doc.createElement('p')
    disclaimer.className = 'disclaimer'
    disclaimer.textContent = FULL_DISCLAIMER
    dialogStyle = doc.createElement('style')
    dialogStyle.dataset.poe2L10n = 'import-dialog'
    dialogStyle.textContent = DIALOG_CSS
    const returnInputFocus = (button: HTMLButtonElement, hadFocus: boolean) => {
      if (
        hadFocus &&
        isActive() &&
        (shadow.activeElement === button || doc.activeElement === doc.body)
      )
        input.focus()
    }
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
        ? '已识别并转换。请核对两栏后填入英文；能否导入及装备规则由原站判断。'
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
            locate.dataset.tertiary = ''
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
      if (converted.warnings.length) {
        const warning = doc.createElement('p')
        warning.setAttribute('aria-label', '原站兼容性提示')
        warning.textContent = converted.warnings.join(' ')
        result.append(warning)
      }
      const columns = doc.createElement('div')
      columns.className = 'columns'
      for (const [index, [title, value]] of [
        ['粘贴原文（含备注）', converted.original],
        ['英文预览（不提交交易备注／描述）', converted.english],
      ].entries()) {
        const label = doc.createElement('label')
        label.textContent = title ?? ''
        const area = doc.createElement('textarea')
        area.readOnly = true
        area.value = value ?? ''
        if (index === 1) area.dataset.preview = ''
        label.append(area)
        columns.append(label)
      }
      result.append(columns)
      const fill = doc.createElement('button')
      fill.type = 'button'
      fill.dataset.primary = ''
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
        const hadFocus = shadow.activeElement === fill
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
        restore.dataset.tertiary = ''
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
          const hadRestoreFocus = shadow.activeElement === restore
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
    body.append(preview, message, result)
    panel.append(head, body, disclaimer)
    shadow.append(panel)
    input.after(dialogStyle, host)
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
    host?.remove()
    dialogStyle?.remove()
    target = null
  }
}
