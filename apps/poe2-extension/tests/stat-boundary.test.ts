import { afterEach, expect, it } from 'vitest'
import { createGameLexicon } from '../../../packages/l10n-core/src/stats'
import { attachStatLayer } from '../src/content/stat-layer'
import { attachTextLayer } from '../src/content/text-layer'

const lex = createGameLexicon([
  { id: 'ui', en: 'Armour', zh: '护甲', domain: 'ui', source: 'test', version: 'test' },
  {
    id: 'stat',
    en: '#% increased Armour',
    zh: '护甲提高 #%',
    domain: 'stat',
    source: 'test',
    version: 'test',
  },
])
const stops: (() => void)[] = []
const settle = () => new Promise((r) => setTimeout(r, 20))
afterEach(() => {
  for (const stop of stops.splice(0).reverse()) stop()
  document.body.innerHTML = ''
})

it('词缀结构尚未识别时仍保护完整语义区域，关键词不能被 UI 层局部翻译', () => {
  document.body.innerHTML =
    '<main><div class="modGroup"><div class="futureStat">Unknown <span class="keyword">Armour</span> condition</div><span class="modTag">Armour</span></div><div class="modifierTable"><div class="row"><div class="label"><div class="futureStat">Unknown <span>Armour</span> effect</div></div></div></div><button>Armour</button></main>'
  stops.push(attachTextLayer(document, lex))
  stops.push(attachStatLayer(document, lex))
  expect([...document.querySelectorAll('.futureStat')].map((e) => e.textContent)).toEqual([
    'Unknown Armour condition',
    'Unknown Armour effect',
  ])
  expect(document.querySelector('button')?.textContent).toBe('护甲')
  expect(document.querySelector('.modTag')?.textContent).toBe('护甲')
})

it('动态进入语义边界先恢复原文，随后识别、重建、克隆和停用均不污染原文', async () => {
  document.body.innerHTML = '<main><section><span>Armour</span></section></main>'
  const section = document.querySelector('section') as HTMLElement
  stops.push(attachTextLayer(document, lex))
  stops.push(attachStatLayer(document, lex))
  expect(section.textContent).toBe('护甲')
  section.className = 'modGroup'
  await settle()
  expect(section.textContent).toBe('Armour')
  section.innerHTML = '<div class="stat">20% increased <span class="keyword">Armour</span></div>'
  await settle()
  expect(section.querySelector('.stat')?.textContent).toBe('20% increased Armour')
  expect(section.querySelector('[data-poe2-l10n]')?.shadowRoot?.textContent).toBe('护甲提高 20%')
  const clone = section.cloneNode(true) as HTMLElement
  document.querySelector('main')?.append(clone)
  await settle()
  expect(clone.querySelectorAll('[data-poe2-l10n="stat"]')).toHaveLength(1)
  expect(clone.querySelector('.stat')?.textContent).toBe('20% increased Armour')
  for (const stop of stops.splice(0).reverse()) stop()
  expect(document.querySelector('[data-poe2-l10n]')).toBeNull()
  expect(
    [...document.querySelectorAll('.stat')].every((e) => e.textContent === '20% increased Armour'),
  ).toBe(true)
})

it('未译整句留下本地原因，更新为可译后刷新诊断，停用时清理', async () => {
  document.body.innerHTML = '<main><div class="stat">Unknown Armour condition</div></main>'
  const stat = document.querySelector('.stat') as HTMLElement
  const stop = attachStatLayer(document, lex)
  stops.push(stop)
  expect(stat.getAttribute('data-poe2-l10n-stat-status')).toBe('unmatched')
  expect(stat.textContent).toBe('Unknown Armour condition')
  stat.textContent = '20% reduced Armour'
  await settle()
  expect(stat.getAttribute('data-poe2-l10n-stat-status')).toBe('translated')
  expect(stat.nextElementSibling?.shadowRoot?.textContent).toBe('护甲降低 20%')
  stop()
  expect(stat.hasAttribute('data-poe2-l10n-stat-status')).toBe(false)
})

it('制作和 Data 的显式换行保留词边界，但不修改原站节点和复制文本', async () => {
  const terms = createGameLexicon([
    {
      id: 'infusion',
      en: '#% chance when collecting an Elemental Infusion to gain an additional Elemental Infusion of the same type',
      zh: '收集元素灌注时有 #% 的几率额外获得一个同类型的元素灌注',
      domain: 'stat',
      source: 'test',
      version: 'test',
    },
  ])
  const content =
    '<span>(15-25)</span>% chance when collecting an <span class="keyword">Elemental Infusion</span> to gain an<br>additional <span class="keyword">Elemental Infusion</span> of the same type'
  document.body.innerHTML = `<main><div class="modGroup"><div class="stat">${content}</div></div><div class="modifierTable"><div class="row"><div class="label"><div class="text">${content}</div></div></div></div></main>`
  const nodes = [...document.querySelectorAll('.stat, .text')]
  const originals = nodes.map((node) => node.textContent)
  stops.push(attachStatLayer(document, terms))
  for (const node of nodes) {
    expect(node.getAttribute('data-poe2-l10n-stat-status')).toBe('translated')
    expect(node.nextElementSibling?.shadowRoot?.textContent).toBe(
      '收集元素灌注时有 (15-25)% 的几率额外获得一个同类型的元素灌注',
    )
    expect(node.innerHTML).toBe(content)
  }
  expect(nodes.map((node) => node.textContent)).toEqual(originals)
  // 没有显式分隔时仍拒绝猜测连字，且动态移除换行会撤下旧译文。
  nodes[0]?.querySelector('br')?.remove()
  await settle()
  expect(nodes[0]?.getAttribute('data-poe2-l10n-stat-status')).toBe('unmatched')
  expect(nodes[0]?.nextElementSibling).toBeNull()
})

it.each([String.raw`\n`, String.raw`\r\n`])(
  '条件词缀的字面换行 %s 只规范化匹配，不改原文',
  (lineBreak) => {
    document.body.innerHTML = `<main><div class="stat">20% increased${lineBreak}Armour</div></main>`
    const node = document.querySelector('.stat') as HTMLElement
    const original = node.textContent
    stops.push(attachStatLayer(document, lex))
    expect(node.nextElementSibling?.shadowRoot?.textContent).toBe('护甲提高 20%')
    expect(node.textContent).toBe(original)
  },
)

it('未知来源徽标明确显示未知，不猜分类、不改搜索属性', () => {
  document.body.innerHTML =
    '<main><div id="calculatorZone"><div class="requirements"><div class="dropdown"><li search="undefinedsuffix"><div class="influence">undefined</div></li></div></div></div><p>undefined</p></main>'
  stops.push(attachTextLayer(document, lex))
  expect(document.querySelector('.influence')?.textContent).toBe('来源未知')
  expect(document.querySelector('li')?.getAttribute('search')).toBe('undefinedsuffix')
  expect(document.querySelector('p')?.textContent).toBe('undefined')
})
