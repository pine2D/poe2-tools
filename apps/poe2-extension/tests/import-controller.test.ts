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

const source = `物品类别: 法器
稀有度: 魔法
测试的 符文法器
--------
物品等级: 86
--------
{ 前缀属性 "测试的" (等阶：6) — 能量护盾 }
+40(36-41) 能量护盾上限`
function readyPreview() {
  document.body.innerHTML = '<dialog open><textarea id="importerInput"></textarea></dialog>'
  const input = document.querySelector('#importerInput') as HTMLTextAreaElement
  input.value = source
  stop = attachImport(document, [
    {
      id: 'base',
      en: 'Runed Focus',
      zh: '符文法器',
      domain: 'base',
      source: 'test',
      version: 'test',
    },
    {
      id: 'stat',
      sourceId: 'explicit.stat_4052037485',
      en: '+# to maximum Energy Shield',
      zh: '+# 能量护盾上限',
      domain: 'stat',
      source: 'test',
      version: 'test',
    },
  ])
  const preview = document.querySelector('[data-poe2-l10n] > button') as HTMLButtonElement
  preview.click()
  const fill = document.querySelector('[data-poe2-l10n] > div > button') as HTMLButtonElement
  expect(fill.disabled).toBe(false)
  return { input, preview, fill }
}
it('重复预览使旧填入按钮失效，当前预览仍可填入', () => {
  const { input, preview, fill } = readyPreview()
  preview.click()
  fill.click()
  expect(input.value).toBe(source)
  const current = document.querySelector('[data-poe2-l10n] > div > button') as HTMLButtonElement
  current.click()
  expect(input.value).toContain('Runed Focus')
})
it('停用扩展后旧预览按钮和填入按钮不能修改原站', () => {
  const { input, preview, fill } = readyPreview()
  stop()
  preview.click()
  fill.click()
  expect(input.value).toBe(source)
  expect(document.querySelector('[data-poe2-l10n]')).toBeNull()
})
it('编辑原文立即禁用旧填入入口，再次预览才可使用', () => {
  const { input, preview, fill } = readyPreview()
  input.value = source.replace('+40', '+39')
  input.dispatchEvent(new Event('input', { bubbles: true }))
  expect(fill.disabled).toBe(true)
  expect(document.querySelector('[data-poe2-l10n]')?.textContent).toContain('重新预览')
  preview.click()
  const current = document.querySelector('[data-poe2-l10n] > div > button') as HTMLButtonElement
  expect(current.disabled).toBe(false)
  current.click()
  expect(input.value).toContain('+39(36-41) to maximum Energy Shield')
})
it('点击诊断定位原输入行，不修改文本，过期诊断不能继续操作', () => {
  const { input, preview } = readyPreview()
  input.value = source.replace('(36-41)', '')
  input.dispatchEvent(new Event('input', { bubbles: true }))
  preview.click()
  const locate = document.querySelector<HTMLButtonElement>('button[aria-label="定位第 8 行"]')
  expect(locate).not.toBeNull()
  const original = input.value
  locate?.click()
  expect(document.activeElement).toBe(input)
  expect(input.value).toBe(original)
  expect(input.value.slice(input.selectionStart, input.selectionEnd)).toBe('+40 能量护盾上限')
  input.value = source
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.setSelectionRange(0, 0)
  locate?.click()
  expect(input.selectionStart).toBe(0)
})

it('导入状态区在预览前挂载，跨重试保留，仅播报摘要且不抢焦点', () => {
  const { input, preview, fill } = readyPreview()
  const status = document.querySelector('[data-poe2-l10n="import"] [role="status"]')
  expect(status).not.toBeNull()
  expect(status?.getAttribute('aria-live')).toBe('polite')
  expect(status?.getAttribute('aria-atomic')).toBe('true')
  expect(status?.textContent).toContain('已识别')
  expect(status?.querySelector('textarea')).toBeNull()
  input.focus()
  input.value = source.replace('+40', '+39')
  input.dispatchEvent(new Event('input', { bubbles: true }))
  expect(status?.textContent).toBe('原文已改变，请重新预览。')
  expect(document.activeElement).toBe(input)
  expect(fill.disabled).toBe(true)
  preview.click()
  expect(document.querySelector('[role="status"]')).toBe(status)
  expect(status?.textContent).toContain('已识别')
  const current = document.querySelector('[data-poe2-l10n] > div > button') as HTMLButtonElement
  current.click()
  expect(status?.textContent).toContain('已填入英文')
  expect(document.activeElement).toBe(input)
  input.value = '未知文本'
  input.dispatchEvent(new Event('input', { bubbles: true }))
  preview.click()
  expect(document.querySelector('[role="status"]')).toBe(status)
  expect(status?.textContent).toContain('仅供对照')
  stop()
  expect(status?.isConnected).toBe(false)
})

it('未预览时状态区为空，不提前播报装备内容', () => {
  document.body.innerHTML = '<dialog open><textarea id="importerInput">私人文本</textarea></dialog>'
  stop = attachImport(document, [])
  const status = document.querySelector('[data-poe2-l10n="import"] [role="status"]')
  expect(status).not.toBeNull()
  expect(status?.textContent).toBe('')
})

it('关闭对话框后立即拒绝旧按钮操作，随后移除预览，重开重新挂载', async () => {
  const { input, preview, fill } = readyPreview()
  const dialog = input.closest('dialog') as HTMLDialogElement
  dialog.open = false
  fill.click()
  expect(input.value).toBe(source)
  preview.click()
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(document.querySelector('[data-poe2-l10n="import"]')).toBeNull()
  dialog.open = true
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(document.querySelectorAll('[data-poe2-l10n="import"]')).toHaveLength(1)
  expect(document.querySelector('[role="status"]')?.textContent).toBe('')
  fill.click()
  expect(input.value).toBe(source)
})

it('未打开的原站对话框不挂载预览', () => {
  document.body.innerHTML = '<dialog><textarea id="importerInput"></textarea></dialog>'
  stop = attachImport(document, [])
  expect(document.querySelector('[data-poe2-l10n="import"]')).toBeNull()
})

it('关闭后旧诊断不能改变选择区', () => {
  const { input, preview } = readyPreview()
  input.value = source.replace('(36-41)', '')
  preview.click()
  const locate = document.querySelector<HTMLButtonElement>('button[aria-label="定位第 8 行"]')
  expect(locate).not.toBeNull()
  ;(input.closest('dialog') as HTMLDialogElement).open = false
  input.setSelectionRange(0, 0)
  locate?.click()
  expect(input.selectionStart).toBe(0)
  expect(input.selectionEnd).toBe(0)
})
