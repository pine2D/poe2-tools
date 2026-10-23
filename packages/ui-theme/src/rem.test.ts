// 字号 rem 迁移（2026-10-23）：网站、扩展阅读侧栏／设置／站点管理的字号随 Chrome“字体大小”缩放；
// 默认 16px 根字号下与迁移前 px 完全一致（rem = 原 px / 16）。工具栏弹窗固定根字号 16px，CoE 浮层（l1.css）保持 px。
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseRules, rootTokens } from './testing/css'

const at = (path: string) => fileURLToPath(new URL(path, import.meta.url))
const read = (path: string) => readFileSync(at(path), 'utf8')
const ROOT_PX = 16

/** 迁移前的 px 取值（2026-10-23 之前的 tokens.css） */
const LEGACY_PX: Readonly<Record<string, number>> = {
  '--fs-micro': 12,
  '--fs-small': 13,
  '--fs-body': 14,
  '--fs-data': 15,
  '--fs-lead': 17,
  '--fs-title': 21,
  '--fs-display-s': 28,
  '--fs-display': 36,
  '--fs-display-l': 54,
}
/** 迁移前的流体字号：clamp(最小 px, vw, 最大 px) */
const LEGACY_FLUID: Readonly<Record<string, [number, string, number]>> = {
  '--fs-hero': [44, '6.4vw', 84],
  '--fs-hero-extension': [38, '5.2vw', 66],
  '--fs-section': [30, '3.4vw', 42],
}

/** “0.875rem” → 14（按 16px 根字号）；不是单个 rem 值返回 null */
const remToPx = (value: string): number | null => {
  const match = /^(\d*\.?\d+)rem$/.exec(value.trim())
  return match ? Number(match[1]) * ROOT_PX : null
}

/** 声明值里的字号部分：font-size 取整值；font 简写取斜杠前的长度或 --fs-* 令牌 */
const fontSizeOf = (prop: string, value: string): string | null => {
  if (prop === 'font-size') return value
  if (prop !== 'font') return null
  const parts = (value.split('/')[0] ?? '').trim().match(/var\([^)]*\)|\S+/g) ?? []
  return parts.find((part) => /^(\d*\.?\d+)(px|rem|em|%)$|^var\(--fs-/.test(part)) ?? null
}

const tokens = rootTokens(read('./tokens.css')).tokens
const componentDir = at('./components/')
const components = readdirSync(componentDir).filter((name) => name.endsWith('.css'))

describe('字号令牌写 rem，默认根字号下与迁移前一致', () => {
  it('--fs-* 固定档都是单个 rem 值，乘 16 等于迁移前的 px', () => {
    for (const [name, px] of Object.entries(LEGACY_PX)) {
      const value = tokens.get(name) ?? ''
      expect(value, name).toMatch(/^\d*\.?\d+rem$/)
      expect(remToPx(value), name).toBe(px)
    }
  })

  it('流体字号 clamp 的两端写 rem、中间 vw 不变，两端乘 16 等于迁移前的 px', () => {
    for (const [name, [min, vw, max]] of Object.entries(LEGACY_FLUID)) {
      const match = /^clamp\(([^,]+),\s*([^,]+),\s*([^)]+)\)$/.exec(tokens.get(name) ?? '')
      expect(match, name).not.toBeNull()
      const [, lo = '', mid = '', hi = ''] = match ?? []
      expect(remToPx(lo), name).toBe(min)
      expect(mid.trim(), name).toBe(vw)
      expect(remToPx(hi), name).toBe(max)
    }
  })

  it('tokens.css 的字号令牌里不再有 px', () => {
    const fonts = [...tokens].filter(([name]) => name.startsWith('--fs-'))
    expect(fonts.length).toBe(Object.keys(LEGACY_PX).length + Object.keys(LEGACY_FLUID).length)
    for (const [name, value] of fonts) expect(value, name).not.toMatch(/px/)
  })
})

