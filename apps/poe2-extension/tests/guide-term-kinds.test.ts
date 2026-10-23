import { readFileSync } from 'node:fs'
import {
  createMatcher,
  type GuideBlock,
  type GuideDocument,
  type PreparedBlock,
  prepareBlock,
  type TranslatedTerm,
} from '@poe2-tools/guide-core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { contrastRatio } from '../../../packages/ui-theme/src/testing/contrast'
import { TERM_STYLE, translatedText } from '../src/guide/translated-text'
import { createReadingView, type ReadingHandlers } from '../src/guide/view-reading'

// 侧栏译文术语按类型着色＋图例；页内对照与划词气泡继续只用下划线。译名取自国服词典。
const handlers = (): ReadingHandlers => ({
  onStage: vi.fn(),
  onRetryBlock: vi.fn(),
  onStop: vi.fn(),
  onReload: vi.fn(),
  onSettings: vi.fn(),
  onScope: vi.fn(),
  onSelection: vi.fn(),
  onBegin: vi.fn(),
  onMode: vi.fn(),
  onLocate: vi.fn(),
  onRestore: vi.fn(),
  onIntroSeen: vi.fn(),
})
const matcher = createMatcher({
  schemaVersion: 1,
  locale: 'zh-CN',
  hash: 'h',
  entries: [
    { id: 'gem:contagion', en: 'Contagion', zh: '瘟疫', kind: 'gem', tier: 'gray' },
    { id: 'unique:kaom', en: "Kaom's Heart", zh: '冈姆的壮志', kind: 'unique', tier: 'gray' },
    { id: 'base:ashen', en: 'Ashen Staff', zh: '枯灰长杖', kind: 'base', tier: 'gray' },
    { id: 'passive:eb', en: 'Eldritch Battery', zh: '异能魔力', kind: 'passive', tier: 'gray' },
    { id: 'asc:deadeye', en: 'Deadeye', zh: '锐眼', kind: 'ascendancy', tier: 'manual' },
    { id: 'kw:life', en: 'Maximum Life', zh: '生命上限', kind: 'keyword', tier: 'manual' },
  ],
  abbreviations: [],
})
const SOURCE =
  "As a Deadeye, cast Contagion from an Ashen Staff, wear Kaom's Heart and take Eldritch Battery for Maximum Life."
const ZH = '以锐眼身份用枯灰长杖施放瘟疫，穿冈姆的壮志，点出异能魔力以获得生命上限。'
const blocks: GuideBlock[] = [
  { id: 'p', kind: 'paragraph', text: SOURCE },
  { id: 'm', kind: 'modline', text: '+60 to maximum Life' },
]
const guide: GuideDocument = {
  version: 1,
  game: 'poe2',
  targetLocale: 'zh-CN',
  source: {
    url: 'https://example.com/guide',
    title: 'Build',
    siteId: 'generic',
    extractedAt: 't',
    scope: 'full',
  },
  stages: [],
  blocks,
}
const mount = (prepared: PreparedBlock[] = blocks.map((b) => prepareBlock(b, matcher))) => {
  const v = createReadingView(document, handlers(), 'test')
  document.body.append(v.root)
  v.showDocument(guide, prepared, null)
  // 仅侧栏模式挂载全部段落，便于逐段断言
  document.querySelector<HTMLButtonElement>('.reading-mode button[data-mode="sidebar"]')?.click()
  return v
}
const css = () =>
  ['packages/ui-theme/src/tokens.css', 'apps/poe2-extension/src/guide/guide.css']
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n')
const withCss = (run: () => void) => {
  const style = document.createElement('style')
  style.textContent = css()
  document.head.append(style)
  try {
    run()
  } finally {
    style.remove()
  }
}
const kindOf = (zh: string) =>
  [...document.querySelectorAll<HTMLElement>('[data-id="p"] .dst .poe2-term')].find(
    (s) => s.textContent === zh,
  )?.dataset.kind
afterEach(() => {
  document.body.textContent = ''
})

