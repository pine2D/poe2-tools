import { createLexicon } from '@poe2-tools/l10n-core'
import { afterEach, expect, it } from 'vitest'
import { attachAttributeLayer } from '../src/content/attribute-layer'

const lex = createLexicon([
  { id: 'search', en: 'Search', zh: '搜索', domain: 'ui', source: 'test', version: 'test' },
])
let stop = () => {}
afterEach(() => {
  stop()
  document.body.innerHTML = ''
})
const settle = () => new Promise((r) => setTimeout(r, 30))
it('翻译提示属性，保留输入值、链接和业务属性；关闭恢复', () => {
  document.body.innerHTML =
    '<main><input placeholder="Search" aria-label="Search" value="Search"><a title="Search" href="/Search" data-key="Search">X</a></main>'
  const input = document.querySelector('input') as HTMLInputElement
  stop = attachAttributeLayer(document, lex)
  expect(input.placeholder).toBe('搜索')
  expect(input.getAttribute('aria-label')).toBe('搜索')
  expect(input.value).toBe('Search')
  expect(document.querySelector('a')?.getAttribute('title')).toBe('搜索')
  expect(document.querySelector('a')?.getAttribute('href')).toBe('/Search')
  expect(document.querySelector('a')?.dataset.key).toBe('Search')
  stop()
  expect(input.placeholder).toBe('Search')
})
it('更新提示或移除属性后不恢复陈旧值；新增控件支持双语', async () => {
  document.body.innerHTML = '<dialog><textarea placeholder="Search"></textarea></dialog>'
  stop = attachAttributeLayer(document, lex, true)
  const area = document.querySelector('textarea') as HTMLTextAreaElement
  expect(area.placeholder).toBe('搜索 · Search')
  area.placeholder = 'Unknown'
  await settle()
  stop()
  expect(area.placeholder).toBe('Unknown')
  stop = attachAttributeLayer(document, lex)
  area.placeholder = 'Search'
  await settle()
  expect(area.placeholder).toBe('搜索')
  area.removeAttribute('placeholder')
  stop()
  expect(area.hasAttribute('placeholder')).toBe(false)
})
it('不翻译背包用户标签、扩展自身、可编辑内容或不支持的属性', () => {
  document.body.innerHTML =
    '<main><div id="inventoryZone"><div class="tabs"><button title="Search"></button></div></div><div contenteditable><button title="Search"></button></div><div data-poe2-l10n><input placeholder="Search"></div><input type="hidden" title="Search"><div title="Search"></div></main>'
  const before = document.body.innerHTML
  stop = attachAttributeLayer(document, lex)
  expect(document.body.innerHTML).toBe(before)
})
it('新增节点可翻译，移出支持区域后恢复原文', async () => {
  document.body.innerHTML = '<main></main><aside></aside>'
  stop = attachAttributeLayer(document, lex)
  const button = document.createElement('button')
  button.title = 'Search'
  document.querySelector('main')?.append(button)
  await settle()
  expect(button.title).toBe('搜索')
  document.querySelector('aside')?.append(button)
  await settle()
  expect(button.title).toBe('Search')
})
it('重复初始化先撤销旧译文，旧 stop 不会关闭新一轮', () => {
  document.body.innerHTML = '<main><input placeholder="Search"></main>'
  const oldStop = attachAttributeLayer(document, lex)
  stop = attachAttributeLayer(document, lex, true)
  oldStop()
  const input = document.querySelector('input') as HTMLInputElement
  expect(input.placeholder).toBe('搜索 · Search')
  stop()
  expect(input.placeholder).toBe('Search')
})
it('祖先编辑状态和输入类型变化时恢复属性，恢复普通控件后重新翻译', async () => {
  document.body.innerHTML = '<main><section><input placeholder="Search"></section></main>'
  stop = attachAttributeLayer(document, lex)
  const section = document.querySelector('section') as HTMLElement
  const input = document.querySelector('input') as HTMLInputElement
  section.setAttribute('contenteditable', 'true')
  await settle()
  expect(input.placeholder).toBe('Search')
  section.removeAttribute('contenteditable')
  await settle()
  expect(input.placeholder).toBe('搜索')
  input.type = 'hidden'
  await settle()
  expect(input.placeholder).toBe('Search')
})

it('条件图标从已知提示补名称，不改原生提示；动态改名与停用正确清理', async () => {
  document.body.innerHTML =
    '<main><div id="simulatorConditionRequirements"><button class="iconed" tooltip="Search"><img></button></div><button class="iconed" tooltip="Search"></button></main>'
  const button = document.querySelector('button') as HTMLButtonElement
  stop = attachAttributeLayer(document, lex, true)
  expect(button.getAttribute('aria-label')).toBe('搜索 · Search')
  expect(button.getAttribute('tooltip')).toBe('Search')
  expect(document.querySelector('main > button')?.hasAttribute('aria-label')).toBe(false)
  button.setAttribute('tooltip', 'Unknown')
  await settle()
  expect(button.hasAttribute('aria-label')).toBe(false)
  button.setAttribute('tooltip', 'Search')
  await settle()
  expect(button.getAttribute('aria-label')).toBe('搜索 · Search')
  stop()
  expect(button.hasAttribute('aria-label')).toBe(false)
})
it('补充的条件图标名称让位于原站后来的名称和可见文字', async () => {
  document.body.innerHTML =
    '<main><div id="simulatorConditionRequirements"><button class="iconed" tooltip="Search"></button></div></main>'
  const button = document.querySelector('button') as HTMLButtonElement
  stop = attachAttributeLayer(document, lex)
  expect(button.getAttribute('aria-label')).toBe('搜索')
  button.setAttribute('aria-label', 'Native action')
  await settle()
  expect(button.getAttribute('aria-label')).toBe('Native action')
  button.removeAttribute('aria-label')
  await settle()
  expect(button.getAttribute('aria-label')).toBe('搜索')
  button.textContent = 'Visible action'
  await settle()
  expect(button.hasAttribute('aria-label')).toBe(false)
  stop()
  expect(button.textContent).toBe('Visible action')
})
