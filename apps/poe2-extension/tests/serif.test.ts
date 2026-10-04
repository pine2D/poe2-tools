// 原站 Fontin 位置与面板的中文衬线（扩展 0.4.0；DESIGN.md“宿主全局样式”第 4 处，计划裁定 16–19）
import { L1_FONT_FAMILY, L1_FONT_FILE } from '@poe2-tools/ui-theme/compliance'
import { L1_SERIF_SELECTORS } from '@poe2-tools/ui-theme/selectors'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { parseRules } from '../../../packages/ui-theme/src/testing/css'
import { HOST_SERIF_FALLBACK, HOST_SERIF_SELECTORS } from '../src/adapters/coe-beta/serif'
import { attachImport } from '../src/content/import-controller'

vi.mock('../src/platform', () => ({
  platform: { resource: (path: string) => `chrome-extension://test/${path}` },
}))

const made: FakeFace[] = []
class FakeFace {
  readonly family: string
  readonly source: unknown
  readonly descriptors: unknown
  status = 'unloaded'
  constructor(family: string, source: unknown, descriptors: unknown) {
    this.family = family
    this.source = source
    this.descriptors = descriptors
    made.push(this)
  }
  load = vi.fn(async () => {
    this.status = 'loaded'
    return this
  })
}
const fontResponse = () => ({
  ok: true,
  status: 200,
  arrayBuffer: async () => new ArrayBuffer(8),
})

let serif: typeof import('../src/content/serif')
let fonts: Set<unknown>
const stops: (() => void)[] = []
beforeEach(async () => {
  vi.resetModules()
  made.length = 0
  fonts = new Set()
  // happy-dom 没有 document.fonts 与 FontFace，用替身
  Object.defineProperty(document, 'fonts', { configurable: true, value: fonts })
  vi.stubGlobal('FontFace', FakeFace)
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => fontResponse()),
  )
  serif = await import('../src/content/serif')
})
afterEach(() => {
  for (const stop of stops.splice(0)) stop()
  Reflect.deleteProperty(document, 'fonts')
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  document.head.innerHTML = ''
  document.body.innerHTML = ''
})
const attach = () => {
  const stop = serif.attachSerif(document)
  stops.push(stop)
  return stop
}
const styles = () => document.head.querySelectorAll('style[data-poe2-l10n="serif"]')
const tick = () => new Promise((done) => setTimeout(done, 0))

it('与 ui-theme 的 L1 常量一致：family 与包内路径', () => {
  expect(serif.SERIF_FAMILY).toBe(L1_FONT_FAMILY)
  expect(serif.SERIF_FONT_PATH).toBe(`assets/${L1_FONT_FILE}`)
})

