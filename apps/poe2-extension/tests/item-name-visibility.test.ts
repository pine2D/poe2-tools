import { createLexicon } from '@poe2-tools/l10n-core'
import { afterEach, expect, it } from 'vitest'
import { attachStatLayer } from '../src/content/stat-layer'

// 原站规则（beta.craftofexile.com 实测）：普通／魔法且不可编辑的物品不显示默认名“New Item”，
// 标题栏只放基底名 .label；中文层不能把原站本就隐藏的名称显示出来，否则会把基底名挤出标题栏。
const siteCss = '.item:not(.rare):not(.unique):not(.editable) .header .name { display: none; }'
const card = (rarity: string) =>
  `<main><div class="item ${rarity}"><div class="header"><div class="center"><div class="name">New Item</div><div class="label">Runeforged Crystal Focus</div></div></div></div></main>`
let stop = () => {}
afterEach(() => {
  stop()
  document.head.replaceChildren()
  document.body.replaceChildren()
})
const lex = createLexicon([])
const host = () => document.querySelector('.name')?.nextElementSibling ?? null

for (const bilingual of [false, true])
  it(`原站隐藏的默认物品名不生成中文层（中英对照=${bilingual}）`, () => {
    document.head.innerHTML = `<style>${siteCss}</style>`
    document.body.innerHTML = card('normal')
    stop = attachStatLayer(document, lex, bilingual)
    expect(host()?.className).toBe('label')
    expect(document.querySelector('[data-poe2-l10n="stat"]')).toBeNull()
    expect(document.querySelector('.name')?.hasAttribute('data-poe2-l10n-original')).toBe(false)
  })

it('原站显示的默认物品名仍译为新物品，原文节点不变', () => {
  document.head.innerHTML = `<style>${siteCss}</style>`
  document.body.innerHTML = card('rare')
  stop = attachStatLayer(document, lex)
  expect(host()?.shadowRoot?.textContent).toBe('新物品')
  expect(document.querySelector('.name')?.textContent).toBe('New Item')
})

it('物品稀有度原地变化时，中文名称跟随原站显示与隐藏', async () => {
  document.head.innerHTML = `<style>${siteCss}</style>`
  document.body.innerHTML = card('normal')
  stop = attachStatLayer(document, lex)
  const item = document.querySelector('.item')
  const style = document.querySelector('style')
  if (!item || !style) throw new Error('缺少物品')
  // happy-dom 只在元素自身或父元素变化时清空计算样式缓存（浏览器无此限制）；
  // 同步重写样式表让缓存失效，变更回调读到的仍是类名变化后的结果。
  const setRarity = (rarity: string) => {
    item.className = `item ${rarity}`
    style.textContent = siteCss
  }
  setRarity('rare')
  await new Promise((r) => setTimeout(r, 0))
  expect(host()?.shadowRoot?.textContent).toBe('新物品')
  setRarity('normal')
  await new Promise((r) => setTimeout(r, 0))
  expect(host()?.className).toBe('label')
  expect(document.querySelector('.name')?.hasAttribute('data-poe2-l10n-original')).toBe(false)
})
