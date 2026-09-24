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
