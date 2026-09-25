import { createLexicon } from '@poe2-tools/l10n-core'
import { afterEach, expect, it } from 'vitest'
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
afterEach(() => {
  stop()
  document.body.innerHTML = ''
})
function setup() {
  document.body.innerHTML = '<main><div id="searchItemInput"><input></div><input id="notes"></main>'
  const input = document.querySelector('input') as HTMLInputElement
  const submitted: string[] = []
  stop = attachSearch(document, lex)
  input.addEventListener('keyup', () => submitted.push(input.value))
  return { input, submitted }
}
function type(input: HTMLInputElement, text: string) {
  input.value = text
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new KeyboardEvent('keyup', { key: 'a', bubbles: true }))
}
it('中文精确候选经选择后触发一次英文查询，保留查询提示', () => {
  const { input, submitted } = setup()
  type(input, '符文法器')
  expect(submitted).toEqual([])
  const button = document.querySelector<HTMLButtonElement>('[data-poe2-l10n] button')
  expect(button?.textContent).toContain('Runed Focus')
  button?.click()
  expect(input.value).toBe('Runed Focus')
  expect(submitted).toEqual(['Runed Focus'])
  expect(document.querySelector('[data-poe2-l10n]')?.textContent).toContain('符文法器')
})
it('输入法组词不展示或提交中间值，结束后才给候选', () => {
  const { input, submitted } = setup()
  input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
  type(input, '符文')
  expect(document.querySelector('[data-poe2-l10n] button')).toBeNull()
  input.value = '符文法器'
  input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))
  expect(document.querySelector('[data-poe2-l10n] button')).not.toBeNull()
  expect(submitted).toEqual([])
})
it('后续未知词清除旧候选；清空和英文交还原站；Escape 取消', () => {
  const { input, submitted } = setup()
  type(input, '符文')
  const old = document.querySelector<HTMLButtonElement>('[data-poe2-l10n] button')
  type(input, '不存在')
  old?.click()
  expect(input.value).toBe('不存在')
  expect(document.querySelector('[data-poe2-l10n]')?.textContent).toContain('未找到')
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  expect(document.querySelector('[data-poe2-l10n]')).toBeNull()
  type(input, '')
  type(input, 'Runed')
  expect(submitted).toEqual(['', 'Runed'])
})
it('备注输入和移除后的控件不被处理；关闭移除候选', () => {
  const { input } = setup()
  const notes = document.querySelector('#notes') as HTMLInputElement
  type(notes, '符文法器')
  expect(document.querySelector('[data-poe2-l10n]')).toBeNull()
  type(input, '符文')
  stop()
  expect(document.querySelector('[data-poe2-l10n]')).toBeNull()
  expect(input.value).toBe('符文')
})
it('ArrowUp 从输入框进入最后一个候选，Escape 返回输入框且不提交', () => {
  document.body.innerHTML = '<main><div id="searchItemInput"><input></div></main>'
  const input = document.querySelector('input') as HTMLInputElement
  const terms = ['甲', '乙', '丙'].map((name, i) => ({
    id: String(i),
    en: `Focus ${i}`,
    zh: `法器${name}`,
    domain: 'base' as const,
    source: 'test',
    version: 'test',
  }))
  stop = attachSearch(document, createLexicon(terms))
  input.focus()
  type(input, '法器')
  input.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }),
  )
  const buttons = [...document.querySelectorAll('[data-poe2-l10n] button')]
  expect(document.activeElement).toBe(buttons.at(-1))
  document.activeElement?.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
  )
  expect(document.activeElement).toBe(input)
  expect(input.value).toBe('法器')
})
it('唯一精确候选支持在输入框按 Enter 执行；输入法 Enter 不提交', () => {
  const { input, submitted } = setup()
  type(input, '符文法器')
  input.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'Enter',
      isComposing: true,
      bubbles: true,
      cancelable: true,
    }),
  )
  expect(submitted).toEqual([])
  const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
  input.dispatchEvent(enter)
  expect(enter.defaultPrevented).toBe(true)
  expect(submitted).toEqual(['Runed Focus'])
})
it('部分词 Enter 不擅自选择候选，方向键与 Escape 不冒泡到原站快捷键', () => {
  const { input, submitted } = setup()
  const keys: string[] = []
  input.addEventListener('keydown', (e) => keys.push(e.key))
  type(input, '符文')
  input.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
  )
  expect(submitted).toEqual([])
  input.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
  )
  document.activeElement?.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
  )
  expect(keys).toEqual([])
  expect(document.activeElement).toBe(input)
})
it('原站移除搜索框后撤下候选，重新插入旧框也不能提交旧选择', async () => {
  const { input, submitted } = setup()
  type(input, '符文')
  const parent = input.parentElement as HTMLElement
  const old = document.querySelector<HTMLButtonElement>('[data-poe2-l10n] button')
  input.remove()
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(document.querySelector('[data-poe2-l10n]')).toBeNull()
  parent.prepend(input)
  old?.click()
  expect(submitted).toEqual([])
})
it('焦点在候选内移动时保留面板，离开查询区域后撤下且不抢焦点', () => {
  const { input } = setup()
  input.focus()
  type(input, '符文')
  const button = document.querySelector<HTMLButtonElement>('[data-poe2-l10n] button')
  button?.focus()
  expect(document.querySelector('[data-poe2-l10n]')).not.toBeNull()
  const notes = document.querySelector('#notes') as HTMLInputElement
  notes.focus()
  expect(document.querySelector('[data-poe2-l10n]')).toBeNull()
  expect(document.activeElement).toBe(notes)
})
it('原站同步替换控件时不把英文查询提示留在旧容器', () => {
  const { input } = setup()
  const parent = input.parentElement as HTMLElement
  input.addEventListener('keyup', () => input.remove())
  type(input, '符文')
  document.querySelector<HTMLButtonElement>('[data-poe2-l10n] button')?.click()
  expect(parent.querySelector('[data-poe2-l10n]')).toBeNull()
})
it('原站移动搜索框后撤下旧容器候选，新的中文输入仍可使用', async () => {
  const { input, submitted } = setup()
  type(input, '符文')
  const next = document.createElement('div')
  next.id = 'dataItemSearchInput'
  document.querySelector('main')?.append(next)
  next.append(input)
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(document.querySelector('[data-poe2-l10n]')).toBeNull()
  type(input, '符文法器')
  next.querySelector<HTMLButtonElement>('button')?.click()
  expect(submitted).toEqual(['Runed Focus'])
})
it('返回仍含中文的搜索框时重建候选，不提交查询且不复用旧按钮', () => {
  const { input, submitted } = setup()
  input.focus()
  type(input, '符文法器')
  const old = document.querySelector<HTMLButtonElement>('[data-poe2-l10n] button')
  ;(document.querySelector('#notes') as HTMLInputElement).focus()
  input.focus()
  const current = document.querySelector<HTMLButtonElement>('[data-poe2-l10n] button')
  expect(current).not.toBeNull()
  expect(current).not.toBe(old)
  expect(document.activeElement).toBe(input)
  expect(submitted).toEqual([])
  old?.click()
  expect(submitted).toEqual([])
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  expect(submitted).toEqual(['Runed Focus'])
})
it('候选 Escape 返回输入框后保持关闭，重新聚焦才恢复；英文不自动转换', () => {
  const { input, submitted } = setup()
  input.focus()
  type(input, '符文')
  const button = document.querySelector<HTMLButtonElement>('[data-poe2-l10n] button')
  button?.focus()
  button?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  expect(document.activeElement).toBe(input)
  expect(document.querySelector('[data-poe2-l10n]')).toBeNull()
  const notes = document.querySelector('#notes') as HTMLInputElement
  notes.focus()
  input.focus()
  expect(document.querySelector('[data-poe2-l10n] button')).not.toBeNull()
  type(input, 'Runed Focus')
  notes.focus()
  input.focus()
  expect(document.querySelector('[data-poe2-l10n]')).toBeNull()
  expect(submitted).toEqual(['Runed Focus'])
})

