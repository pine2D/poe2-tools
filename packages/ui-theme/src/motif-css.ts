// 由 motif.ts / noise.ts 生成 motif.css 与各 SVG 的纯函数（spec §4.5）。
// scripts/build-motif-css.mjs 写盘，motif.test.ts 在内存里重算后逐字节比较。
import type { Facet, MotifSymbol, MotifSymbolName } from './motif.ts'
import {
  ARM_L_EXTRA,
  ARMS,
  CORE_FACETS,
  FAVICON,
  GEM_DIAMOND_PATH,
  GEM_FACET_PATHS,
  GEM_HALF_DIAGONAL,
  SITE_AMBER,
  SYMBOLS,
} from './motif.ts'
import { GRAIN_DATA_URI, KNOT_FULL_GRAIN_FILTER } from './noise.ts'

export type GeneratedName = 'motif.css' | 'favicon.svg' | 'logo.svg' | 'knot-full.svg'
export const GENERATED_NAMES: readonly GeneratedName[] = [
  'motif.css',
  'favicon.svg',
  'logo.svg',
  'knot-full.svg',
]

/** motif.css 里 :root 上的全部属性名，按输出顺序；恰好 17 个 */
export const MOTIF_CSS_PROPERTIES: readonly string[] = [
  '--pt-motif-logo',
  '--pt-motif-knot',
  '--pt-motif-corner-tl',
  '--pt-motif-corner-tr',
  '--pt-motif-corner-bl',
  '--pt-motif-corner-br',
  '--pt-motif-gem-ring',
  '--pt-motif-gem-mask',
  '--pt-grain',
  '--pt-motif-logo-gem-x',
  '--pt-motif-logo-gem-y',
  '--pt-motif-knot-gem-x',
  '--pt-motif-knot-gem-y',
  '--pt-motif-corner-gem-x',
  '--pt-motif-corner-gem-y',
  '--pt-motif-gem-gem-x',
  '--pt-motif-gem-gem-y',
]

const XMLNS = 'http://www.w3.org/2000/svg'
// 全形铆钉的径向渐变取值（mockup :541-543）；几何在 motif.ts 的 ARM_L_EXTRA
const RIVET_GRADIENT = { id: 'm-rivet', cx: '.35', cy: '.3', r: '.8' } as const

