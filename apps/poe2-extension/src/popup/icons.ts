// 弹窗状态图标（方向约定 OWN-WORLD）：内联 SVG，用形状区分状态，不只靠颜色；颜色随 currentColor，由 popup.css 按 data-kind 给。
// ok／part／off 与网站扩展介绍页 StateIcon（apps/site/src/pages/extension/ExtensionPage.tsx）同形；
// mute 圆中横线表示用户自己关闭，reading 虚线圆表示状态未知。不用 ✓ 等字形。
import type { PageKind } from './page-view'

const SVG_NS = 'http://www.w3.org/2000/svg'
const MARKS: Readonly<Record<PageKind, readonly { d: string; filled?: boolean }[]>> = {
  ok: [{ d: 'm8 12.5 2.8 2.8L16.5 9.5' }],
  part: [{ d: 'M12 3v18' }, { d: 'M12 3a9 9 0 0 1 0 18z', filled: true }],
  off: [{ d: 'm9 9 6 6M15 9l-6 6' }],
  mute: [{ d: 'M8.5 12h7' }],
  reading: [],
}

function create<K extends 'svg' | 'circle' | 'path'>(
  doc: Document,
  tag: K,
  attributes: Record<string, string>,
): SVGElementTagNameMap[K] {
  const element = doc.createElementNS(SVG_NS, tag)
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value)
  return element
}

export function stateIcon(doc: Document, kind: PageKind): SVGSVGElement {
  const svg = create(doc, 'svg', {
    viewBox: '0 0 24 24',
    width: '18',
    height: '18',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '2',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
    focusable: 'false',
  })
  const ring: Record<string, string> = { cx: '12', cy: '12', r: '9' }
  if (kind === 'reading') ring['stroke-dasharray'] = '3.2 3.9'
  svg.append(create(doc, 'circle', ring))
  for (const mark of MARKS[kind])
    svg.append(
      create(
        doc,
        'path',
        mark.filled ? { d: mark.d, fill: 'currentColor', stroke: 'none' } : { d: mark.d },
      ),
    )
  return svg
}
