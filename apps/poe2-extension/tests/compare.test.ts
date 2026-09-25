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
const lex = createLexicon([
  { id: 'base', en: 'Base', zh: '基底', domain: 'ui', source: 'test', version: 'test' },
  { id: 'life', en: 'Life', zh: '生命', domain: 'ui', source: 'test', version: 'test' },
])
it('版本对比控件使用数据语境，差异路径与原始值不参与汉化', () => {
  history.replaceState(null, '', '/compare?game=poe2')
  document.body.innerHTML =
    '<main><div id="ui"><label>Source</label><div id="dataSetSelector"><li value="base">Base</li></div><label>Families</label></div><div id="changeTypeSelector">Changed</div><div class="changeTable"><div class="header"><div>Path</div></div><div class="row"><div class="type">Changed</div><div class="path">Life</div><div class="details">Base</div></div></div></main>'
  const before = document.body.innerHTML
  stop = attachTextLayer(document, lex)
  expect(document.querySelector('#ui label')?.textContent).toBe('来源版本')
  expect(document.querySelector('li')?.textContent).toBe('基础')
  expect(document.querySelector('li')?.getAttribute('value')).toBe('base')
  expect(document.querySelector('#ui label:last-child')?.textContent).toBe('词缀族')
  expect(document.querySelector('.header')?.textContent).toBe('路径')
  expect(document.querySelector('.row .type')?.textContent).toBe('修改')
  expect(document.querySelector('.row .path')?.textContent).toBe('Life')
  expect(document.querySelector('.row .details')?.textContent).toBe('Base')
  stop()
  expect(document.body.innerHTML).toBe(before)
})
it('对比上下文支持双语，不影响其他页面及未知版本名', () => {
  history.replaceState(null, '', '/compare')
  document.body.innerHTML =
    '<main><div id="ui"><label>Source</label><span>Unknown league</span></div><div id="output"><div class="messageBox">No changes detected between the two patches for this comparison vector.</div></div><div id="outside">Source</div></main>'
  stop = attachTextLayer(document, lex, true)
  expect(document.querySelector('label')?.textContent).toBe('来源版本 · Source')
  expect(document.querySelector('.messageBox')?.textContent).toContain('没有检测到差异')
  expect(document.querySelector('span')?.textContent).toBe('Unknown league')
  expect(document.querySelector('#outside')?.textContent).toBe('Source')
  stop()
  history.replaceState(null, '', '/')
  stop = attachTextLayer(document, lex)
  expect(document.querySelector('label')?.textContent).toBe('Source')
})
