import { createLexicon } from '@poe2-tools/l10n-core'
import { afterEach, expect, it } from 'vitest'
import { attachTextLayer } from '../src/content/text-layer'

let stop = () => {}
afterEach(() => {
  stop()
  document.body.innerHTML = ''
  history.replaceState(null, '', '/')
})
it('设置译文限定页面和弹窗，保留选项身份、价格与可编辑文本', () => {
  history.replaceState(null, '', '/settings')
  document.body.innerHTML = `<header><div id="settingsZone"><h1>Crafting settings</h1></div></header><main><div class="settingCategory"><label>Tags filter</label><ul><li value="1" class="selected">Active</li><li value="0">Hidden</li></ul><p>Will show tag filters when active.</p><input value="12.5"><textarea>Crafting settings</textarea><div contenteditable>Layout</div><span>Unknown future option</span></div></main><footer>Layout</footer>`
  const original = document.body.innerHTML
  stop = attachTextLayer(document, createLexicon([]))
  expect(document.querySelector('h1')?.textContent).toBe('制作设置')
  expect(document.querySelector('label')?.textContent).toBe('标签筛选')
  expect(document.querySelector('li')?.textContent).toBe('显示')
  expect(document.querySelector('p')?.textContent).toBe('启用时显示标签筛选。')
  expect(document.querySelector('li')?.getAttribute('value')).toBe('1')
  expect(document.querySelector('li')?.className).toBe('selected')
  expect(document.querySelector('input')?.value).toBe('12.5')
  expect(document.querySelector('textarea')?.value).toBe('Crafting settings')
  expect(document.querySelector('[contenteditable]')?.textContent).toBe('Layout')
  expect(document.querySelector('footer')?.textContent).toBe('Layout')
  expect(document.querySelector('span')?.textContent).toBe('Unknown future option')
  stop()
  expect(document.body.innerHTML).toBe(original)
})
it('离开设置页后撤回短词译文，动态弹窗与双语可恢复', async () => {
  history.replaceState(null, '', '/settings')
  document.body.innerHTML =
    '<main><p>Layout</p></main><header><div id="settingsZone"></div></header>'
  stop = attachTextLayer(document, createLexicon([]), true)
  expect(document.querySelector('p')?.textContent).toBe('布局 · Layout')
  history.replaceState(null, '', '/data')
  window.dispatchEvent(new PopStateEvent('popstate'))
  expect(document.querySelector('p')?.textContent).toBe('Layout')
  const label = document.createElement('label')
  label.textContent = 'Compact mode'
  document.querySelector('#settingsZone')?.append(label)
  await new Promise((r) => setTimeout(r, 0))
  expect(label.textContent).toBe('紧凑模式 · Compact mode')
  stop()
  expect(label.textContent).toBe('Compact mode')
})
it('分段存储提示保留丢失警告强调与原始换行', () => {
  history.replaceState(null, '', '/settings')
  document.body.innerHTML =
    '<main><div class="messageBox">The following are your user settings. These are stored using local browser storage and\n will be\n <span class="color red bold">LOST</span> if site data is\n deleted.</div></main>'
  const original = document.body.innerHTML
  const warning = document.querySelector('span')
  stop = attachTextLayer(document, createLexicon([]))
  expect(document.querySelector('.messageBox')?.textContent?.replace(/\s+/g, '')).toBe(
    '以下是你的用户设置，保存在当前浏览器中。删除网站数据会导致这些设置丢失。',
  )
  expect(document.querySelector('span')).toBe(warning)
  expect(warning?.className).toBe('color red bold')
  stop()
  expect(document.body.innerHTML).toBe(original)
})