describe('translatedText 渲染路径', () => {
  const terms: TranslatedTerm[] = [{ start: 0, end: 2, en: 'Contagion', zh: '瘟疫', kind: 'gem' }]
  it('页内对照与划词气泡（默认）不带类型，只保留下划线标注', () => {
    const frag = translatedText(document, '瘟疫很强', terms)
    const span = frag.querySelector<HTMLElement>('.poe2-term')
    expect(span?.dataset.kind).toBeUndefined()
    expect(TERM_STYLE).not.toContain('data-kind')
    expect(TERM_STYLE).not.toMatch(/(?:^|[\s;{])color:/)
  })
  it('侧栏才写入类型；类型只认白名单，异常值退回下划线', () => {
    const host = document.createElement('p')
    host.append(translatedText(document, '瘟疫很强', terms, true, true))
    expect(host.querySelector<HTMLElement>('.poe2-term')?.dataset.kind).toBe('gem')
    expect(host.textContent).toBe('瘟疫很强')
    const odd = [{ ...terms[0], kind: 'x" onclick="' }] as unknown as TranslatedTerm[]
    const other = document.createElement('p')
    other.append(translatedText(document, '瘟疫很强', odd, true, true))
    expect(other.querySelector<HTMLElement>('.poe2-term')?.dataset.kind).toBeUndefined()
  })
})

describe('侧栏译文术语着色', () => {
  it('按条目类型着色；关键词只保留下划线；复制得到纯文本', () => {
    const v = mount()
    v.setTranslation('p', ZH, 'engine', [])
    expect(kindOf('瘟疫')).toBe('gem')
    expect(kindOf('冈姆的壮志')).toBe('unique')
    expect(kindOf('枯灰长杖')).toBe('base')
    expect(kindOf('异能魔力')).toBe('passive')
    expect(kindOf('锐眼')).toBe('ascendancy')
    expect(kindOf('生命上限')).toBe('keyword')
    expect(document.querySelector('[data-id="p"] .dst')?.textContent).toBe(ZH)
    withCss(() => {
      const color = (zh: string) => {
        const span = [...document.querySelectorAll<HTMLElement>('[data-id="p"] .poe2-term')].find(
          (s) => s.textContent === zh,
        )
        if (!span) throw new Error(`missing ${zh}`)
        return getComputedStyle(span).color
      }
      expect(color('瘟疫')).toBe('#43c1b5')
      expect(color('冈姆的壮志')).toBe('#e28a47')
      // DESIGN 普通物品 #e8e3d8、天赋与升华 #e3c463（令牌 --normal-item／--passive）
      expect(color('枯灰长杖')).toBe('#e8e3d8')
      expect(color('异能魔力')).toBe('#e3c463')
      expect(color('锐眼')).toBe('#e3c463')
      const body = getComputedStyle(document.querySelector('[data-id="p"] .dst') as Element).color
      expect(color('生命上限')).toBe(body)
      for (const zh of ['瘟疫', '冈姆的壮志', '枯灰长杖', '异能魔力'])
        expect(contrastRatio(color(zh), '#000000')).toBeGreaterThanOrEqual(4.5)
    })
  })
  it('旧数据缺少类型时不报错，只显示下划线', () => {
    const prepared = blocks.map((b) => {
      const p = prepareBlock(b, matcher)
      return { ...p, terms: p.terms.map(({ kind: _kind, ...t }) => t) }
    })
    const v = mount(prepared)
    v.setTranslation('p', ZH, 'cache', [])
    const spans = document.querySelectorAll<HTMLElement>('[data-id="p"] .dst .poe2-term')
    expect(spans.length).toBeGreaterThan(0)
    for (const s of spans) expect(s.dataset.kind).toBeUndefined()
  })
  it('词典整句词缀与引号内词缀用词缀色', () => {
    const p = prepareBlock(
      { id: 'q', kind: 'paragraph', text: 'Get "+60 to maximum Life".' },
      matcher,
    )
    const quoted: PreparedBlock = {
      ...p,
      statEvidence: [
        {
          start: 5,
          end: 24,
          en: '+60 to maximum Life',
          zh: '+60 最大生命',
          token: 0,
          evidence: [],
        },
      ],
    }
    const v = mount([...blocks.map((b) => prepareBlock(b, matcher)), quoted])
    v.setTranslation('m', '+60 最大生命', 'dictionary', [])
    v.setTranslation('q', '找“+60 最大生命”。', 'engine', [])
    const stat = document.querySelector<HTMLElement>('[data-id="q"] .poe2-term')
    expect(stat?.dataset.kind).toBe('stat')
    expect(stat?.textContent).toBe('+60 最大生命')
    withCss(() => {
      expect(getComputedStyle(document.querySelector('[data-id="m"] .dst') as Element).color).toBe(
        '#8f8fff',
      )
      expect(getComputedStyle(stat as Element).color).toBe('#8f8fff')
      expect(contrastRatio('#8f8fff', '#000000')).toBeGreaterThanOrEqual(4.5)
    })
  })
})

describe('术语图例', () => {
  const legend = () => document.querySelector<HTMLElement>('.guide-term-legend')
  it('有着色术语后才出现，说明颜色只表示类别，并列出会出现的类型', () => {
    const v = mount()
    expect(legend()?.hidden).toBe(true)
    v.setTranslation('p', ZH, 'engine', [])
    expect(legend()?.hidden).toBe(false)
    expect(legend()?.textContent).toContain('颜色只表示术语类别')
    const items = [...(legend()?.querySelectorAll<HTMLElement>('[data-kind]') ?? [])].map((s) => [
      s.dataset.kind,
      s.textContent,
    ])
    expect(items).toEqual([
      ['gem', '宝石'],
      ['unique', '传奇'],
      ['base', '基底'],
      ['passive', '天赋·升华'],
      ['stat', '词缀'],
    ])
    withCss(() => {
      for (const s of legend()?.querySelectorAll<HTMLElement>('[data-kind]') ?? []) {
        const color = getComputedStyle(s).color
        expect(contrastRatio(color, '#000000')).toBeGreaterThanOrEqual(4.5)
      }
      expect(getComputedStyle(legend() as Element).fontFamily).not.toContain('Serif')
    })
    v.setBlockState('p', 'failed', '网络错误')
    expect(legend()?.hidden).toBe(true)
  })
  it('只有关键词时不显示图例', () => {
    const v = mount()
    v.setTranslation('p', '获得生命上限。', 'engine', [])
    expect(legend()?.hidden).toBe(true)
  })
  it('强制色彩下退回下划线并隐藏图例', () => {
    const text = readFileSync('apps/poe2-extension/src/guide/guide.css', 'utf8')
    const forced = [...text.matchAll(/@media \(forced-colors: active\) \{([\s\S]*?)\n\}/g)]
      .map((m) => m[1])
      .join('\n')
    expect(forced).toMatch(/\.poe2-term\[data-kind\][^{]*\{[^}]*color: inherit;/)
    expect(forced).toMatch(/\.guide-term-legend\s*\{[^}]*display: none;/)
  })
})
