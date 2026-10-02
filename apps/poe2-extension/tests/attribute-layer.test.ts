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

it('图片替代文本动态增加或清空时重新判断名称来源，名称引用优先', async () => {
  document.body.innerHTML =
    '<main><div id="calculatorZone"><div class="requirements"><button class="iconed" tooltip="Search"><img></button></div></div><span id="native-name">Native action</span></main>'
  const button = document.querySelector('button') as HTMLButtonElement
  const image = document.querySelector('img') as HTMLImageElement
  stop = attachAttributeLayer(document, lex)
  expect(button.getAttribute('aria-label')).toBe('搜索')
  image.alt = 'Native icon action'
  await settle()
  expect(button.hasAttribute('aria-label')).toBe(false)
  expect(image.alt).toBe('Native icon action')
  image.alt = ''
  await settle()
  expect(button.getAttribute('aria-label')).toBe('搜索')
  button.setAttribute('aria-labelledby', 'native-name')
  await settle()
  expect(button.hasAttribute('aria-label')).toBe(false)
  button.removeAttribute('aria-labelledby')
  await settle()
  expect(button.getAttribute('aria-label')).toBe('搜索')
  stop()
  expect(button.hasAttribute('aria-label')).toBe(false)
  expect(image.getAttribute('alt')).toBe('')
})

it('已识别的空名搜索框按用途补双语名称，保留值并在停用时撤下', () => {
  document.body.innerHTML = `<main>
    <div id="dataItemSearchInput"><input placeholder=" " value="中文查询"></div>
    <div id="dataModSearchInput"><input></div>
    <div id="searchItemInput"><input></div>
    <div id="customPriceSearchHolder"><div id="searchInput"><input type="text"></div></div>
    <input id="notes">
  </main>`
  stop = attachAttributeLayer(document, lex, true)
  const inputs = [...document.querySelectorAll('input')]
  expect(inputs.map((input) => input.getAttribute('aria-label'))).toEqual([
    '搜索物品 · Search items',
    '搜索词缀 · Search modifiers',
    '搜索制作基底 · Search crafting bases',
    '搜索制作材料价格 · Search crafting prices',
    null,
  ])
  expect(inputs[0]?.value).toBe('中文查询')
  expect(inputs[0]?.placeholder).toBe(' ')
  stop()
  expect(inputs.every((input) => !input.hasAttribute('aria-label'))).toBe(true)
})
it('搜索补充名称随原生关联标签、提示和身份变化撤下或恢复', async () => {
  document.body.innerHTML = '<main><div id="dataItemSearchInput"><input id="query"></div></main>'
  const input = document.querySelector('input') as HTMLInputElement
  stop = attachAttributeLayer(document, lex)
  expect(input.getAttribute('aria-label')).toBe('搜索物品')
  const label = document.createElement('label')
  label.htmlFor = 'query'
  label.textContent = 'Native label'
  document.querySelector('main')?.append(label)
  await settle()
  expect(input.hasAttribute('aria-label')).toBe(false)
  label.htmlFor = 'other'
  await settle()
  expect(input.getAttribute('aria-label')).toBe('搜索物品')
  input.placeholder = 'Native placeholder'
  await settle()
  expect(input.hasAttribute('aria-label')).toBe(false)
  input.placeholder = ' '
  input.setAttribute('aria-label', 'Native override')
  await settle()
  expect(input.getAttribute('aria-label')).toBe('Native override')
  input.removeAttribute('aria-label')
  await settle()
  expect(input.getAttribute('aria-label')).toBe('搜索物品')
  input.parentElement?.removeAttribute('id')
  await settle()
  expect(input.hasAttribute('aria-label')).toBe(false)
})
it('原生命名优先，输入禁用与重新启用会重新判断搜索名称', async () => {
  document.body.innerHTML = `<main><fieldset><div id="dataItemSearchInput">
    <input id="plain"><input title="Native title"><input aria-labelledby="native">
    <label>Native implicit label<input></label>
  </div></fieldset></main>`
  const input = document.querySelector('#plain') as HTMLInputElement
  stop = attachAttributeLayer(document, lex)
  expect(input.getAttribute('aria-label')).toBe('搜索物品')
  expect(
    [...document.querySelectorAll('input')].slice(1).every((e) => !e.hasAttribute('aria-label')),
  ).toBe(true)
  input.disabled = true
  await settle()
  expect(input.hasAttribute('aria-label')).toBe(false)
  input.disabled = false
  await settle()
  expect(input.getAttribute('aria-label')).toBe('搜索物品')
})

it('条件编辑容器改变用途时撤下搜索名称，恢复编辑后重新补充', async () => {
  document.body.innerHTML =
    '<main><div id="simulatorConditionRequirements"><div class="dropdown"><div class="editing"><input type="text"></div></div></div></main>'
  const input = document.querySelector('input') as HTMLInputElement
  const editing = document.querySelector('.editing') as HTMLElement
  const dropdown = document.querySelector('.dropdown') as HTMLElement
  stop = attachAttributeLayer(document, lex)
  expect(input.getAttribute('aria-label')).toBe('搜索条件')
  editing.classList.remove('editing')
  await settle()
  expect(input.hasAttribute('aria-label')).toBe(false)
  editing.classList.add('editing')
  await settle()
  expect(input.getAttribute('aria-label')).toBe('搜索条件')
  dropdown.classList.remove('dropdown')
  await settle()
  expect(input.hasAttribute('aria-label')).toBe(false)
  dropdown.classList.add('dropdown')
  await settle()
  expect(input.getAttribute('aria-label')).toBe('搜索条件')
})
it('条件图标与计算器条件区域移除识别类时撤下名称，重加后恢复', async () => {
  document.body.innerHTML =
    '<main><div id="calculatorZone"><div class="requirements"><button class="iconed" tooltip="Search"></button></div></div></main>'
  const button = document.querySelector('button') as HTMLButtonElement
  const region = document.querySelector('.requirements') as HTMLElement
  stop = attachAttributeLayer(document, lex)
  expect(button.getAttribute('aria-label')).toBe('搜索')
  for (const [element, name] of [
    [button, 'iconed'],
    [region, 'requirements'],
  ] as const) {
    element.classList.remove(name)
    await settle()
    expect(button.hasAttribute('aria-label')).toBe(false)
    element.classList.add(name)
    await settle()
    expect(button.getAttribute('aria-label')).toBe('搜索')
  }
})