it('挂载后文档里恰有一张衬线样式：:root 前缀的 HOST_SERIF_SELECTORS，只声明 font-family，Fontin 在前', () => {
  attach()
  expect(styles()).toHaveLength(1)
  const css = styles()[0]?.textContent ?? ''
  const rules = parseRules(css)
  expect(rules).toHaveLength(1)
  expect(rules[0]?.selectors).toEqual(HOST_SERIF_SELECTORS.map((selector) => `:root ${selector}`))
  expect([...(rules[0]?.declarations.keys() ?? [])]).toEqual(['font-family'])
  expect(rules[0]?.declarations.get('font-family')).toBe(
    ['Fontin', `"${L1_FONT_FAMILY}"`, HOST_SERIF_FALLBACK].filter((part) => part !== '').join(', '),
  )
  expect(css).not.toMatch(/!important|url\(|@font-face/i)
  expect(css).toBe(serif.serifCss())
})

it('停用即移除；残留的同名样式先删掉；后挂载的取代先挂载的，旧 stop 不动字体', async () => {
  const orphan = document.createElement('style')
  orphan.dataset.poe2L10n = 'serif'
  document.head.append(orphan)
  const first = attach()
  expect(orphan.isConnected).toBe(false)
  const second = attach()
  expect(styles()).toHaveLength(1)
  await vi.waitFor(() => expect(fonts.size).toBe(1))
  first()
  expect(styles()).toHaveLength(1)
  expect(fonts.size).toBe(1)
  second()
  expect(styles()).toHaveLength(0)
  expect(fonts.size).toBe(0)
})

it('首次挂载读取并注册 L1 子集（700、normal、swap）；停用删除，再启用只重新 add，不再读取', async () => {
  const stop = attach()
  await vi.waitFor(() => expect(fonts.size).toBe(1))
  expect(fetch).toHaveBeenCalledOnce()
  expect(fetch).toHaveBeenCalledWith(`chrome-extension://test/assets/${L1_FONT_FILE}`)
  expect(made).toHaveLength(1)
  const face = made[0]
  expect(face?.family).toBe(L1_FONT_FAMILY)
  expect(face?.source).toBeInstanceOf(ArrayBuffer)
  expect(face?.descriptors).toEqual({ weight: '700', style: 'normal', display: 'swap' })
  expect(face?.load).toHaveBeenCalledOnce()
  expect(fonts.has(face)).toBe(true)
  stop()
  expect(fonts.size).toBe(0)
  attach()
  await vi.waitFor(() => expect(fonts.has(face)).toBe(true))
  expect(fetch).toHaveBeenCalledOnce()
  expect(made).toHaveLength(1)
})

it('字体读完之前已停用：不注册字体', async () => {
  let release!: () => void
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise((done) => {
          release = () => done(fontResponse())
        }),
    ),
  )
  const stop = attach()
  stop()
  release()
  await vi.waitFor(() => expect(made[0]?.load).toHaveBeenCalled())
  await tick()
  expect(fonts.size).toBe(0)
  expect(styles()).toHaveLength(0)
})

it.each([
  ['没有 FontFace', () => vi.stubGlobal('FontFace', undefined)],
  ['没有 document.fonts', () => Reflect.deleteProperty(document, 'fonts')],
  [
    '读取被拒',
    () =>
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          throw new TypeError('Failed to fetch')
        }),
      ),
  ],
  [
    'HTTP 404',
    () =>
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({ ok: false, status: 404 })),
      ),
  ],
  [
    'load 被拒',
    () =>
      vi.stubGlobal(
        'FontFace',
        class {
          load = vi.fn(async () => {
            throw new Error('bad font')
          })
        },
      ),
  ],
])('字体失败（%s）只 warn 一行，样式照常挂载，不抛错，再挂载也不重读', async (_name, arrange) => {
  arrange()
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  expect(() => attach()).not.toThrow()
  expect(styles()).toHaveLength(1)
  await vi.waitFor(() => expect(warn).toHaveBeenCalledOnce())
  expect(String(warn.mock.calls[0]?.[0])).toContain('[PoE2 中文助手]')
  for (const stop of stops.splice(0)) stop()
  attach()
  await tick()
  expect(warn).toHaveBeenCalledOnce()
  expect(fonts.size).toBe(0)
})