it('模拟器条件仅提供当前下拉框存在的术语，键盘选择保持输入焦点并恢复原属性', () => {
  document.body.innerHTML = `<main><div id="simulatorConditionRequirements"><div class="dropdown editing"><label><div class="editing"><div><input type="text" aria-label="原站条件"></div></div></label><ul><li search="metanumber of affixes"></li></ul></div></div><input id="notes"></main>`
  const input = document.querySelector('input') as HTMLInputElement
  const conditionLex = createLexicon([
    {
      id: 'count',
      en: 'Number of Affixes',
      zh: '词缀数量',
      domain: 'ui',
      source: 'test',
      version: 'test',
    },
    {
      id: 'other',
      en: 'Unavailable stat',
      zh: '词缀数量之外',
      domain: 'stat',
      source: 'test',
      version: 'test',
    },
  ])
  stop = attachSearch(document, conditionLex)
  const submitted: string[] = []
  input.addEventListener('keyup', () => submitted.push(input.value))
  let blurred = false
  input.addEventListener('blur', () => {
    blurred = true
  })
  input.focus()
  type(input, '词缀')
  const buttons = document.querySelectorAll<HTMLButtonElement>('[data-poe2-l10n] button')
  expect(buttons).toHaveLength(1)
  input.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
  )
  expect(document.activeElement).toBe(input)
  expect(blurred).toBe(false)
  expect(input.getAttribute('aria-activedescendant')).toBe(buttons[0]?.id)
  expect(buttons[0]?.getAttribute('aria-selected')).toBe('true')
  input.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
  )
  expect(submitted).toEqual(['Number of Affixes'])
  expect(input.hasAttribute('aria-activedescendant')).toBe(false)
  expect(input.hasAttribute('role')).toBe(false)
  expect(input.getAttribute('aria-label')).toBe('原站条件')
})

