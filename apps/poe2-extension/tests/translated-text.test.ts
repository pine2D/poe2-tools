import { expect, it } from 'vitest'
import { translatedText } from '../src/guide/translated-text'

it('标注保持复制文本不变且不解析 HTML；键盘可读英文', () => {
  const host = document.createElement('div')
  host.append(
    translatedText(document, '<img>能量护盾', [
      { start: 5, end: 9, en: 'Energy Shield', zh: '能量护盾' },
    ]),
  )
  expect(host.textContent).toBe('<img>能量护盾')
  expect(host.querySelector('img')).toBeNull()
  expect(host.querySelector('span')?.tabIndex).toBe(0)
  expect(host.querySelector('span')?.title).toContain('Energy Shield')
})
it('拒绝偏移、文本和结构不一致的标注；链接内不增加焦点', () => {
  const host = document.createElement('a')
  host.append(
    translatedText(
      document,
      '能量护盾',
      [{ start: 0, end: 4, en: 'Energy Shield', zh: '能量护盾' }],
      false,
    ),
  )
  expect(host.querySelector('[tabindex]')).toBeNull()
  host.replaceChildren(
    translatedText(document, '生命', [{ start: 0, end: 20, en: 'Life', zh: '生命' }]),
  )
  expect(host.querySelector('span')).toBeNull()
  expect(host.textContent).toBe('生命')
})
