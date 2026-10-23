// 装备导入两栏的行号与未识别行（v4 复盘第 3 组 B3-09）
import type { Term } from '@poe2-tools/l10n-core'
import { afterEach, expect, it } from 'vitest'
import { attachImport } from '../src/content/import-controller'

let stop = () => {}
const ui = () =>
  (document.querySelector('[data-poe2-l10n="import"]') as HTMLElement).shadowRoot as ShadowRoot
afterEach(() => {
  stop()
  document.body.innerHTML = ''
})
const TERMS: Term[] = [
  { id: 'base', en: 'Runed Focus', zh: '符文法器', domain: 'base', source: 't', version: 't' },
  {
    id: 'stat',
    sourceId: 'explicit.stat_4052037485',
    en: '+# to maximum Energy Shield',
    zh: '+# 能量护盾上限',
    domain: 'stat',
    source: 't',
    version: 't',
  },
]
const source = `物品类别: 法器
稀有度: 魔法
测试的 符文法器
--------
物品等级: 86
--------
{ 前缀属性 "测试的" (等阶：6) — 能量护盾 }
+40(36-41) 能量护盾上限`
function previewWith(text: string) {
  document.body.innerHTML = '<dialog open><textarea id="importerInput"></textarea></dialog>'
  const input = document.querySelector('#importerInput') as HTMLTextAreaElement
  input.value = text
  stop = attachImport(document, TERMS)
  ui().querySelector<HTMLButtonElement>('.body > button')?.click()
  return input
}
const columns = () => [...ui().querySelectorAll<HTMLElement>('.columns ol.lines')]
const rows = (list: HTMLElement | undefined) =>
  [...(list?.querySelectorAll<HTMLLIElement>(':scope > li') ?? [])].map((li) => ({
    no: li.querySelector('.ln')?.textContent,
    text: li.querySelector('.text')?.textContent,
    unknown: li.hasAttribute('data-issue'),
  }))

it('两栏是带行号的只读行列表；英文栏带 data-preview，行号不进可访问文本', () => {
  previewWith(source)
  const [original, english] = columns()
  expect(columns()).toHaveLength(2)
  expect(original?.hasAttribute('data-preview')).toBe(false)
  expect(english?.hasAttribute('data-preview')).toBe(true)
  expect(rows(original)).toEqual(
    source.split('\n').map((text, i) => ({ no: String(i + 1), text, unknown: false })),
  )
  expect(rows(english).map((row) => row.no)).toEqual(rows(english).map((_, i) => String(i + 1)))
  expect(rows(english).map((row) => row.text)).toContain('Runed Focus')
  for (const no of ui().querySelectorAll('.lines .ln'))
    expect(no.getAttribute('aria-hidden')).toBe('true')
  // 栏名与列表关联；列表可用键盘聚焦以滚动
  for (const list of columns()) {
    const caption = ui().getElementById(list.getAttribute('aria-labelledby') ?? '')
    expect(caption?.classList.contains('column-label')).toBe(true)
    expect(list.tabIndex).toBe(0)
  }
  expect(ui().querySelector('textarea')).toBeNull()
})

it('未识别的行整行标出：原文栏按问题行号，英文栏标出原文保留的同一行；读屏读出“待核对”', () => {
  previewWith(`${source}\n--------\n未知面板: 123`)
  const [original, english] = columns()
  expect(rows(original).filter((row) => row.unknown)).toEqual([
    { no: '10', text: '未知面板: 123', unknown: true },
  ])
  const flagged = original?.querySelector('li[data-issue]')
  expect(flagged?.querySelector('.sr')?.textContent).toBe('待核对：')
  expect(
    rows(english)
      .filter((row) => row.unknown)
      .map((row) => row.text),
  ).toEqual(['未知面板: 123'])
})

it('数值越界也属待核对行：原文栏标出；英文栏已转换的行不误标', () => {
  previewWith(source.replace('40(36-41)', '42(36-41)'))
  const [original, english] = columns()
  expect(
    rows(original)
      .filter((row) => row.unknown)
      .map((row) => row.no),
  ).toEqual(['8'])
  expect(rows(english).some((row) => row.unknown)).toBe(false)
})

it('点“第 N 行”后两栏对应行标为定位行，且只保留最近一次', () => {
  const input = previewWith(`${source}\n--------\n未知面板: 123\n未知效果`)
  const locates = [...ui().querySelectorAll<HTMLButtonElement>('li[data-kind="issue"] button')]
  expect(locates.map((b) => b.getAttribute('aria-label'))).toEqual(['定位第 10 行', '定位第 11 行'])
  locates[0]?.click()
  expect(document.activeElement).toBe(input)
  const focused = () =>
    columns().map((list) =>
      [...list.querySelectorAll('li[data-focus]')].map(
        (li) => li.querySelector('.text')?.textContent,
      ),
    )
  expect(focused()).toEqual([['未知面板: 123'], ['未知面板: 123']])
  locates[1]?.click()
  expect(focused()).toEqual([['未知效果'], ['未知效果']])
  expect(ui().querySelector('.columns li[data-focus] .ln')?.textContent).toBe('11')
})

it('原文末尾换行不多出空行号；中间空行保留行号', () => {
  previewWith(`${source}\n`)
  expect(rows(columns()[0]).at(-1)?.no).toBe('8')
  stop()
  previewWith(source.replace('--------\n物品等级', '--------\n\n物品等级'))
  expect(rows(columns()[0])[4]).toEqual({ no: '5', text: '', unknown: false })
})
