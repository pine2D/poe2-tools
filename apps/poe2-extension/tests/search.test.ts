import { createLexicon } from '@poe2-tools/l10n-core'
import { afterEach, expect, it } from 'vitest'
import { attachSearch } from '../src/content/search-controller'

const lex = createLexicon([
  {
    id: 'focus',
    en: 'Runed Focus',
    zh: '符文法器',
    domain: 'base',
    source: 'test',
    version: 'test',
  },
])
let stop = () => {}
afterEach(() => {
  stop()
  document.body.innerHTML = ''
})
function setup() {
  document.body.innerHTML = '<main><div id="searchItemInput"><input></div><input id="notes"></main>'
  const input = document.querySelector('input') as HTMLInputElement
  const submitted: string[] = []
  stop = attachSearch(document, lex)
  input.addEventListener('keyup', () => submitted.push(input.value))
  return { input, submitted }
}
function type(input: HTMLInputElement, text: string) {
  input.value = text
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new KeyboardEvent('keyup', { key: 'a', bubbles: true }))
}
it('中文精确候选经选择后触发一次英文查询，保留查询提示', () => {
  const { input, submitted } = setup()
  type(input, '符文法器')
  expect(submitted).toEqual([])
  const button = document.querySelector<HTMLButtonElement>('[data-poe2-l10n] button')
  expect(button?.textContent).toContain('Runed Focus')
  button?.click()
  expect(input.value).toBe('Runed Focus')
  expect(submitted).toEqual(['Runed Focus'])
  expect(document.querySelector('[data-poe2-l10n]')?.textContent).toContain('符文法器')
})
it('输入法组词不展示或提交中间值，结束后才给候选', () => {
  const { input, submitted } = setup()
  input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
  type(input, '符文')
  expect(document.querySelector('[data-poe2-l10n] button')).toBeNull()
  input.value = '符文法器'
  input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))
  expect(document.querySelector('[data-poe2-l10n] button')).not.toBeNull()
  expect(submitted).toEqual([])
})
it('后续未知词清除旧候选；清空和英文交还原站；Escape 取消', () => {
  const { input, submitted } = setup()
  type(input, '符文')
  const old = document.querySelector<HTMLButtonElement>('[data-poe2-l10n] button')
  type(input, '不存在')
  old?.click()
  expect(input.value).toBe('不存在')
  expect(document.querySelector('[data-poe2-l10n]')?.textContent).toContain('未找到')
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  expect(document.querySelector('[data-poe2-l10n]')).toBeNull()
  type(input, '')
  type(input, 'Runed')
  expect(submitted).toEqual(['', 'Runed'])
})
it('备注输入和移除后的控件不被处理；关闭移除候选', () => {
  const { input } = setup()
  const notes = document.querySelector('#notes') as HTMLInputElement
  type(notes, '符文法器')
  expect(document.querySelector('[data-poe2-l10n]')).toBeNull()
  type(input, '符文')
  stop()
  expect(document.querySelector('[data-poe2-l10n]')).toBeNull()
  expect(input.value).toBe('符文')
})
