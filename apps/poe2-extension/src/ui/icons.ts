import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Grip,
  LocateFixed,
  Pin,
  PinOff,
  RotateCcw,
  Settings,
  SlidersHorizontal,
  X,
} from 'lucide'

const icons = {
  check: Check,
  chevronDown: ChevronDown,
  previous: ChevronLeft,
  next: ChevronRight,
  copy: Copy,
  move: Grip,
  locate: LocateFixed,
  pin: Pin,
  unpin: PinOff,
  reload: RotateCcw,
  settings: Settings,
  scope: SlidersHorizontal,
  close: X,
}
export type IconName = keyof typeof icons
/** 只导入用到的 Lucide 路径；用调用方 Document 构建，支持 Shadow DOM 和测试文档。 */
export function icon(doc: Document, name: IconName): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg'
  const svg = doc.createElementNS(ns, 'svg')
  for (const [key, value] of Object.entries({
    viewBox: '0 0 24 24',
    width: '18',
    height: '18',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '1.75',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
    focusable: 'false',
    class: 'ui-icon',
  }))
    svg.setAttribute(key, value)
  for (const [tag, attrs] of icons[name]) {
    const child = doc.createElementNS(ns, tag)
    for (const [key, value] of Object.entries(attrs)) child.setAttribute(key, String(value))
    svg.append(child)
  }
  return svg
}
export function labelIcon(button: HTMLButtonElement, name: IconName, label: string) {
  button.replaceChildren(icon(button.ownerDocument, name))
  button.title = label
  button.setAttribute('aria-label', label)
  button.classList.add('icon-button')
}
export function disclosure(doc: Document, label: string) {
  const summary = doc.createElement('summary')
  const text = doc.createElement('span')
  text.textContent = label
  summary.append(text, icon(doc, 'chevronDown'))
  return summary
}
