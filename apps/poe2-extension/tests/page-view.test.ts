// 弹窗当前页状态：pageView 的 8 种原因与读取中（方向约定 A 表、计划裁定 4–7），以及状态图标
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Settings } from '../src/platform'
import { stateIcon } from '../src/popup/icons'
import type { PageProbe } from '../src/popup/page-query'
import { type PageKind, type PageView, pageView } from '../src/popup/page-view'
import type { PageStateReply } from '../src/protocol'

const ON: Settings = { enabled: true, bilingual: false }
const OFF: Settings = { enabled: false, bilingual: false }

function reply(over: Partial<PageStateReply> = {}): PageStateReply {
  return {
    v: 1,
    phase: 'ready',
    error: null,
    page: 'supported',
    enabled: true,
    translated: 128,
    search: 'ok',
    searchMissing: [],
    ...over,
  }
}
function answered(over: Partial<PageStateReply> = {}, settled = true): PageProbe {
  return { status: 'reply', tabId: 7, reply: reply(over), settled }
}

const HINT = {
  ok: '未收录的术语保持英文。转换装备文本后，仍以原站的导入结果为准。',
  part: (where: string) =>
    `界面已翻译，但${where}没接上，暂时不能用中文搜索。先刷新页面；仍不行请反馈。`,
  lang: '中文助手只在 English 界面上工作。请在原站右上角切到 English，再刷新页面。',
  poe1: '中文助手只支持 PoE2。在原站把游戏切到 PoE2。',
  none: '两种可能：这不是 beta.craftofexile.com 页面（旧版 www 站不支持）；或页面在安装、更新扩展前就已打开，刷新即可。',
  mute: '本页显示原站英文。在下方打开“启用简体中文”即可，不用刷新。',
  dictionary: '词典没能加载，本页仍是原站英文。刷新页面通常能恢复；仍失败请检查更新。',
  failed: '中文助手没能启动，本页仍是原站英文。刷新页面通常能恢复；仍失败请检查更新。',
  unknown: '原站页面可能还没加载完，或已经改版。刷新页面后再打开弹窗；仍不行请检查更新。',
}
const READING: PageView = {
  kind: 'reading',
  word: null,
  reason: null,
  hint: '正在读取当前页…',
  action: null,
}
function off(reason: string, hint: string, action: 'reload' | null = null): PageView {
  return { kind: 'off', word: '未生效', reason, hint, action }
}

describe('pageView：8 种原因与读取中，文案逐字', () => {
  it.each<[string, PageProbe, Settings, PageView]>([
    [
      '1 生效中',
      answered(),
      ON,
      { kind: 'ok', word: '生效中', reason: '已翻译 128 处', hint: HINT.ok, action: null },
    ],
    [
      '1 生效中，N=0 时不写原因',
      answered({ translated: 0 }),
      ON,
      { kind: 'ok', word: '生效中', reason: null, hint: HINT.ok, action: null },
    ],
    [
      '2 部分生效：缺基底搜索框',
      answered({ translated: 96, search: 'missing', searchMissing: ['base', 'stat'] }),
      ON,
      {
        kind: 'part',
        word: '部分生效',
        reason: '已翻译 96 处',
        hint: HINT.part('基底搜索框'),
        action: 'reload',
      },
    ],
    [
      '2 部分生效：只缺词缀搜索框',
      answered({ translated: 96, search: 'missing', searchMissing: ['stat'] }),
      ON,
      {
        kind: 'part',
        word: '部分生效',
        reason: '已翻译 96 处',
        hint: HINT.part('词缀搜索框'),
        action: 'reload',
      },
    ],
    [
      '2 部分生效：缺物品搜索框',
      answered({ translated: 96, search: 'missing', searchMissing: ['item'] }),
      ON,
      {
        kind: 'part',
        word: '部分生效',
        reason: '已翻译 96 处',
        hint: HINT.part('搜索框'),
        action: 'reload',
      },
    ],
    [
      '2 部分生效：词缀与物品都缺，N=0 不写原因',
      answered({ translated: 0, search: 'missing', searchMissing: ['stat', 'item'] }),
      ON,
      { kind: 'part', word: '部分生效', reason: null, hint: HINT.part('搜索框'), action: 'reload' },
    ],
    [
      '3 原站语言不是 English',
      answered({ page: 'english-required' }),
      ON,
      off('原站语言不是 English', HINT.lang),
    ],
    ['4 原站选的是 PoE1', answered({ page: 'unsupported' }), ON, off('原站选的是 PoE1', HINT.poe1)],
    ['5 无应答', { status: 'none' }, ON, off('本页没有中文助手', HINT.none)],
    [
      '6 简体中文已关闭',
      answered({ enabled: false }),
      OFF,
      { kind: 'mute', word: '未生效', reason: '简体中文已关闭', hint: HINT.mute, action: null },
    ],
    [
      '7 初始化失败：词典',
      answered({ phase: 'failed', error: 'dictionary' }),
      ON,
      off('初始化失败', HINT.dictionary, 'reload'),
    ],
    [
      '7 初始化失败：设置',
      answered({ phase: 'failed', error: 'settings' }),
      ON,
      off('初始化失败', HINT.failed, 'reload'),
    ],
    [
      '7 初始化失败：其他',
      answered({ phase: 'failed', error: 'other' }),
      ON,
      off('初始化失败', HINT.failed, 'reload'),
    ],
    [
      '8 超过 5 s 仍认不出原站',
      answered({ page: 'unknown' }, true),
      ON,
      off('认不出原站的游戏和语言', HINT.unknown),
    ],
    ['读取中：还没有结果', { status: 'reading' }, ON, READING],
    ['读取中：内容脚本仍在启动', answered({ phase: 'starting' }, false), ON, READING],
    ['读取中：5 s 内认不出原站', answered({ page: 'unknown' }, false), ON, READING],
  ])('%s', (_name, probe, saved, expected) => {
    expect(pageView(probe, saved)).toEqual(expected)
  })
})