it('条件候选鼠标操作不触发原站失焦，候选已从原站删除时不提交', () => {
  document.body.innerHTML = `<main><div id="simulatorConditionRequirements"><div class="dropdown editing"><div class="editing"><div><input type="text"></div></div><ul><li search="metanumber of affixes"></li></ul></div></div></main>`
  const input = document.querySelector('input') as HTMLInputElement
  stop = attachSearch(
    document,
    createLexicon([
      {
        id: 'count',
        en: 'Number of Affixes',
        zh: '词缀数量',
        domain: 'ui',
        source: 'test',
        version: 'test',
      },
    ]),
  )
  input.focus()
  type(input, '词缀数量')
  const button = document.querySelector<HTMLButtonElement>('[data-poe2-l10n] button')
  const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
  button?.dispatchEvent(down)
  expect(down.defaultPrevented).toBe(true)
  document.querySelector('li')?.remove()
  button?.click()
  expect(input.value).toBe('词缀数量')
  expect(document.querySelector('[data-poe2-l10n] button')).toBeNull()
  stop()
  expect(input.hasAttribute('aria-controls')).toBe(false)
  expect(input.hasAttribute('role')).toBe(false)
})

it('制作页仅在计算条件区域启用中文候选，离开时清理且不接管其他下拉框', () => {
  document.body.innerHTML = `<main><div id="calculatorZone"><div class="requirements"><div class="dropdown editing"><div class="editing"><div><input type="text" id="condition"></div></div><ul><li search="metanumber of affixes"></li></ul></div></div><div class="dropdown editing"><div class="editing"><input type="text" id="other"></div><ul><li search="metanumber of affixes"></li></ul></div></div></main>`
  stop = attachSearch(
    document,
    createLexicon([
      {
        id: 'count',
        en: 'Number of Affixes',
        zh: '词缀数量',
        domain: 'ui',
        source: 'test',
        version: 'test',
      },
    ]),
  )
  const input = document.querySelector('#condition') as HTMLInputElement
  const other = document.querySelector('#other') as HTMLInputElement
  input.focus()
  type(input, '词缀数量')
  expect(document.querySelector('[data-poe2-l10n] button')?.textContent).toContain(
    'Number of Affixes',
  )
  input.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
  )
  expect(document.querySelector('[data-poe2-l10n]')).toBeNull()
  expect(input.hasAttribute('aria-controls')).toBe(false)
  other.focus()
  type(other, '词缀数量')
  expect(document.querySelector('[data-poe2-l10n]')).toBeNull()
})

