import { createLexicon } from '@poe2-tools/l10n-core'
import { afterEach, expect, it } from 'vitest'
import { attachStatLayer } from '../src/content/stat-layer'
import { attachTextLayer } from '../src/content/text-layer'

const lex = createLexicon([
  {
    id: 'r',
    en: '#% to Lightning Resistance',
    zh: '闪电抗性 #%',
    domain: 'stat',
    source: 'test',
    version: 'test',
  },
])
let stop = () => {}
afterEach(() => {
  stop()
  document.body.innerHTML = ''
})
it('分段词缀保留原站文本、关键词节点和监听，仅叠加中文', async () => {
  document.body.innerHTML =
    '<main><div><span class="stat">+#% to <span id="keyword">Lightning Resistance</span></span></div></main>'
  const stat = document.querySelector('.stat') as HTMLElement
  const keyword = document.querySelector('#keyword')
  stop = attachStatLayer(document, lex)
  expect(stat.textContent).toBe('+#% to Lightning Resistance')
  expect(document.querySelector('#keyword')).toBe(keyword)
  expect(document.querySelector('[data-poe2-l10n="stat"]')?.shadowRoot?.textContent).toContain(
    '闪电抗性 +#%',
  )
  const textNode = stat.firstChild as Text
  textNode.textContent = '+20% to '
  await new Promise((r) => setTimeout(r, 30))
  expect(document.querySelector('[data-poe2-l10n="stat"]')?.shadowRoot?.textContent).toContain(
    '闪电抗性 +20%',
  )
  stop()
  expect(document.querySelector('[data-poe2-l10n="stat"]')).toBeNull()
  expect(stat.textContent).toBe('+20% to Lightning Resistance')
})
it('仍连接的词缀移动到另一容器时，中文层随行且关闭可清理', async () => {
  document.body.innerHTML =
    '<main><div id="a"><span class="stat">+18% to Lightning Resistance</span></div><div id="b"></div></main>'
  const stat = document.querySelector('.stat') as HTMLElement
  stop = attachStatLayer(document, lex)
  document.querySelector('#b')?.append(stat)
  await new Promise((r) => setTimeout(r, 30))
  expect(document.querySelector('#a [data-poe2-l10n]')).toBeNull()
  expect(stat.nextElementSibling?.shadowRoot?.textContent).toContain('闪电抗性 +18%')
  stat.textContent = '+20% to Lightning Resistance'
  await new Promise((r) => setTimeout(r, 30))
  expect(stat.nextElementSibling?.shadowRoot?.textContent).toContain('闪电抗性 +20%')
  stop()
  expect(document.querySelector('[data-poe2-l10n]')).toBeNull()
})
it('Data 分段词缀保留数值、关键词与筛选文本，独立显示中文', async () => {
  document.body.innerHTML =
    '<main><div class="modifierTable"><div class="row"><div class="key">Example</div><div class="label"><div class="flex"><div class="text">+<span class="modValue"><span class="range">(6-10)</span></span>% to <span class="keyword">Lightning Resistance</span></div><span class="modTag">Lightning</span></div></div></div></div></main>'
  const text = document.querySelector('.label .text') as HTMLElement
  const keyword = text.querySelector('.keyword')
  const row = document.querySelector('.row') as HTMLElement
  const original = row.textContent
  stop = attachStatLayer(document, lex)
  expect(text.nextElementSibling?.shadowRoot?.textContent).toBe('闪电抗性 +(6-10)%')
  expect(text.querySelector('.keyword')).toBe(keyword)
  expect(row.textContent).toBe(original)
  const range = text.querySelector('.range') as HTMLElement
  range.textContent = '(11-15)'
  await new Promise((r) => setTimeout(r, 30))
  expect(text.nextElementSibling?.shadowRoot?.textContent).toBe('闪电抗性 +(11-15)%')
  row.remove()
  await new Promise((r) => setTimeout(r, 30))
  expect(row.querySelector('[data-poe2-l10n]')).toBeNull()
})
it('词缀移入非翻译区域后清理旧中文层', async () => {
  document.body.innerHTML =
    '<main><div class="stat">+18% to Lightning Resistance</div></main><aside></aside>'
  stop = attachStatLayer(document, lex)
  document.querySelector('aside')?.append(document.querySelector('.stat') as HTMLElement)
  await new Promise((r) => setTimeout(r, 30))
  expect(document.querySelector('[data-poe2-l10n]')).toBeNull()
})

