// 标记语法的呈现层工具，全部是纯函数，不碰 DOM。
// 关键点：标记可以跨行（rich.build 的 <grey>{Stat Priority\n---\n1. …} 横跨四行），
// 所以必须「整段先 tokenizeMarkup，再带着标记栈遍历、在文本节点内部遇到 \n 时开新行」。
// 反过来「先按 \n 切行再逐行分词」会让每一行的花括号都配不上对，退化成显示 <grey>{ 字面量。
import { type MarkupNode, tokenizeMarkup } from '@poe2-tools/build-core'

export interface MarkupSpan {
  text: string
  /** 从外到内的标记名，例如 <m>{<red>{x}} → ['m','red'] */
  tags: readonly string[]
}

export function splitMarkupLines(text: string): MarkupSpan[][] {
  if (text === '') return []
  const lines: MarkupSpan[][] = [[]]
  const push = (span: MarkupSpan): void => {
    lines[lines.length - 1]?.push(span)
  }
  const walk = (nodes: readonly MarkupNode[], tags: readonly string[]): void => {
    for (const node of nodes) {
      if (node.kind === 'tag') {
        walk(node.children, [...tags, node.tag])
        continue
      }
      const parts = node.value.split('\n')
      for (const [i, part] of parts.entries()) {
        if (i > 0) lines.push([])
        if (part !== '') push({ text: part, tags })
      }
    }
  }
  walk(tokenizeMarkup(text), [])
  return lines
}

export function spanText(spans: readonly MarkupSpan[]): string {
  let out = ''
  for (const span of spans) out += span.text
  return out
}

// 从行首砍掉 start 个字符（用于把编号行的 "3. " 前缀从正文里摘掉），跨段也正确
export function sliceSpans(spans: readonly MarkupSpan[], start: number): MarkupSpan[] {
  if (start <= 0) return [...spans]
  const out: MarkupSpan[] = []
  let left = start
  for (const span of spans) {
    if (left >= span.text.length) {
      left -= span.text.length
      continue
    }
    if (left > 0) {
      out.push({ text: span.text.slice(left), tags: span.tags })
      left = 0
      continue
    }
    out.push(span)
  }
  return out
}

// 命名颜色：值与对比度见计划正文的令牌表，全部 ≥4.5:1 vs --surface-2
const COLOR_TAGS = new Set([
  'red',
  'orange',
  'yellow',
  'green',
  'blue',
  'indigo',
  'violet',
  'black',
  'white',
  'grey',
  'bronze',
  'silver',
  'gold',
  'unique',
])
// 字号与字形：与颜色互不冲突，可以叠加（docs/build-format.md §3）
const OTHER_TAGS = new Set(['s', 'm', 'l', 'r', 'b', 'i', 'u'])

// 最内层的颜色标签胜出（<red>{a<green>{b}} 里的 b 是绿的）；
// 字号 / 字形标签全部保留并叠加；未知标签不产生类名，文字照常透传。
export function markupClass(tags: readonly string[]): string {
  const classes: string[] = []
  let color: string | null = null
  for (const tag of tags) {
    const lower = tag.toLowerCase()
    if (COLOR_TAGS.has(lower)) color = `mk-${lower}`
    else if (OTHER_TAGS.has(lower)) classes.push(`mk-${lower}`)
  }
  if (color !== null) classes.push(color)
  return classes.join(' ')
}

const RGB = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i
// 对照表所在的卡片底
const TIP_BG = [0x1d, 0x1a, 0x14] as const

function channel(value: number): number {
  const c = value / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function luminance(rgb: readonly number[]): number {
  return (
    0.2126 * channel(rgb[0] ?? 0) + 0.7152 * channel(rgb[1] ?? 0) + 0.0722 * channel(rgb[2] ?? 0)
  )
}

function contrast(a: readonly number[], b: readonly number[]): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

function hex(rgb: readonly number[]): string {
  return `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`
}

// <rgb(r,g,b)>{...} 自定义颜色：原值优先，低于 4.5:1 时按 6% 一档向白混合提亮
// （保色相、降饱和，不换色相），最多 40 档；不是 rgb 标签返回 null。
export function resolveRgbTag(tag: string): string | null {
  const match = RGB.exec(tag.trim())
  if (match === null) return null
  let rgb = [1, 2, 3].map((i) => Math.min(255, Number(match[i] ?? 0)))
  for (let step = 0; step < 40 && contrast(rgb, TIP_BG) < 4.5; step += 1) {
    rgb = rgb.map((v) => v + (255 - v) * 0.06)
  }
  return hex(rgb)
}
