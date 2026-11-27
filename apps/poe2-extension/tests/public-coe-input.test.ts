import { createGameLexicon, type Term } from '@poe2-tools/l10n-core'
import { afterEach, expect, it, vi } from 'vitest'
import items from '../../../data/dict/zh-CN/items.json'
import { prepareImport } from '../src/adapters/coe-beta/import'
import { attachImport } from '../src/content/import-controller'
import { attachSearch } from '../src/content/search-controller'

function term(domain: Term['domain'], en: string, zh: string): Term {
  return { id: `${domain}:${en}`, domain, en, zh, source: 'test', version: 'test' }
}

const bases = Object.entries(items.bases)
  .filter(([, zh]) => zh.endsWith('水晶法器') || zh.endsWith('鹿角法器'))
  .map(([en, zh]) => term('base', en, zh))
const baseControl = '<div id="searchItemInput"><input type="text"></div>'
let stop: (() => void) | undefined
afterEach(() => {
  stop?.()
  stop = undefined
  document.body.replaceChildren()
})

function openSearch(html = baseControl, terms = bases) {
  document.body.innerHTML = html
  stop = attachSearch(document, createGameLexicon(terms))
  return document.querySelector('input') as HTMLInputElement
}
function type(input: HTMLInputElement, value: string) {
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
function enter(input: HTMLInputElement) {
  input.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
  )
}
function buttons() {
  return [...document.querySelectorAll<HTMLButtonElement>('[data-poe2-l10n="search"] button')]
}
function labels() {
  return buttons().map((button) => button.getAttribute('aria-label'))
}

it.each([
  ['水晶法器', 'Crystal Focus', 'Enter'],
  ['鹿角法器', 'Antler Focus', '点击'],
  ['鹿角法器', 'Staghorn Focus', 'Enter'],
])('原样回搜「%s，%s」后用 %s 选择，只向原框提交对应英文', (zh, en, action) => {
  const input = openSearch()
  const nativeQueries: string[] = []
  input.addEventListener('input', () => nativeQueries.push(input.value))
  type(input, zh)
  const label = labels().find((name) => name === `${zh}，${en}`)
  expect(label).toBe(`${zh}，${en}`)
  type(input, label as string)
  expect(labels()).toEqual([label])
  expect(nativeQueries).toEqual([])
  if (action === 'Enter') enter(input)
  else buttons()[0]?.click()
  expect(input.value).toBe(en)
  expect(nativeQueries).toEqual([en])
})

it('单独的歧义中文与空格混搜都保留分支，错配或残缺的双语标签没有候选', () => {
  const input = openSearch()
  type(input, '鹿角法器')
  expect(labels()).toEqual(
    expect.arrayContaining(['鹿角法器，Antler Focus', '鹿角法器，Staghorn Focus']),
  )
  enter(input)
  expect(input.value).toBe('鹿角法器')
  type(input, '水晶法器 Crystal Focus')
  expect(labels()).toEqual([
    '水晶法器，Crystal Focus',
    '符文水晶法器，Runeforged Crystal Focus',
    '符文师匠水晶法器，Runemastered Crystal Focus',
  ])
  enter(input)
  expect(input.value).toBe('水晶法器 Crystal Focus')
  for (const query of ['水晶法器，Staghorn Focus', '水晶，Crystal Focus', '鹿角法器，Antler']) {
    type(input, query)
    expect(labels()).toEqual([])
    enter(input)
    expect(input.value).toBe(query)
  }
})

it('条件选项在 50 条截断前过滤，双语按钮在原站换掉选项后失效', () => {
  const terms = Array.from({ length: 60 }, (_, i) =>
    term('ui', `Condition ${String(i).padStart(2, '0')}`, '试验条件'),
  )
  const input = openSearch(
    '<div id="simulatorConditionRequirements"><div class="dropdown"><div class="editing"><input type="text"></div><ul><li search="metaCondition 59"></li></ul></div></div>',
    terms,
  )
  type(input, '试验条件')
  expect(labels()).toEqual(['试验条件，Condition 59'])
  type(input, '试验条件，Condition 00')
  expect(labels()).toEqual([])
  type(input, '试验条件，Condition 59')
  expect(labels()).toEqual(['试验条件，Condition 59'])
  document.querySelector('li')?.setAttribute('search', 'metaCondition 00')
  buttons()[0]?.click()
  expect(input.value).toBe('试验条件，Condition 59')
  expect(labels()).toEqual([])
})

