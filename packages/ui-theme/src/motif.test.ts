// 母题生成物与唯一源一致（spec §4.5）：在内存里重算，与入库文件逐字节比较
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CORE_FACETS, EXT_CYAN, GEM_FACET_PATHS, gemFacets } from './motif'
import {
  GENERATED_NAMES,
  MOTIF_CSS_PROPERTIES,
  renderExtGemSvg,
  renderFaviconSvg,
  renderGenerated,
  renderLogoSvg,
} from './motif-css'
import { parseRules } from './testing/css'

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const generated = renderGenerated()

describe('母题生成物（spec §4.5）', () => {
  it('四个生成物与入库文件逐字节相同；不一致时运行 pnpm ui-theme:motif', () => {
    expect(GENERATED_NAMES).toEqual(['motif.css', 'favicon.svg', 'logo.svg', 'knot-full.svg'])
    for (const name of GENERATED_NAMES) {
      expect(
        read(`./generated/${name}`),
        `${name} 与 motif.ts 不一致，运行 pnpm ui-theme:motif`,
      ).toBe(generated[name])
    }
  })

  it('motif.css 只有一个 :root 块，恰好 17 个属性，顺序与取值格式符合契约 §3.7.1', () => {
    const css = generated['motif.css']
    expect(
      css.startsWith('/* 由 packages/ui-theme/scripts/build-motif-css.mjs 生成，勿手改 */\n'),
    ).toBe(true)
    const rules = parseRules(css)
    expect(rules).toHaveLength(1)
    expect(rules[0]?.selectors).toEqual([':root'])
    const declarations = rules[0]?.declarations ?? new Map<string, string>()
    expect([...declarations.keys()]).toEqual([...MOTIF_CSS_PROPERTIES])
    expect(MOTIF_CSS_PROPERTIES).toHaveLength(17)
    const values = [...declarations.values()]
    for (const value of values.slice(0, 9)) {
      expect(value).toMatch(/^url\("data:image\/svg\+xml,[^"\s]+"\)$/)
    }
    for (const value of values.slice(9)) expect(value).toMatch(/^(0|1|0\.\d{1,6})$/)
    expect(declarations.get('--pt-motif-corner-gem-x')).toBe('0.263158')
    expect(declarations.get('--pt-motif-corner-gem-y')).toBe('0.263158')
    for (const name of ['logo', 'knot', 'gem']) {
      expect(declarations.get(`--pt-motif-${name}-gem-x`)).toBe('0.5')
      expect(declarations.get(`--pt-motif-${name}-gem-y`)).toBe('0.5')
    }
  })

  it('宝石遮罩只含半对角线 4.9 的菱形，视框 -4.9 -4.9 9.8 9.8', () => {
    const declarations = parseRules(generated['motif.css'])[0]?.declarations
    const value = declarations?.get('--pt-motif-gem-mask') ?? ''
    const svg = decodeURIComponent(value.slice('url("data:image/svg+xml,'.length, -2))
    expect(svg).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4.9 -4.9 9.8 9.8"><path fill="#000" d="M0-4.9 4.9 0 0 4.9-4.9 0Z"/></svg>',
    )
  })

  it('SVG 与 data URI 除 xmlns 外不含任何 http 链接', () => {
    const xmlns = 'http://www.w3.org/2000/svg'
    for (const name of GENERATED_NAMES) {
      const text = name === 'motif.css' ? decodeURIComponent(generated[name]) : generated[name]
      expect(text.replaceAll(xmlns, ''), name).not.toMatch(/https?:/i)
    }
  })

  it('logo.svg 是 46×24、aria-hidden 的站点琥珀 logo', () => {
    const logo = renderLogoSvg()
    expect(
      logo.startsWith(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-24 -12.5 48 25" width="46" height="24" aria-hidden="true" focusable="false">',
      ),
    ).toBe(true)
    for (const color of ['#fff0c8', '#e3a24a', '#7a3d0c', '#b36a22']) expect(logo).toContain(color)
  })
})

describe('站点副本（spec §6.1）', () => {
  const site = (rel: string) => read(`../../../apps/site/${rel}`)

  it('apps/site/public/favicon.svg 与 generated/favicon.svg 同字节', () => {
    expect(site('public/favicon.svg'), '运行 pnpm ui-theme:motif').toBe(generated['favicon.svg'])
  })

  it('404 页顶部内联的 logo 就是 generated/logo.svg 的原样字符串', () => {
    expect(site('public/404.html')).toContain(renderLogoSvg())
  })

  it('构筑页内联 favicon 解码后等于 generated/favicon.svg 去掉末尾换行', () => {
    const href = /<link\s+rel="icon"\s+href="data:image\/svg\+xml,([^"]+)"/.exec(
      site('build/index.html'),
    )?.[1]
    expect(href).toBeDefined()
    expect(decodeURIComponent(href ?? '')).toBe(renderFaviconSvg())
  })
})

describe('扩展青 gem（spec §6.9、§6.10）', () => {
  it('EXT_CYAN 与 tokens.css 的 .pt-attr-ext 四个刻面色一致', () => {
    const tokens = readFileSync(fileURLToPath(new URL('./tokens.css', import.meta.url)), 'utf8')
    const rule = parseRules(tokens).find((r) => r.selectors.includes('.pt-attr-ext'))
    expect(rule).toBeDefined()
    expect([1, 2, 3, 4].map((i) => rule?.declarations.get(`--gem-${i}`))).toEqual([...EXT_CYAN])
  })
  it('gemFacets 按左上、右上、右下、左下给四块刻面配色', () => {
    expect(gemFacets(EXT_CYAN)).toEqual(GEM_FACET_PATHS.map((d, i) => [EXT_CYAN[i], d]))
  })
  it('renderExtGemSvg 是 gem 符号：核心菱环在下，扩展青宝石在上', () => {
    const svg = renderExtGemSvg()
    expect(
      svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="-12.5 -12.5 25 25">'),
    ).toBe(true)
    const fills = [...svg.matchAll(/<path fill="([^"]+)" d="([^"]+)"\/>/g)].map((m) => [m[1], m[2]])
    expect(fills).toEqual([...CORE_FACETS, ...gemFacets(EXT_CYAN)].map(([f, d]) => [f, d]))
  })
})