it('普通翻译与 Data 词缀层同时启用，不改写词缀内部关键词或用户文本', () => {
  document.body.innerHTML =
    '<main><div class="modifierTable"><div class="row"><div class="label"><div class="text">+18% to <span class="keyword">Lightning Resistance</span></div></div></div></div><div contenteditable="true"><span class="stat">+18% to Lightning Resistance</span></div></main>'
  const combined = createLexicon([
    {
      id: 'r',
      en: '#% to Lightning Resistance',
      zh: '闪电抗性 #%',
      domain: 'stat',
      source: 'test',
      version: 'test',
    },
    {
      id: 'label',
      en: 'Lightning Resistance',
      zh: '闪电抗性',
      domain: 'ui',
      source: 'test',
      version: 'test',
    },
  ])
  const original = document.querySelector('.modifierTable')?.textContent
  const stopText = attachTextLayer(document, combined)
  const stopStats = attachStatLayer(document, combined)
  stop = () => {
    stopStats()
    stopText()
  }
  expect(document.querySelector('.modifierTable')?.textContent).toBe(original)
  expect(document.querySelector('.keyword')?.textContent).toBe('Lightning Resistance')
  expect(document.querySelector('.text')?.nextElementSibling?.shadowRoot?.textContent).toBe(
    '闪电抗性 +18%',
  )
  expect(document.querySelector('[contenteditable] [data-poe2-l10n]')).toBeNull()
  stop()
  expect(document.querySelector('[data-poe2-l10n]')).toBeNull()
  expect(document.querySelector('.modifierTable')?.textContent).toBe(original)
})
it('祖先隐藏或编辑状态改变时撤下词缀层，解除后可重新显示', async () => {
  document.body.innerHTML =
    '<main><section><span class="stat">+18% to Lightning Resistance</span></section></main>'
  stop = attachStatLayer(document, lex)
  const section = document.querySelector('section') as HTMLElement
  section.hidden = true
  await new Promise((r) => setTimeout(r, 30))
  expect(document.querySelector('[data-poe2-l10n]')).toBeNull()
  section.hidden = false
  await new Promise((r) => setTimeout(r, 30))
  expect(document.querySelector('[data-poe2-l10n]')?.shadowRoot?.textContent).toBe('闪电抗性 +18%')
  section.setAttribute('contenteditable', 'true')
  await new Promise((r) => setTimeout(r, 30))
  expect(document.querySelector('[data-poe2-l10n]')).toBeNull()
})

it('原站克隆装备 DOM 时移除没有 Shadow DOM 的译文空壳，关闭前尚未处理的克隆也清理', async () => {
  document.body.innerHTML =
    '<main><div class="item"><span class="stat">+18% to Lightning Resistance</span></div></main>'
  stop = attachStatLayer(document, lex)
  const item = document.querySelector('.item') as HTMLElement
  const clone = item.cloneNode(true) as HTMLElement
  document.querySelector('main')?.append(clone)
  await new Promise((r) => setTimeout(r, 30))
  expect(clone.querySelectorAll('[data-poe2-l10n="stat"]')).toHaveLength(1)
  expect(clone.querySelector('[data-poe2-l10n="stat"]')?.shadowRoot?.textContent).toBe(
    '闪电抗性 +18%',
  )
  document.querySelector('main')?.append(item.cloneNode(true))
  stop()
  expect(document.querySelector('[data-poe2-l10n="stat"]')).toBeNull()
  expect(document.querySelectorAll('.stat')).toHaveLength(3)
})
