import { createLexicon } from '@poe2-tools/l10n-core'
import { afterEach, expect, it } from 'vitest'
import { attachTextLayer } from '../src/content/text-layer'

let stop = () => {}
afterEach(() => {
  stop()
  document.body.innerHTML = ''
})
it('首页功能说明限定区域翻译，保留图标、换行原文和用户文本', () => {
  document.body.innerHTML = `<main><div id="homeFeatures"><div class="feature"><div class="header">Customizability</div><label><div class="title"><img src="icon.svg">Emulate directly in
 the crafting interface</div><div class="details">Apply the selected crafting method by hovering over the item and clicking on it.</div></label></div><div contenteditable>Customizability</div></div><p>Customizability</p></main>`
  const area = document.querySelector('#homeFeatures') as HTMLElement
  const original = area.innerHTML
  const image = area.querySelector('img')
  stop = attachTextLayer(document, createLexicon([]))
  expect(area.querySelector('.header')?.textContent).toBe('可自定义')
  expect(area.querySelector('.title')?.textContent).toBe('直接在制作界面演练')
  expect(area.querySelector('.details')?.textContent).toBe(
    '将鼠标移到物品上并点击，即可应用当前选中的制作方式。',
  )
  expect(area.querySelector('img')).toBe(image)
  expect(image?.getAttribute('src')).toBe('icon.svg')
  expect(document.querySelector('p')?.textContent).toBe('Customizability')
  expect(area.querySelector('[contenteditable]')?.textContent).toBe('Customizability')
  stop()
  expect(area.innerHTML).toBe(original)
})
it('动态挂载和移出首页区域时恢复最新原文', async () => {
  document.body.innerHTML = '<main><div id="homeFeatures"></div><section></section></main>'
  stop = attachTextLayer(document, createLexicon([]))
  const title = document.createElement('div')
  title.textContent = 'Expansive user settings'
  document.querySelector('#homeFeatures')?.append(title)
  await new Promise((r) => setTimeout(r, 0))
  expect(title.textContent).toBe('丰富的用户设置')
  const source = title.firstChild as Text
  source.textContent = 'Save items to inventory'
  await new Promise((r) => setTimeout(r, 0))
  expect(title.textContent).toBe('将物品保存到背包')
  document.querySelector('section')?.append(title)
  await new Promise((r) => setTimeout(r, 0))
  expect(title.textContent).toBe('Save items to inventory')
})
