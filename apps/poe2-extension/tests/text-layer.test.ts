import { createLexicon } from '@poe2-tools/l10n-core'
import { afterEach, expect, it } from 'vitest'
import { supportsPage } from '../src/adapters/coe-beta/context'
import { attachTextLayer } from '../src/content/text-layer'

const lex = createLexicon([
  { id: 'f', en: 'Runed Focus', zh: '符文法器', domain: 'base', source: 'test', version: 'test' },
  {
    id: 'r',
    en: '#% to Lightning Resistance',
    zh: '闪电抗性 #%',
    domain: 'stat',
    source: 'test',
    version: 'test',
  },
])
const stops: (() => void)[] = []
afterEach(() => {
  for (const stop of stops.splice(0)) stop()
  document.body.innerHTML = ''
})
const settle = () => new Promise((r) => setTimeout(r, 30))
it('仅真实 Beta 域的英文 PoE2 模式启用，不能信任 URL 参数', () => {
  document.body.innerHTML =
    '<div id="gameToggler"><a class="poe2 selected"></a></div><div id="languageToggler"><div class="list"><div key="us" class="active"></div></div></div>'
  expect(supportsPage(document, 'https://beta.craftofexile.com/?game=poe2')).toBe(true)
  expect(supportsPage(document, 'https://www.craftofexile.com/?game=poe2')).toBe(false)
  expect(supportsPage(document, 'https://beta.craftofexile.com.evil.invalid/')).toBe(false)
  document.querySelector('[key]')?.setAttribute('key', 'tw')
  expect(supportsPage(document, 'https://beta.craftofexile.com/?game=poe2')).toBe(false)
  document.querySelector('[key]')?.setAttribute('key', 'us')
  document.querySelector('.poe2')?.setAttribute('class', 'poe2')
  expect(supportsPage(document, 'https://beta.craftofexile.com/?game=poe2')).toBe(false)
})
it('原站重新写值后翻译新值，关闭恢复最新原文', async () => {
  document.body.innerHTML = '<main><span>+18% to Lightning Resistance</span></main>'
  const span = document.querySelector('span') as HTMLSpanElement
  const stop = attachTextLayer(document, lex)
  stops.push(stop)
  expect(span.textContent).toBe('闪电抗性 +18%')
  const textNode = span.firstChild as Text
  textNode.textContent = '+20% to Lightning Resistance'
  await settle()
  expect(span.textContent).toBe('闪电抗性 +20%')
  stop()
  expect(span.textContent).toBe('+20% to Lightning Resistance')
})
it('立即关闭不能用旧值覆盖原站尚未处理的新值', () => {
  document.body.innerHTML = '<main><span>Runed Focus</span></main>'
  const stop = attachTextLayer(document, lex)
  stops.push(stop)
  const span = document.querySelector('span') as HTMLSpanElement
  span.textContent = 'Changed by site'
  stop()
  expect(document.querySelector('span')?.textContent).toBe('Changed by site')
})
it('新增节点被翻译且双语不会无限重复', async () => {
  document.body.innerHTML = '<main></main>'
  stops.push(attachTextLayer(document, lex, true))
  const main = document.querySelector('main') as HTMLElement
  main.innerHTML = '<button>Runed Focus</button>'
  await settle()
  await settle()
  expect(document.querySelector('button')?.textContent).toBe('符文法器 · Runed Focus')
})
it('不修改输入、备注、代码、扩展自身、广告和业务属性', () => {
  document.body.innerHTML =
    '<main><input value="Runed Focus"><textarea>Runed Focus</textarea><code>Runed Focus</code><span contenteditable="true">Runed Focus</span><div data-poe2-l10n>Runed Focus</div><div id="coe_ad_zone">Runed Focus</div><button data-key="Runed Focus">Runed Focus</button></main>'
  stops.push(attachTextLayer(document, lex))
  expect(document.querySelector('input')?.value).toBe('Runed Focus')
  for (const selector of [
    'textarea',
    'code',
    '[contenteditable]',
    '[data-poe2-l10n]',
    '#coe_ad_zone',
  ])
    expect(document.querySelector(selector)?.textContent).toBe('Runed Focus')
  expect(document.querySelector('button')?.dataset.key).toBe('Runed Focus')
  expect(document.querySelector('button')?.textContent).toBe('符文法器')
})
it('暂时移除再复用的文字节点仍可恢复原文', async () => {
  document.body.innerHTML = '<main><span>Runed Focus</span></main>'
  const node = document.querySelector('span') as HTMLSpanElement
  const stop = attachTextLayer(document, lex)
  stops.push(stop)
  node.remove()
  await settle()
  document.querySelector('main')?.append(node)
  await settle()
  stop()
  expect(node.textContent).toBe('Runed Focus')
})
it('节点移入备注编辑区后恢复英文，用户改值后关闭不覆盖', async () => {
  document.body.innerHTML =
    '<main><span>Runed Focus</span><div contenteditable="true"></div></main>'
  const node = document.querySelector('span') as HTMLElement
  const stop = attachTextLayer(document, lex)
  stops.push(stop)
  document.querySelector('[contenteditable]')?.append(node)
  await settle()
  expect(node.textContent).toBe('Runed Focus')
  node.textContent = '我的备注'
  stop()
  expect(node.textContent).toBe('我的备注')
})
it('祖先切换隐藏与编辑状态会撤销译文，恢复普通区域后重新翻译', async () => {
  document.body.innerHTML = '<main><section><span>Runed Focus</span></section></main>'
  stops.push(attachTextLayer(document, lex))
  const section = document.querySelector('section') as HTMLElement
  const node = document.querySelector('span') as HTMLElement
  section.classList.add('hidden')
  await settle()
  expect(node.textContent).toBe('Runed Focus')
  section.classList.remove('hidden')
  await settle()
  expect(node.textContent).toBe('符文法器')
  section.contentEditable = 'true'
  await settle()
  expect(node.textContent).toBe('Runed Focus')
})