it('材料价格框仅接受材料双名，基底和别名拼出的标签均无候选', () => {
  const material = { ...term('item', 'Trial Orb', '试验石'), aliases: ['试石'] }
  const input = openSearch(
    '<div id="customPriceSearchHolder"><div id="searchInput"><input type="text"></div></div>',
    [...bases, material],
  )
  for (const query of ['水晶法器，Crystal Focus', '试石，Trial Orb']) {
    type(input, query)
    expect(labels()).toEqual([])
  }
  type(input, '试验石，Trial Orb')
  enter(input)
  expect(input.value).toBe('Trial Orb')
})

it('双名保留名称内的逗号、数字和占位符，单语名称仍可精确匹配', () => {
  const stat = term('stat', 'At 1,200 Mana, gain +#%', '魔力达到 1,200 时，获得 +#%')
  const lexicon = createGameLexicon([stat])
  const label = `${stat.zh}，${stat.en}`
  for (const name of [stat.zh, stat.en, label]) {
    expect(lexicon.search(name, 'stat')).toEqual([{ term: stat, exact: true }])
  }
  for (const wrong of [
    label.replace('1,200', '1200'),
    label.replace('+#%', '#%'),
    label.replace('获得', '获取'),
  ]) {
    expect(lexicon.search(wrong, 'stat')).toEqual([])
  }
})

const termsForImport = [...bases, term('stat', '# to maximum Mana', '# 魔力上限')]
const equipment = `物品类别：法器
稀有度：稀有
试制品
水晶法器
--------
物品等级: 73
--------
{ 前缀属性 "试制" (等阶：3) }
+17(14-21) 魔力上限`

it('高级装备先预览，再原样填入英文基底、等阶与数值范围，等待原站确认', () => {
  document.body.innerHTML =
    '<dialog open><textarea id="importerInput"></textarea><button class="importCommitButton">Proceed</button></dialog>'
  const input = document.querySelector('textarea') as HTMLTextAreaElement
  input.value = equipment
  const proceed = vi.fn()
  document.querySelector('.importCommitButton')?.addEventListener('click', proceed)
  stop = attachImport(document, termsForImport)
  const panel = document.querySelector('[data-poe2-l10n="import"]')?.shadowRoot as ShadowRoot
  panel.querySelector<HTMLButtonElement>('.body > button')?.click()
  const preview = [...panel.querySelectorAll('[data-preview] li .text')]
    .map((row) => row.textContent)
    .join('\n')
  expect(preview).toBe(`Item Class: Foci
Rarity: Rare
试制品
Crystal Focus
--------
Item Level: 73
--------
{ Prefix Modifier "试制" (Tier: 3) }
+17(14-21) to maximum Mana`)
  expect(input.value).toBe(equipment)
  const fill = panel.querySelector<HTMLButtonElement>('.result > button')
  expect(fill?.disabled).toBe(false)
  fill?.click()
  expect(input.value).toBe(preview)
  expect(proceed).not.toHaveBeenCalled()
})

it.each([
  ['水晶法器', '鹿角法器', 'ambiguous', '鹿角法器'],
  ['+17(14-21)', '+27(14-21)', 'format', '+27(14-21) to maximum Mana'],
])('高级装备将「%s」改为「%s」后保留原文并阻止填入', (before, after, kind, previewLine) => {
  const original = equipment.replace(before, after)
  const result = prepareImport(original, termsForImport)
  expect(result.ready).toBe(false)
  expect(result.original).toBe(original)
  expect(result.english.split('\n')).toContain(previewLine)
  expect(result.issues.map((issue) => issue.kind)).toContain(kind)
})
