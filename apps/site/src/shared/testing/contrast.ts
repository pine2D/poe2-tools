// WCAG 2.1 相对亮度与对比度。只在测试里用（浅色令牌的门禁），不进生产包。
// 与 preview/markup.ts 里那份 rgb 自动提亮的算法同源，但那份要跑在浏览器里、
// 只认 [r,g,b] 数组；这份认 #rrggbb 字符串并额外提供 alpha 合成，两边各自保留。

function channel(value: number): number {
  const c = value / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function parse(hex: string): [number, number, number] {
  const clean = hex.trim().replace('#', '')
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean
  return [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16)) as [number, number, number]
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = parse(hex)
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

// 半透明色压在底色上之后的实际颜色。带 alpha 的令牌（描边、底纹）必须先合成再算对比度，
// 直接拿原色算会高估两三倍。
export function blend(fg: string, alpha: number, bg: string): string {
  const front = parse(fg)
  const back = parse(bg)
  const mixed = front.map((value, i) => Math.round(alpha * value + (1 - alpha) * (back[i] ?? 0)))
  return `#${mixed.map((v) => v.toString(16).padStart(2, '0')).join('')}`
}