describe('共享组件字号不写 px', () => {
  it('components/*.css 的 font-size 与 font 简写字号只用 --fs-* 令牌、rem、em 或 inherit', () => {
    const hits: string[] = []
    for (const file of components) {
      for (const rule of parseRules(readFileSync(`${componentDir}${file}`, 'utf8'))) {
        for (const [prop, value] of rule.declarations) {
          const size = fontSizeOf(prop, value)
          if (size === null) continue
          if (/\dpx\b/.test(size))
            hits.push(`${file} ${rule.selectors.join(', ')} { ${prop}: ${value} }`)
        }
      }
    }
    expect(hits).toEqual([])
  })

  it('检查器自身：认出 font 简写里的 px 字号', () => {
    expect(fontSizeOf('font', '600 15.5px / 1 var(--font-zh-cn)')).toBe('15.5px')
    expect(fontSizeOf('font', '700 var(--fs-data) / 1 var(--pt-serif)')).toBe('var(--fs-data)')
    expect(fontSizeOf('font', 'var(--fs-body) / 1.6 var(--font-zh-cn)')).toBe('var(--fs-body)')
    expect(fontSizeOf('font', '12px / 1.2 var(--font-zh-cn)')).toBe('12px')
    expect(fontSizeOf('font', '14px system-ui')).toBe('14px')
    expect(fontSizeOf('font', 'inherit')).toBeNull()
    expect(fontSizeOf('font-size', '0.78125rem')).toBe('0.78125rem')
  })
})

/** 某份 CSS 里 html、:root 规则（不论媒体条件）声明的 font-size */
const rootFontSizes = (css: string): string[] =>
  parseRules(css)
    .filter((rule) => rule.selectors.some((selector) => /^(html|:root)$/.test(selector)))
    .map((rule) => rule.declarations.get('font-size'))
    .filter((value): value is string => value !== undefined)

describe('根字号：弹窗固定，其余跟随浏览器', () => {
  it('工具栏弹窗 popup.css 在 :root 固定 font-size: 16px，阶梯 rem 恒等于迁移前 px', () => {
    const popup = read('../../../apps/poe2-extension/src/popup/popup.css')
    expect(rootFontSizes(popup)).toEqual(['16px'])
    const root = parseRules(popup).find(
      (rule) => rule.atRules.length === 0 && rule.selectors.includes(':root'),
    )
    expect(root?.declarations.get('font-size')).toBe('16px')
  })

  it('阅读侧栏、设置、站点管理与网站页面样式不固定根字号', () => {
    const sources: Record<string, string> = {
      'tokens.css': read('./tokens.css'),
      'index.css': read('./index.css'),
      'guide.css': read('../../../apps/poe2-extension/src/guide/guide.css'),
      'sites.css': read('../../../apps/poe2-extension/src/sites/sites.css'),
    }
    const site = at('../../../apps/site/src/shared/styles/')
    for (const name of readdirSync(site).filter((file) => file.endsWith('.css')))
      sources[`site/${name}`] = readFileSync(`${site}${name}`, 'utf8')
    for (const file of components)
      sources[`components/${file}`] = readFileSync(`${componentDir}${file}`, 'utf8')
    for (const [name, css] of Object.entries(sources)) expect(rootFontSizes(css), name).toEqual([])
  })

  it('侧栏与站点管理的扩展页面 HTML 不写内联根字号', () => {
    for (const page of ['guide.html', 'sites.html']) {
      const html = read(`../../../apps/poe2-extension/${page}`)
      expect(html, page).not.toMatch(/font-size/)
    }
  })
})

describe('CoE 浮层保持 px', () => {
  it('l1.css 不写 rem：Shadow DOM 里的 rem 取原站根字号，不可控', () => {
    const l1 = read('./l1.css').replace(/\/\*[\s\S]*?\*\//g, '')
    expect(l1).not.toMatch(/\drem\b/)
    const host = parseRules(l1).find((rule) => rule.selectors.join(',') === ':host')
    const fonts = [...(host?.declarations ?? [])].filter(([name]) => name.startsWith('--fs-'))
    expect(fonts.length).toBeGreaterThan(0)
    for (const [name, value] of fonts) {
      expect(value, name).toMatch(/^\d+px$/)
      expect(Number.parseFloat(value), name).toBe(LEGACY_PX[name])
    }
  })
})