describe('pageView：优先级（计划裁定 7）', () => {
  it('初始化失败排在“已关闭”之前：词典坏了时打开开关也没用', () => {
    const view = pageView(answered({ phase: 'failed', error: 'dictionary', enabled: false }), OFF)
    expect([view.reason, view.action]).toEqual(['初始化失败', 'reload'])
  })

  it('“已关闭”排在语言、游戏、认不出原站与部分生效之前：先只提示打开开关', () => {
    for (const over of [
      { page: 'english-required' },
      { page: 'unsupported' },
      { page: 'unknown' },
      { search: 'missing', searchMissing: ['base'] },
    ] as Partial<PageStateReply>[]) {
      expect(pageView(answered({ ...over, enabled: false }), OFF).reason).toBe('简体中文已关闭')
    }
  })

  it('“已关闭”只看弹窗已保存的设置，不看应答里的 enabled', () => {
    expect(pageView(answered({ enabled: true }), OFF).kind).toBe('mute')
    expect(pageView(answered({ enabled: false }), ON).kind).toBe('ok')
  })

  it('内容脚本还在启动时一律显示读取中，不因超时改报原因', () => {
    expect(pageView(answered({ phase: 'starting', page: 'unknown' }, true), ON)).toEqual(READING)
  })

  it('语言或游戏不对时不报部分生效', () => {
    const missing = { search: 'missing', searchMissing: ['base'] } as const
    expect(pageView(answered({ ...missing, page: 'english-required' }), ON).kind).toBe('off')
    expect(pageView(answered({ ...missing, page: 'unsupported' }), ON).kind).toBe('off')
  })

  it('状态词只有三个，“刷新页面”只在部分生效与初始化失败出现', () => {
    const views = [
      pageView(answered(), ON),
      pageView(answered({ search: 'missing', searchMissing: ['base'] }), ON),
      pageView(answered({ page: 'english-required' }), ON),
      pageView(answered({ page: 'unsupported' }), ON),
      pageView({ status: 'none' }, ON),
      pageView(answered({ enabled: false }), OFF),
      pageView(answered({ phase: 'failed', error: 'other' }), ON),
      pageView(answered({ page: 'unknown' }), ON),
      pageView({ status: 'reading' }, ON),
    ]
    expect(new Set(views.map((view) => view.word))).toEqual(
      new Set(['生效中', '部分生效', '未生效', null]),
    )
    expect(views.filter((view) => view.action === 'reload').map((view) => view.kind)).toEqual([
      'part',
      'off',
    ])
  })
})

describe('stateIcon：内联 SVG，形状区分状态', () => {
  const KINDS: PageKind[] = ['ok', 'part', 'off', 'mute', 'reading']

  it.each(KINDS)('%s：装饰性图标，读屏跳过、不可聚焦，18×18、视框 24', (kind) => {
    const icon = stateIcon(document, kind)
    expect(icon.namespaceURI).toBe('http://www.w3.org/2000/svg')
    expect(icon.tagName.toLowerCase()).toBe('svg')
    expect(icon.getAttribute('aria-hidden')).toBe('true')
    expect(icon.getAttribute('focusable')).toBe('false')
    expect([icon.getAttribute('width'), icon.getAttribute('height')]).toEqual(['18', '18'])
    expect(icon.getAttribute('viewBox')).toBe('0 0 24 24')
    expect(icon.getAttribute('stroke')).toBe('currentColor')
    expect(icon.querySelector('circle')?.getAttribute('r')).toBe('9')
  })

  it('五种形状互不相同：不只靠颜色区分', () => {
    const shapes = KINDS.map((kind) =>
      [...stateIcon(document, kind).children].map((node) => node.outerHTML).join(''),
    )
    expect(new Set(shapes).size).toBe(5)
  })

  it('部分生效是半填圆，读取中是虚线圆，已关闭是圆中横线', () => {
    const part = stateIcon(document, 'part')
    expect(part.querySelector('path[fill="currentColor"]')?.getAttribute('d')).toBe(
      'M12 3a9 9 0 0 1 0 18z',
    )
    expect(
      stateIcon(document, 'reading').querySelector('circle')?.getAttribute('stroke-dasharray'),
    ).toBe('3.2 3.9')
    expect(stateIcon(document, 'reading').querySelectorAll('path')).toHaveLength(0)
    expect(stateIcon(document, 'mute').querySelector('path')?.getAttribute('d')).toBe('M8.5 12h7')
  })

  it('生效中、部分生效、未生效与网站扩展介绍页的 StateIcon 同形', () => {
    const site = readFileSync('apps/site/src/pages/extension/ExtensionPage.tsx', 'utf8')
    for (const kind of ['ok', 'part', 'off'] as const) {
      for (const path of stateIcon(document, kind).querySelectorAll('path'))
        expect(site, kind).toContain(`d="${path.getAttribute('d')}"`)
    }
  })
})