/** 'data:image/svg+xml,' + encodeURIComponent(svg) */
export function svgDataUri(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

function paths(facets: readonly Facet[]): string {
  return facets.map(([fill, d]) => `<path fill="${fill}" d="${d}"/>`).join('')
}

function group(body: string, transform: string): string {
  return `<g transform="${transform}">${body}</g>`
}

function svg(viewBox: string, body: string, extra = ''): string {
  return `<svg xmlns="${XMLNS}" viewBox="${viewBox}"${extra}>${body}</svg>`
}

function armBody(arms: MotifSymbol['arms']): string {
  if (arms === null) return ''
  if (arms !== 'l') return paths(ARMS[arms])
  const { notch, rivet } = ARM_L_EXTRA
  return (
    paths(ARMS.m) +
    `<path stroke="#120a04" stroke-width=".8" d="${notch}"/>` +
    `<circle fill="#120a04" cx="${rivet.cx}" cy="${rivet.cy}" r="${rivet.outerR}"/>` +
    `<circle fill="url(#${RIVET_GRADIENT.id})" cx="${rivet.cx}" cy="${rivet.cy}" r="${rivet.innerR}"/>`
  )
}

/** 底层（不换色）：臂 + 核心，不含宝石 */
function baseBody(name: MotifSymbolName): string {
  const { arms, layout } = SYMBOLS[name]
  const arm = armBody(arms)
  const core = paths(CORE_FACETS)
  if (layout === 'core') return core
  const mirror = layout === 'pair' ? 'scale(-1 1)' : 'rotate(90) scale(1 -1)'
  return arm + group(arm, mirror) + core
}

/** 站点琥珀宝石的四块刻面 */
function amberGem(): string {
  return GEM_FACET_PATHS.map((d, i) => `<path fill="${SITE_AMBER[i]}" d="${d}"/>`).join('')
}

function cssUrl(svgText: string): string {
  return `url("${svgDataUri(svgText)}")`
}

// 角饰四个方向预先镜像：视框沿对应轴翻到另一侧，图形用 scale 翻回
function cornerUrl(flipX: boolean, flipY: boolean): string {
  const [minX = 0, minY = 0, width = 0, height = 0] = SYMBOLS.corner.viewBox.split(' ').map(Number)
  const x = flipX ? -(minX + width) : minX
  const y = flipY ? -(minY + height) : minY
  const body = baseBody('corner')
  const scale = `scale(${flipX ? -1 : 1} ${flipY ? -1 : 1})`
  return cssUrl(svg(`${x} ${y} ${width} ${height}`, flipX || flipY ? group(body, scale) : body))
}

function ratio(value: number): string {
  return String(Number(value.toFixed(6)))
}

export function renderMotifCss(): string {
  const half = GEM_HALF_DIAGONAL
  const mask = svg(
    `${-half} ${-half} ${half * 2} ${half * 2}`,
    `<path fill="#000" d="${GEM_DIAMOND_PATH}"/>`,
  )
  const values: Record<string, string> = {
    '--pt-motif-logo': cssUrl(svg(SYMBOLS.logo.viewBox, baseBody('logo'))),
    '--pt-motif-knot': cssUrl(svg(SYMBOLS.knot.viewBox, baseBody('knot'))),
    '--pt-motif-corner-tl': cornerUrl(false, false),
    '--pt-motif-corner-tr': cornerUrl(true, false),
    '--pt-motif-corner-bl': cornerUrl(false, true),
    '--pt-motif-corner-br': cornerUrl(true, true),
    '--pt-motif-gem-ring': cssUrl(svg(SYMBOLS.gem.viewBox, baseBody('gem'))),
    '--pt-motif-gem-mask': cssUrl(mask),
    '--pt-grain': `url("${GRAIN_DATA_URI}")`,
  }
  for (const name of ['logo', 'knot', 'corner', 'gem'] as const) {
    const [x, y] = SYMBOLS[name].gemCenter
    values[`--pt-motif-${name}-gem-x`] = ratio(x)
    values[`--pt-motif-${name}-gem-y`] = ratio(y)
  }
  const lines = MOTIF_CSS_PROPERTIES.map((name) => `  ${name}: ${values[name]};`)
  return [
    '/* 由 packages/ui-theme/scripts/build-motif-css.mjs 生成，勿手改 */',
    ':root {',
    ...lines,
    '}',
  ].join('\n')
}

/** 不带末尾换行；根元素 <svg xmlns="http://www.w3.org/2000/svg" viewBox="-16 -16 32 32">，首个子元素是 <title>（Biome 的 a11y 规则要求） */
export function renderFaviconSvg(): string {
  const { viewBox, background, radius } = FAVICON
  const [minX = 0, minY = 0, width = 0, height = 0] = viewBox.split(' ').map(Number)
  const plate = `<rect x="${minX}" y="${minY}" width="${width}" height="${height}" rx="${radius}" fill="${background}"/>`
  return svg(viewBox, `<title>PoE2 Tools</title>${plate}${baseBody('logo')}${amberGem()}`)
}

/** 不带末尾换行；宝石为站点琥珀 */
export function renderLogoSvg(): string {
  return svg(
    SYMBOLS.logo.viewBox,
    baseBody('logo') + amberGem(),
    ' width="46" height="24" aria-hidden="true" focusable="false"',
  )
}

/** 不带末尾换行；全形（叶瓣、刻痕、铆钉、颗粒），只用于 DESIGN.md 档案图 */
export function renderKnotFullSvg(): string {
  const stops = ARM_L_EXTRA.rivetStops
    .map(([offset, color]) => `<stop offset="${offset}" stop-color="${color}"/>`)
    .join('')
  const { id, cx, cy, r } = RIVET_GRADIENT
  const defs = `<defs><radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">${stops}</radialGradient>${KNOT_FULL_GRAIN_FILTER}</defs>`
  const body = `<g filter="url(#grain)">${baseBody('knot-full')}${amberGem()}</g>`
  return svg(
    SYMBOLS['knot-full'].viewBox,
    `<title>符文菱结全形</title>${defs}${body}`,
    ' width="284" height="100"',
  )
}

/** 四个生成物的完整文件内容，每个以单个 '\n' 结尾 */
export function renderGenerated(): Readonly<Record<GeneratedName, string>> {
  return {
    'motif.css': `${renderMotifCss()}\n`,
    'favicon.svg': `${renderFaviconSvg()}\n`,
    'logo.svg': `${renderLogoSvg()}\n`,
    'knot-full.svg': `${renderKnotFullSvg()}\n`,
  }
}
