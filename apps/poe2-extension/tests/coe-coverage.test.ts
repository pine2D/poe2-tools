import { createLexicon } from '@poe2-tools/l10n-core'
import { afterEach, expect, it } from 'vitest'
import { contextualText } from '../src/adapters/coe-beta/regions'
import { attachStatLayer } from '../src/content/stat-layer'
import { attachTextLayer } from '../src/content/text-layer'

let stop = () => {}
afterEach(() => {
  stop()
  document.body.replaceChildren()
})
it('属性缩写按完整属性字段翻译，文本外不匹配', () => {
  for (const [source, expected] of [
    [', Str', '，力量'],
    [', Dex', '，敏捷'],
    [', Int', '，智慧'],
  ] as const) {
    expect(contextualText(source, 'property')).toBe(expected)
    expect(contextualText(source, 'default')).toBeNull()
  }
  expect(contextualText('Non-Ailment', 'tag')).toBe('非异常状态')
})
it('独立词缀名身份只用于高级头，不套用同名天赋；仍保留原站复制节点', () => {
  const lex = createLexicon([
    {
      id: 'name',
      en: 'Prefix modifier "Rotund"',
      zh: '前缀属性 "丰腴的"',
      domain: 'ui',
      source: 'synthetic',
      version: 'test',
    },
    {
      id: 'passive',
      en: 'Hallowed',
      zh: '不同的天赋名',
      domain: 'passive',
      source: 'synthetic',
      version: 'test',
    },
  ])
  document.body.innerHTML =
    '<main><div class="item"><div class="modifierDetails">Prefix modifier "Rotund" (Tier: 3) — <span class="tags">Life</span></div><div class="modifierDetails">Prefix modifier "Hallowed" (Tier: 1) — <span class="tags">Armour</span></div></div></main>'
  stop = attachStatLayer(document, lex)
  const [first, second] = document.querySelectorAll('.modifierDetails')
  expect(first?.nextElementSibling?.shadowRoot?.textContent).toBe(
    '前缀属性 "丰腴的"（等阶：3）— 生命',
  )
  expect(second?.nextElementSibling?.shadowRoot?.textContent).toContain('"Hallowed"')
  expect(first?.textContent).toContain('Prefix modifier "Rotund"')
})
it('下拉分类和动态克隆可译可恢复，原站 search 与 value 不变', async () => {
  const lex = createLexicon([
    {
      id: 'ui:Marksman',
      en: 'Marksman',
      zh: '神射手',
      domain: 'ui',
      source: 'synthetic',
      version: 'test',
    },
  ])
  document.body.innerHTML =
    '<main><div class="dropdown"><ul><li value="42" search="marksman suffix"><span class="influence">Marksman</span></li></ul></div></main>'
  stop = attachTextLayer(document, lex)
  expect(document.querySelector('.influence')?.textContent).toBe('神射手')
  const li = document.querySelector('li')
  if (!li) throw new Error('缺少候选')
  expect(li.getAttribute('search')).toBe('marksman suffix')
  li.insertAdjacentHTML('afterend', '<li value="43"><span class="influence">Marksman</span></li>')
  await new Promise((r) => setTimeout(r, 0))
  expect(document.querySelectorAll('.influence')[1]?.textContent).toBe('神射手')
  stop()
  expect(li.getAttribute('value')).toBe('42')
  expect(document.querySelector('.influence')?.textContent).toBe('Marksman')
})
it('默认物品名仅在视觉层显示，改名、复制原文与导出按钮各守边界', async () => {
  document.body.innerHTML =
    '<main><div class="item"><div class="header"><div class="name">New Item</div></div><button class="exportPOB">Paste</button></div></main>'
  const lex = createLexicon([
    {
      id: 'accidental',
      en: 'Custom Name',
      zh: '不应改写',
      domain: 'ui',
      source: 'synthetic',
      version: 'test',
    },
  ])
  const text = attachTextLayer(document, lex)
  const stats = attachStatLayer(document, lex)
  stop = () => {
    stats()
    text()
  }
  const name = document.querySelector('.name')
  if (!name) throw new Error('缺少名称')
  expect(name.textContent).toBe('New Item')
  expect(name.nextElementSibling?.shadowRoot?.textContent).toBe('新物品')
  expect(document.querySelector('button')?.textContent).toBe('导出文本')
  name.textContent = 'Custom Name'
  await new Promise((r) => setTimeout(r, 0))
  expect(name.textContent).toBe('Custom Name')
  expect(name.nextElementSibling).toBeNull()
})
