import { createLexicon } from '@poe2-tools/l10n-core'
import { afterEach, expect, it } from 'vitest'
import { attachTextLayer } from '../src/content/text-layer'

const lex = createLexicon([
  { id: 'life', en: 'Life', zh: '生命', domain: 'ui', source: 'test', version: 'test' },
])
let stop = () => {}
afterEach(() => {
  stop()
  document.body.innerHTML = ''
})
it('通知仅翻译已核对短句，保持未知名称、错误详情和节点身份', () => {
  document.body.innerHTML =
    '<div id="snackbarsRight"><div class="snackbar"><label>Clipboard action</label><div class="message">Inventory to clipboard!</div><div>Life</div></div></div><div id="outside">Inventory to clipboard!</div>'
  const before = document.body.innerHTML
  const message = document.querySelector('.message')
  stop = attachTextLayer(document, lex)
  expect(document.querySelector('label')?.textContent).toBe('剪贴板操作')
  expect(message?.textContent).toBe('背包已复制到剪贴板！')
  expect(document.querySelector('.message')).toBe(message)
  expect(document.querySelector('.snackbar > div:last-child')?.textContent).toBe('Life')
  expect(document.querySelector('#outside')?.textContent).toBe('Inventory to clipboard!')
  stop()
  expect(document.body.innerHTML).toBe(before)
})
it('动态通知与双语可恢复最新消息，代码块不翻译', async () => {
  document.body.innerHTML = '<div id="snackbarsLeft"></div>'
  stop = attachTextLayer(document, lex, true)
  const holder = document.querySelector('#snackbarsLeft') as HTMLElement
  holder.innerHTML =
    '<div class="snackbar"><label>Inventory Import</label><div class="message">Data imported succesfully!</div><code>Inventory Import</code></div>'
  await new Promise((r) => setTimeout(r, 30))
  expect(document.querySelector('.message')?.textContent).toBe(
    '数据导入成功！ · Data imported succesfully!',
  )
  expect(document.querySelector('code')?.textContent).toBe('Inventory Import')
  const message = document.querySelector('.message') as HTMLElement
  message.textContent = 'Life'
  await new Promise((r) => setTimeout(r, 30))
  expect(document.querySelector('.message')?.textContent).toBe('Life')
  stop()
  expect(document.querySelector('label')?.textContent).toBe('Inventory Import')
  expect(document.querySelector('.message')?.textContent).toBe('Life')
})
it('通知用途类消失时恢复原文，恢复用途后重新翻译', async () => {
  document.body.innerHTML =
    '<div id="snackbarsRight"><div class="snackbar">Clipboard action</div></div>'
  const node = document.querySelector('.snackbar') as HTMLElement
  stop = attachTextLayer(document, lex)
  expect(node.textContent).toBe('剪贴板操作')
  node.classList.remove('snackbar')
  await new Promise((r) => setTimeout(r, 30))
  expect(node.textContent).toBe('Clipboard action')
  node.classList.add('snackbar')
  await new Promise((r) => setTimeout(r, 30))
  expect(node.textContent).toBe('剪贴板操作')
})
