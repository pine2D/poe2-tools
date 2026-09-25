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
it('ArrowUp 从输入框进入最后一个候选，Escape 返回输入框且不提交', () => {
  document.body.innerHTML = '<main><div id="searchItemInput"><input></div></main>'
  const input = document.querySelector('input') as HTMLInputElement
  const terms = ['甲', '乙', '丙'].map((name, i) => ({
    id: String(i),
    en: `Focus ${i}`,
    zh: `法器${name}`,
    domain: 'base' as const,
    source: 'test',
    version: 'test',
  }))
  stop = attachSearch(document, createLexicon(terms))
  input.focus()
  type(input, '法器')
  input.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }),
  )
  const buttons = [...document.querySelectorAll('[data-poe2-l10n] button')]
  expect(document.activeElement).toBe(buttons.at(-1))
  document.activeElement?.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
  )
  expect(document.activeElement).toBe(input)
  expect(input.value).toBe('法器')
})
it('唯一精确候选支持在输入框按 Enter 执行；输入法 Enter 不提交', () => {
  const { input, submitted } = setup()
  type(input, '符文法器')
  input.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'Enter',
      isComposing: true,
      bubbles: true,
      cancelable: true,
    }),
  )
  expect(submitted).toEqual([])
  const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
  input.dispatchEvent(enter)
  expect(enter.defaultPrevented).toBe(true)
  expect(submitted).toEqual(['Runed Focus'])
})
it('部分词 Enter 不擅自选择候选，方向键与 Escape 不冒泡到原站快捷键', () => {
  const { input, submitted } = setup()
  const keys: string[] = []
  input.addEventListener('keydown', (e) => keys.push(e.key))
  type(input, '符文')
  input.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
  )
  expect(submitted).toEqual([])
  input.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
  )
  document.activeElement?.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
  )
  expect(keys).toEqual([])
  expect(document.activeElement).toBe(input)
})
it('原站移除搜索框后撤下候选，重新插入旧框也不能提交旧选择', async () => {
  const { input, submitted } = setup()
  type(input, '符文')
  const parent = input.parentElement as HTMLElement
  const old = document.querySelector<HTMLButtonElement>('[data-poe2-l10n] button')
  input.remove()
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(document.querySelector('[data-poe2-l10n]')).toBeNull()
  parent.prepend(input)
  old?.click()
  expect(submitted).toEqual([])
})
it('焦点在候选内移动时保留面板，离开查询区域后撤下且不抢焦点', () => {
  const { input } = setup()
  input.focus()
  type(input, '符文')
  const button = document.querySelector<HTMLButtonElement>('[data-poe2-l10n] button')
  button?.focus()
  expect(document.querySelector('[data-poe2-l10n]')).not.toBeNull()
  const notes = document.querySelector('#notes') as HTMLInputElement
  notes.focus()
  expect(document.querySelector('[data-poe2-l10n]')).toBeNull()
  expect(document.activeElement).toBe(notes)
})
it('原站同步替换控件时不把英文查询提示留在旧容器', () => {
  const { input } = setup()
  const parent = input.parentElement as HTMLElement
  input.addEventListener('keyup', () => input.remove())
  type(input, '符文')
  document.querySelector<HTMLButtonElement>('[data-poe2-l10n] button')?.click()
  expect(parent.querySelector('[data-poe2-l10n]')).toBeNull()
})
it('原站移动搜索框后撤下旧容器候选，新的中文输入仍可使用', async () => {
  const { input, submitted } = setup()
  type(input, '符文')
  const next = document.createElement('div')
  next.id = 'dataItemSearchInput'
  document.querySelector('main')?.append(next)
  next.append(input)
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(document.querySelector('[data-poe2-l10n]')).toBeNull()
  type(input, '符文法器')
  next.querySelector<HTMLButtonElement>('button')?.click()
  expect(submitted).toEqual(['Runed Focus'])
})
it('返回仍含中文的搜索框时重建候选，不提交查询且不复用旧按钮', () => {
  const { input, submitted } = setup()
  input.focus()
  type(input, '符文法器')
  const old = document.querySelector<HTMLButtonElement>('[data-poe2-l10n] button')
  ;(document.querySelector('#notes') as HTMLInputElement).focus()
  input.focus()
  const current = document.querySelector<HTMLButtonElement>('[data-poe2-l10n] button')
  expect(current).not.toBeNull()
  expect(current).not.toBe(old)
  expect(document.activeElement).toBe(input)
  expect(submitted).toEqual([])
  old?.click()
  expect(submitted).toEqual([])
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  expect(submitted).toEqual(['Runed Focus'])
})
it('候选 Escape 返回输入框后保持关闭，重新聚焦才恢复；英文不自动转换', () => {
  const { input, submitted } = setup()
  input.focus()
  type(input, '符文')
  const button = document.querySelector<HTMLButtonElement>('[data-poe2-l10n] button')
  button?.focus()
  button?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  expect(document.activeElement).toBe(input)
  expect(document.querySelector('[data-poe2-l10n]')).toBeNull()
  const notes = document.querySelector('#notes') as HTMLInputElement
  notes.focus()
  input.focus()
  expect(document.querySelector('[data-poe2-l10n] button')).not.toBeNull()
  type(input, 'Runed Focus')
  notes.focus()
  input.focus()
  expect(document.querySelector('[data-poe2-l10n]')).toBeNull()
  expect(submitted).toEqual(['Runed Focus'])
})