it('先限定原站条件选项再截取候选，不能让无关词条挤掉有效结果', () => {
  document.body.innerHTML =
    '<main><div id="calculatorZone"><div class="requirements"><div class="dropdown editing"><div class="editing"><input type="text"></div><ul><li search="#% to lightning resistance"></li></ul></div></div></div></main>'
  const noise = Array.from({ length: 60 }, (_, i) => ({
    id: `noise-${i}`,
    en: `Unavailable ${i}`,
    zh: `抗性${i}`,
    domain: 'stat' as const,
    source: 'test',
    version: 'test',
  }))
  stop = attachSearch(
    document,
    createLexicon([
      ...noise,
      {
        id: 'lightning',
        en: '#% to Lightning Resistance',
        zh: '闪电抗性提高 #% ',
        domain: 'stat',
        source: 'test',
        version: 'test',
      },
    ]),
  )
  const input = document.querySelector('input') as HTMLInputElement
  type(input, '抗性')
  const buttons = document.querySelectorAll<HTMLButtonElement>('[data-poe2-l10n] button')
  expect(buttons).toHaveLength(1)
  expect(buttons[0]?.textContent).toContain('#% to Lightning Resistance')
  buttons[0]?.click()
  expect(input.value).toBe('#% to Lightning Resistance')
})

it.each(['readOnly', 'disabled'] as const)(
  '控件变为 %s 后旧候选不能写入，且不再提供候选',
  async (property) => {
    const { input, submitted } = setup()
    type(input, '符文法器')
    const old = document.querySelector<HTMLButtonElement>('[data-poe2-l10n] button')
    input[property] = true
    old?.click()
    expect(input.value).toBe('符文法器')
    expect(submitted).toEqual([])
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(document.querySelector('[data-poe2-l10n]')).toBeNull()
    type(input, '符文')
    expect(document.querySelector('[data-poe2-l10n]')).toBeNull()
    input[property] = false
    type(input, '符文法器')
    document.querySelector<HTMLButtonElement>('[data-poe2-l10n] button')?.click()
    expect(input.value).toBe('Runed Focus')
  },
)

it('控件移出搜索区域后即使观察器尚未执行也不能提交旧候选', () => {
  const { input, submitted } = setup()
  type(input, '符文法器')
  const old = document.querySelector<HTMLButtonElement>('[data-poe2-l10n] button')
  document.querySelector('main')?.append(input)
  old?.click()
  expect(input.value).toBe('符文法器')
  expect(submitted).toEqual([])
})

it('条件下拉框隐藏后自动撤下候选并归还辅助属性', async () => {
  document.body.innerHTML =
    '<main><div id="calculatorZone"><div class="requirements"><div class="dropdown"><div class="editing"><input type="text"></div><li search="Runed Focus"></li></div></div></div></main>'
  stop = attachSearch(
    document,
    createLexicon([
      {
        id: 'condition',
        en: 'Runed Focus',
        zh: '符文法器',
        domain: 'stat',
        source: 'test',
        version: 'test',
      },
    ]),
  )
  const input = document.querySelector('input') as HTMLInputElement
  type(input, '符文法器')
  expect(input.getAttribute('role')).toBe('combobox')
  await new Promise((resolve) => setTimeout(resolve, 0))
  document.querySelector('.dropdown')?.classList.add('hidden')
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(document.querySelector('[data-poe2-l10n]')).toBeNull()
  expect(input.hasAttribute('role')).toBe(false)
})

