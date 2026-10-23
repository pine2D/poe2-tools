import { createLexicon } from '@poe2-tools/l10n-core'
import { afterEach, expect, it } from 'vitest'
import { attachTextLayer } from '../src/content/text-layer'

// 原站实测（beta.craftofexile.com）：基底搜索结果卡片 .itemSearchResults > .item 宽 400px，
// 标题栏 .header 定高 31px、nowrap，.center 为 flex-grow 且 min-width:auto；
// 中英对照的长名称会撑出标题栏，四个“中文 · 英文”按钮合计约 379px，超出 255px 的按钮区。
const lex = createLexicon([
  {
    id: 'b',
    en: 'Runemastered Crystal Focus',
    zh: '符文师匠水晶法器',
    domain: 'base',
    source: 'test',
    version: 'test',
  },
])
const card = (label: string, extra = '') =>
  `<main><div class="itemSearchResults"><div class="item normal"><div class="flex flex-columns"><div class="header flex"><div class="side left"></div><div class="center flex-grow"><div class="name">New Item</div><div class="label"${extra}>${label}</div></div><div class="side right"></div></div><div class="output"><div class="text"><div class="flex editButtonZone gap"><button class="small button exportPOB">Paste</button></div></div></div></div></div></div></main>`
const stops: (() => void)[] = []
afterEach(() => {
  for (const stop of stops.splice(0)) stop()
  document.head.replaceChildren()
  document.body.replaceChildren()
})
const settle = () => new Promise((r) => setTimeout(r, 30))
const label = () => document.querySelector('.itemSearchResults .header .label') as HTMLElement
const cardStyle = () =>
  [...document.head.querySelectorAll('style')].map((style) => style.textContent).join('\n')

it('中英对照：结果卡片名称单行省略，完整“中文 · 英文”写入 title', () => {
  document.body.innerHTML = card('Runemastered Crystal Focus')
  stops.push(attachTextLayer(document, lex, true))
  expect(label().textContent).toBe('符文师匠水晶法器 · Runemastered Crystal Focus')
  expect(label().title).toBe('符文师匠水晶法器 · Runemastered Crystal Focus')
  const css = cardStyle()
  // 只作用于扩展写过对照名称的标题；.center 的上限扣除两侧最小宽度（各 5px 左右内边距），
  // 名称能放下时仍与原站一样先压窄两侧，放不下才省略
  expect(css).toMatch(
    /\.itemSearchResults > \.item \.header > \.center:has\(> \.label\[data-poe2-l10n-fit\]\)\s*\{[^}]*max-width:\s*calc\(100% - 20px\)/,
  )
  expect(css).toMatch(
    /\.itemSearchResults > \.item \.header \.label\[data-poe2-l10n-fit\]\s*\{[^}]*overflow:\s*hidden[^}]*text-overflow:\s*ellipsis[^}]*white-space:\s*nowrap/,
  )
  // 按钮区换行而不缩小按钮：可点击区域与完整文字都保留
  expect(css).toMatch(/\.itemSearchResults > \.item \.editButtonZone\s*\{[^}]*flex-wrap:\s*wrap/)
  expect(label().hasAttribute('data-poe2-l10n-fit')).toBe(true)
})

it('普通模式不写 title、不注入卡片样式', () => {
  document.body.innerHTML = card('Runemastered Crystal Focus')
  stops.push(attachTextLayer(document, lex))
  expect(label().textContent).toBe('符文师匠水晶法器')
  expect(label().hasAttribute('title')).toBe(false)
  expect(label().hasAttribute('data-poe2-l10n-fit')).toBe(false)
  expect(cardStyle()).not.toContain('itemSearchResults')
})

it('原站自带 title 时不覆盖', () => {
  document.body.innerHTML = card('Runemastered Crystal Focus', ' title="site"')
  stops.push(attachTextLayer(document, lex, true))
  expect(label().title).toBe('site')
})

it('结果卡片以外的物品标题不受影响', () => {
  document.body.innerHTML =
    '<main><div class="item"><div class="header"><div class="center"><div class="label">Runemastered Crystal Focus</div></div></div></div></main>'
  stops.push(attachTextLayer(document, lex, true))
  const outside = document.querySelector('.label') as HTMLElement
  expect(outside.textContent).toBe('符文师匠水晶法器 · Runemastered Crystal Focus')
  expect(outside.hasAttribute('title')).toBe(false)
  expect(outside.hasAttribute('data-poe2-l10n-fit')).toBe(false)
})

it('原站改成未收录名称或关闭扩展时撤下 title 与标记', async () => {
  document.body.innerHTML = card('Runemastered Crystal Focus')
  const stop = attachTextLayer(document, lex, true)
  stops.push(stop)
  ;(label().firstChild as Text).data = 'Unknown Focus'
  await settle()
  expect(label().textContent).toBe('Unknown Focus')
  expect(label().hasAttribute('title')).toBe(false)
  expect(label().hasAttribute('data-poe2-l10n-fit')).toBe(false)
  ;(label().firstChild as Text).data = 'Runemastered Crystal Focus'
  await settle()
  expect(label().title).toBe('符文师匠水晶法器 · Runemastered Crystal Focus')
  stop()
  expect(label().textContent).toBe('Runemastered Crystal Focus')
  expect(label().hasAttribute('title')).toBe(false)
  expect(label().hasAttribute('data-poe2-l10n-fit')).toBe(false)
  expect(cardStyle()).not.toContain('itemSearchResults')
})