// 选择器反例与正例：误匹配到 Montserrat 位置、词缀、数据、键帽、搜索比漏匹配更值得防（裁定 18）
const FIXTURE = `
<header class="top"><nav id="mainMenu"><a>制作</a><a>数据</a></nav></header>
<div id="homeFeatures"><h1>主要功能</h1><div class="feature"><div class="header">计算器</div>
<label><div class="title">设置复杂的计算条件</div><div class="details">说明</div></label></div></div>
<div id="changePatchZone"><label>最新版本</label></div>
<div id="settingsZone"><div class="settings"><div class="setting"><span class="currentPatchLabel">最新版本 <span class="details">(0.5.5.3)</span></span></div></div></div>
<button class="game small orange">导入装备</button>
<div class="item normal"><div class="property">物品等级：</div><button class="small">编辑</button></div>
<div class="modGroup modLine">词缀</div>
<span class="keyboardKey">悬停</span>
<div id="inventoryZone"><div class="tabs"><div class="tab"><div></div><div>Tab</div></div></div></div>
<div class="modifierTable"><div class="row">数据</div></div>
<div id="searchItemInput"><input></div>
<button class="tag">选择物品分组</button>`
const POSITIVE = [
  '#mainMenu > a',
  '#homeFeatures h1',
  '#homeFeatures div.feature div.header',
  '#homeFeatures div.feature label div.title',
  '#changePatchZone label',
  '.currentPatchLabel',
  '.currentPatchLabel .details',
  'button.game',
  '.item button.small',
]
const NEGATIVE = [
  '.item .property',
  '.modGroup.modLine',
  '.keyboardKey',
  '#inventoryZone .tabs > div.tab > div:nth-child(2)',
  '.modifierTable .row',
  '#homeFeatures div.feature label div.details',
  '#searchItemInput input',
  'button.tag',
  'header.top',
]
it('HOST_SERIF_SELECTORS 只命中原站 Fontin 位置；后备栈不含 Fontin 与扩展字体', () => {
  document.body.innerHTML = FIXTURE
  const serifOf = (el: Element) => HOST_SERIF_SELECTORS.some((selector) => el.matches(selector))
  for (const selector of POSITIVE)
    for (const el of document.querySelectorAll(selector)) expect(serifOf(el), selector).toBe(true)
  for (const selector of NEGATIVE) {
    expect(document.querySelectorAll(selector).length, selector).toBeGreaterThan(0)
    for (const el of document.querySelectorAll(selector)) expect(serifOf(el), selector).toBe(false)
  }
  expect(HOST_SERIF_SELECTORS).toHaveLength(9)
  expect(HOST_SERIF_FALLBACK).not.toMatch(/fontin|poe2/i)
})

// 面板契约（Task 4）：标题与预览、填入、恢复按钮用衬线，“第 N 行”定位按钮不用（裁定 19）
const PANEL_SOURCE = `物品类别: 法器
稀有度: 魔法
测试的 符文法器
--------
物品等级: 86
--------
{ 前缀属性 "测试的" (等阶：6) — 能量护盾 }
+42(36-41) 能量护盾上限`
it('导入面板：L1_SERIF_SELECTORS 命中标题与全部非定位按钮，不命中“第 N 行”定位按钮', () => {
  document.body.innerHTML = '<dialog open><textarea id="importerInput"></textarea></dialog>'
  const input = document.querySelector('#importerInput') as HTMLTextAreaElement
  input.value = PANEL_SOURCE
  stops.push(
    attachImport(document, [
      {
        id: 'base',
        en: 'Runed Focus',
        zh: '符文法器',
        domain: 'base',
        source: 'test',
        version: 'test',
      },
      {
        id: 'stat',
        sourceId: 'explicit.stat_4052037485',
        en: '+# to maximum Energy Shield',
        zh: '+# 能量护盾上限',
        domain: 'stat',
        source: 'test',
        version: 'test',
      },
    ]),
  )
  const root = (document.querySelector('[data-poe2-l10n="import"]') as HTMLElement)
    .shadowRoot as ShadowRoot
  ;(root.querySelector('.body > button') as HTMLButtonElement).click()
  const serifOf = (el: Element) => L1_SERIF_SELECTORS.some((selector) => el.matches(selector))
  const title = root.querySelector('.title')
  expect(title?.textContent).toBe('装备文本转换')
  expect(title && serifOf(title)).toBe(true)
  const buttons = [...root.querySelectorAll('button')]
  const locate = buttons.filter((b) => b.getAttribute('aria-label')?.startsWith('定位第'))
  expect(locate.length).toBeGreaterThan(0)
  for (const button of buttons)
    expect(serifOf(button), button.textContent ?? '').toBe(!locate.includes(button))
  expect(buttons.filter(serifOf).map((b) => b.textContent)).toEqual(
    expect.arrayContaining(['预览中文转换', '填入英文到原站导入框']),
  )
})
