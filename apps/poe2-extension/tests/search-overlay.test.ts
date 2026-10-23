// CoE 搜索候选浮层的层级、可访问角色、滚动恢复与候选细节（v4 复盘第 3 组 B3-01、B3-09、B3-11、B3-12）
import { createLexicon, type Term } from '@poe2-tools/l10n-core'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { attachSearch, candidateKind } from '../src/content/search-controller'

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

// ---- B3-09：候选数量、类别与匹配高亮 ----
const multi = createLexicon([
  { id: 'a', en: 'Crystal Focus', zh: '水晶法器', domain: 'base', source: 't', version: 't' },
  {
    id: 'b',
    en: 'Runeforged Crystal Focus',
    zh: '符文水晶法器',
    domain: 'base',
    source: 't',
    version: 't',
  },
])
function setupMulti() {
  document.body.innerHTML = '<main><div id="searchItemInput"><input></div></main>'
  const input = document.querySelector('input') as HTMLInputElement
  stop = attachSearch(document, multi)
  return input
}
const help = (input: HTMLInputElement) =>
  (input.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .map((id) => document.getElementById(id))
    .find((el) => el?.parentElement === host()) as HTMLElement

it('B3-09：说明行显示“N 项”，数量在输入框引用的说明里，不另加描述引用', () => {
  const input = setupMulti()
  type(input, '水晶')
  const label = help(input)
  expect(label).toBeDefined()
  expect(input.getAttribute('aria-describedby')?.split(/\s+/)).toHaveLength(1)
  const count = label.querySelector('[slot="help-count"]')
  expect(count?.textContent).toBe('2 项')
  expect(label.textContent).toContain('方向键')
  // 说明与数量分进两个 slot，排版在说明行自己的 shadow 里
  const slots = [...(label.shadowRoot?.querySelectorAll('slot') ?? [])].map((slot) => slot.name)
  expect(slots).toEqual(['help-text', 'help-count'])
  // 无候选时不显示数量
  type(input, '不存在')
  expect(help(input).querySelector('[slot="help-count"]')).toBeNull()
  expect(help(input).textContent).toContain('未找到术语')
})

it('B3-09：每个候选标出数据类别，用 aria-describedby 引用；可访问名称仍是完整中英文', () => {
  const input = setupMulti()
  type(input, '水晶')
  const buttons = [...(host()?.querySelectorAll('button') ?? [])]
  expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual([
    '水晶法器，Crystal Focus',
    '符文水晶法器，Runeforged Crystal Focus',
  ])
  for (const button of buttons) {
    const kind = document.getElementById(button.getAttribute('aria-describedby') ?? '')
    expect(kind?.textContent).toBe('基底')
    expect(button.contains(kind)).toBe(true)
    expect(kind?.getAttribute('slot')).toBe('candidate-kind')
  }
})

it('B3-09：类别取自词条数据，不编造', () => {
  const term = (domain: Term['domain'], id = 'x') => ({
    id,
    en: 'X',
    zh: '某',
    domain,
    source: 't',
    version: 't',
  })
  expect(candidateKind(term('base'))).toBe('基底')
  expect(candidateKind(term('stat'))).toBe('词缀')
  expect(candidateKind(term('item'))).toBe('物品')
  expect(candidateKind(term('ui', 'affix-name:x'))).toBe('词缀名称')
  expect(candidateKind(term('ui', 'ui-label:x'))).toBe('词缀分类')
  expect(candidateKind(term('ui', 'ui:Number of Affixes'))).toBe('条件')
  // 搜索不会出现的域不给类别
  expect(candidateKind(term('gem'))).toBeNull()
})

it('B3-09：名称里与输入相同的字成段加重，拼起来仍是完整名称', () => {
  const input = setupMulti()
  type(input, '水晶 器')
  const button = [...(host()?.querySelectorAll('button') ?? [])][1] as HTMLButtonElement
  const pieces = [...button.querySelectorAll<HTMLElement>('[slot="candidate-zh"]')]
  expect(pieces.map((piece) => piece.textContent).join('')).toBe('符文水晶法器')
  expect(
    pieces.filter((piece) => piece.hasAttribute('data-hit')).map((p) => p.textContent),
  ).toEqual(['水晶', '器'])
  expect(button.getAttribute('aria-label')).toBe('符文水晶法器，Runeforged Crystal Focus')
})

it('B3-09：条件 listbox 内说明行（含数量）仍对读屏隐藏，类别作选项描述', () => {
  document.body.innerHTML = `<main><div id="simulatorConditionRequirements"><div class="dropdown editing"><label><div class="editing"><div><input type="text"></div></div></label><ul><li search="metanumber of affixes"></li></ul></div></div></main>`
  const input = document.querySelector('input') as HTMLInputElement
  stop = attachSearch(
    document,
    createLexicon([
      {
        id: 'ui:n',
        en: 'Number of Affixes',
        zh: '词缀数量',
        domain: 'ui',
        source: 't',
        version: 't',
      },
    ]),
  )
  input.focus()
  type(input, '词缀')
  const label = help(input)
  expect(label.getAttribute('aria-hidden')).toBe('true')
  expect(label.querySelector('[slot="help-count"]')?.textContent).toBe('1 项')
  const option = host()?.querySelector('[role="option"]') as HTMLElement
  expect(document.getElementById(option.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
    '条件',
  )
})

it('B3-09：固定面板至少 360px 宽（视口允许时），不再等于窄输入框', () => {
  const input = setupMulti()
  input.getBoundingClientRect = () => new DOMRect(20, 80, 240, 42)
  type(input, '水晶')
  expect(host()?.style.width).toBe('360px')
})
