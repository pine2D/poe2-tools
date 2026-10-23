// CoE 搜索候选浮层的层级、可访问角色与滚动恢复（v4 复盘第 3 组 B3-01、B3-11、B3-12）
import { createLexicon } from '@poe2-tools/l10n-core'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
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
const shown: HTMLElement[] = []
beforeEach(() => {
  // happy-dom 没有 Popover API：替身只记录调用时宿主是否已在文档里
  Object.defineProperty(HTMLElement.prototype, 'showPopover', {
    configurable: true,
    value(this: HTMLElement) {
      if (!this.isConnected) throw new DOMException('not connected', 'InvalidStateError')
      shown.push(this)
    },
  })
})
afterEach(() => {
  stop()
  document.body.innerHTML = ''
  shown.length = 0
  Reflect.deleteProperty(HTMLElement.prototype, 'showPopover')
  vi.restoreAllMocks()
})
function setup() {
  document.body.innerHTML = '<main><div id="searchItemInput"><input></div></main>'
  const input = document.querySelector('input') as HTMLInputElement
  stop = attachSearch(document, lex)
  return input
}
function type(input: HTMLInputElement, text: string) {
  input.value = text
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
const host = () => document.querySelector<HTMLElement>('[data-poe2-l10n="search"]')

it('B3-01：固定候选面板挂到输入框旁后进入顶层，按钮仍是输入框兄弟容器里的文档节点', () => {
  const input = setup()
  type(input, '符文法器')
  const panel = host() as HTMLElement
  expect(panel.parentElement).toBe(input.parentElement)
  expect(panel.getAttribute('popover')).toBe('manual')
  expect(shown).toEqual([panel])
  // 退路：不支持顶层时 z-index 也要高过原站结果卡片的 999
  expect(Number(panel.style.zIndex)).toBeGreaterThan(999)
  expect(panel.querySelector('button')?.getRootNode()).toBe(document)
  // 选择后的“中文查询”提示同样在顶层
  panel.querySelector('button')?.click()
  const hint = host() as HTMLElement
  expect(hint.textContent).toContain('中文查询')
  expect(hint.getAttribute('popover')).toBe('manual')
  expect(shown.at(-1)).toBe(hint)
})

it('B3-01：浏览器不支持或拒绝 showPopover 时不留 popover 属性，面板照常显示', () => {
  Object.defineProperty(HTMLElement.prototype, 'showPopover', {
    configurable: true,
    value() {
      throw new DOMException('denied', 'NotSupportedError')
    },
  })
  const input = setup()
  type(input, '符文法器')
  expect(host()?.hasAttribute('popover')).toBe(false)
  expect(host()?.style.display).toBe('block')
})

it('B3-01：条件搜索的面板在原站下拉内排布，不进入顶层', () => {
  document.body.innerHTML = `<main><div id="simulatorConditionRequirements"><div class="dropdown editing"><label><div class="editing"><div><input type="text"></div></div></label><ul><li search="metanumber of affixes"></li></ul></div></div></main>`
  const input = document.querySelector('input') as HTMLInputElement
  stop = attachSearch(
    document,
    createLexicon([
      { id: 'n', en: 'Number of Affixes', zh: '词缀数量', domain: 'ui', source: 't', version: 't' },
    ]),
  )
  input.focus()
  type(input, '词缀')
  expect(host()?.style.position).toBe('relative')
  expect(host()?.hasAttribute('popover')).toBe(false)
  expect(shown).toEqual([])
})

it('B3-11：普通候选面板是带名称的 group；条件 listbox 内除选项外只有对读屏隐藏的说明行', () => {
  const input = setup()
  type(input, '符文法器')
  expect(host()?.getAttribute('role')).toBe('group')
  expect(host()?.getAttribute('aria-label')).toBe('中文搜索候选')
  stop()
  document.body.innerHTML = `<main><div id="simulatorConditionRequirements"><div class="dropdown editing"><label><div class="editing"><div><input type="text"></div></div></label><ul><li search="metanumber of affixes"></li></ul></div></div></main>`
  const condition = document.querySelector('input') as HTMLInputElement
  stop = attachSearch(
    document,
    createLexicon([
      { id: 'n', en: 'Number of Affixes', zh: '词缀数量', domain: 'ui', source: 't', version: 't' },
    ]),
  )
  condition.focus()
  type(condition, '词缀')
  const list = host() as HTMLElement
  expect(list.getAttribute('role')).toBe('listbox')
  for (const child of list.children)
    if (child.getAttribute('role') !== 'option') {
      expect(child.getAttribute('aria-hidden')).toBe('true')
      expect(child.hasAttribute('role')).toBe(false)
    }
  // 说明行仍由 aria-describedby 直接引用
  const ids = condition.getAttribute('aria-describedby')?.split(/\s+/) ?? []
  expect(ids.some((id) => document.getElementById(id)?.parentElement === list)).toBe(true)
})

it('B3-12：输入框仍聚焦时滚出视口撤下候选，滚回视口重建；失焦后滚回不重建', () => {
  const input = setup()
  let rect = new DOMRect(20, 80, 240, 42)
  input.getBoundingClientRect = () => rect
  input.focus()
  type(input, '符文法器')
  expect(host()?.querySelector('button')).not.toBeNull()
  rect = new DOMRect(20, -60, 240, 42)
  document.dispatchEvent(new Event('scroll'))
  expect(host()).toBeNull()
  rect = new DOMRect(20, 80, 240, 42)
  document.dispatchEvent(new Event('scroll'))
  expect(host()?.querySelector('button')?.getAttribute('aria-label')).toBe('符文法器，Runed Focus')
  expect(input.value).toBe('符文法器')
  rect = new DOMRect(20, -60, 240, 42)
  document.dispatchEvent(new Event('scroll'))
  input.blur()
  rect = new DOMRect(20, 80, 240, 42)
  document.dispatchEvent(new Event('scroll'))
  expect(host()).toBeNull()
})