it('Data 物品搜索支持材料名称，制作基底搜索仍隔离材料', () => {
  const materials = createLexicon([
    { id: 'orb', en: 'Exalted Orb', zh: '崇高石', domain: 'item', source: 'test', version: 'test' },
  ])
  document.body.innerHTML =
    '<div id="dataItemSearchInput"><input></div><div id="searchItemInput"><input></div>'
  stop = attachSearch(document, materials)
  const data = document.querySelector('#dataItemSearchInput input') as HTMLInputElement
  const crafting = document.querySelector('#searchItemInput input') as HTMLInputElement
  type(data, '崇高石')
  const candidate = document.querySelector<HTMLButtonElement>('[data-poe2-l10n] button')
  expect(candidate?.textContent).toContain('Exalted Orb')
  candidate?.click()
  expect(data.value).toBe('Exalted Orb')
  type(crafting, '崇高石')
  expect(document.querySelector('[data-poe2-l10n] button')).toBeNull()
})

it('Data 跨领域按名称相关性统一排序，不让大量基底挤掉短材料名称', () => {
  const mixed = createLexicon([
    ...Array.from({ length: 55 }, (_, i) => ({
      id: `base-${i}`,
      en: `Runic Base ${i}`,
      zh: `符文长名称基底${i}`,
      domain: 'base' as const,
      source: 'test',
      version: 'test',
    })),
    {
      id: 'rune',
      en: 'Body Rune',
      zh: '身躯符文',
      domain: 'item',
      source: 'test',
      version: 'test',
    },
  ])
  document.body.innerHTML = '<div id="dataItemSearchInput"><input></div>'
  stop = attachSearch(document, mixed)
  const input = document.querySelector('input') as HTMLInputElement
  type(input, '符文')
  const buttons = [...document.querySelectorAll('[data-poe2-l10n] button')]
  expect(buttons).toHaveLength(50)
  expect(buttons[0]?.textContent).toContain('Body Rune')
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
  expect(document.activeElement).toBe(buttons[0])
  ;(buttons[0] as HTMLButtonElement).click()
  expect(input.value).toBe('Body Rune')
})
it('价格搜索复用searchInput时查询材料，制作词缀与价格数值保持各自语义', () => {
  const shared = createLexicon([
    { id: 'orb', en: 'Exalted Orb', zh: '崇高石', domain: 'item', source: 'test', version: 'test' },
    {
      id: 'trial',
      en: 'Sacrifice up to # Exalted Orbs',
      zh: '献祭最多 # 崇高石',
      domain: 'stat',
      source: 'test',
      version: 'test',
    },
  ])
  document.body.innerHTML =
    '<main><div id="customPriceSearchHolder"><div id="searchInput"><input type="text"></div><input type="number" value="12.5"></div></main>'
  const input = document.querySelector('input[type=text]') as HTMLInputElement
  const price = document.querySelector('input[type=number]') as HTMLInputElement
  const submitted: string[] = []
  stop = attachSearch(document, shared)
  input.addEventListener('keyup', () => submitted.push(input.value))
  type(input, '崇高石')
  const buttons = [
    ...document.querySelectorAll<HTMLButtonElement>('[data-poe2-l10n=search] button'),
  ]
  expect(buttons.map((b) => b.textContent)).toEqual(['崇高石 → Exalted Orb'])
  buttons[0]?.click()
  expect(submitted).toEqual(['Exalted Orb'])
  expect(price.value).toBe('12.5')
  // 同一ID离开价格容器后仍是原制作词缀用途，不能全局改为材料。
  document.querySelector('main')?.append(input.parentElement as HTMLElement)
  type(input, '崇高石')
  expect(document.querySelector('[data-poe2-l10n=search] button')?.textContent).toContain(
    'Sacrifice',
  )
  price.dispatchEvent(new Event('input', { bubbles: true }))
  expect(price.value).toBe('12.5')
})
