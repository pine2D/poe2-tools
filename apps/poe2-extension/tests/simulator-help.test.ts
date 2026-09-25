import { createLexicon } from '@poe2-tools/l10n-core'
import { afterEach, expect, it } from 'vitest'
import { attachTextLayer } from '../src/content/text-layer'

const originalUrl = location.href
let stop = () => {}
afterEach(() => {
  stop()
  document.body.innerHTML = ''
  history.replaceState(null, '', originalUrl)
})
const lexicon = createLexicon([
  { id: 'or', en: 'or', zh: '或（OR）', domain: 'ui', source: 'test', version: 'test' },
  { id: 'flag', en: 'Flag', zh: '状态', domain: 'ui', source: 'test', version: 'test' },
])
it('教程使用普通连词与图标含义，保留原标记和未来功能限定', () => {
  history.replaceState(null, '', '/simulator-usage?game=poe2')
  document.body.innerHTML =
    '<main><div id="output"><h3>How to use - Simulator</h3><p><b>House</b> or <b>Flag</b></p><span>(upcoming feature)</span><input value="Flag"><code>Flag</code></div></main>'
  const root = document.querySelector('#output') as HTMLElement
  const before = root.innerHTML
  const flag = root.querySelectorAll('b')[1]
  stop = attachTextLayer(document, lexicon)
  expect(root.querySelector('h3')?.textContent).toBe('流程模拟使用说明')
  expect(root.querySelector('p')?.textContent).toBe('房屋 或 旗帜')
  expect(root.querySelector('span')?.textContent).toBe('（尚未推出）')
  expect(root.querySelectorAll('b')[1]).toBe(flag)
  expect(root.querySelector('code')?.textContent).toBe('Flag')
  expect(root.querySelector('input')?.value).toBe('Flag')
  stop()
  expect(root.innerHTML).toBe(before)
})
it('帮助入口按容器翻译，链接目标和用户文本不变', () => {
  document.body.innerHTML =
    '<main><div id="simulatorStartingItemOutput"><div class="messageBox">Need help using the simulator? <a href="simulator-usage" target="_blank">Click here</a>.</div></div><a id="other">Click here</a><div class="simulationsList"><div class="row" simulationid="test"><div class="title">Need help using the simulator?</div></div></div></main>'
  const link = document.querySelector('a') as HTMLAnchorElement
  const parent = link.parentElement as HTMLElement
  const before = parent.innerHTML
  stop = attachTextLayer(document, lexicon)
  expect(parent.textContent).toBe('需要了解流程模拟的用法？ 查看使用说明。')
  expect(link.getAttribute('href')).toBe('simulator-usage')
  expect(link.target).toBe('_blank')
  expect(document.querySelector('#other')?.textContent).toBe('Click here')
  expect(document.querySelector('.title')?.textContent).toBe('Need help using the simulator?')
  stop()
  expect(parent.innerHTML).toBe(before)
})
it('教程双语保留原文，其他页面不套用图标语义', () => {
  history.replaceState(null, '', '/simulator-usage')
  document.body.innerHTML =
    '<main><div id="output"><b>Flag</b><p>Unknown tutorial sentence.</p></div><b id="outside">Flag</b></main>'
  stop = attachTextLayer(document, lexicon, true)
  expect(document.querySelector('#output b')?.textContent).toBe('旗帜 · Flag')
  expect(document.querySelector('#outside')?.textContent).toBe('状态 · Flag')
  expect(document.querySelector('p')?.textContent).toBe('Unknown tutorial sentence.')
})
