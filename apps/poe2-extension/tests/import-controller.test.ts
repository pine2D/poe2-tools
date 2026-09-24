import { afterEach, expect, it } from 'vitest'
import { attachImport } from '../src/content/import-controller'

let stop = () => {}
afterEach(() => {
  stop()
  document.body.innerHTML = ''
})
it('只在原站导入弹窗挂入口；不读取剪贴板且未知文本不可提交', () => {
  document.body.innerHTML =
    '<dialog open><textarea id="importerInput">私人文本</textarea><button class="importCommitButton">Proceed</button></dialog>'
  stop = attachImport(document, [])
  const preview = document.querySelector<HTMLButtonElement>('[data-poe2-l10n="import"] button')
  expect(preview?.textContent).toBe('预览中文转换')
  preview?.click()
  expect(document.querySelector<HTMLTextAreaElement>('#importerInput')?.value).toBe('私人文本')
  const submit = document.querySelector<HTMLButtonElement>(
    '[data-poe2-l10n="import"] button:last-child',
  )
  expect(submit?.disabled).toBe(true)
  stop()
  expect(document.querySelector('[data-poe2-l10n="import"]')).toBeNull()
})
it('同名 textarea 不在 dialog 时不挂载', () => {
  document.body.innerHTML = '<textarea id="importerInput"></textarea>'
  stop = attachImport(document, [])
  expect(document.querySelector('[data-poe2-l10n="import"]')).toBeNull()
})
