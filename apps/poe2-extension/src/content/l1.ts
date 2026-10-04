// L1 注入 UI 的共享样式与归属标识（spec §6.9）。l1.css 以字符串打进 content.js，构造一份 CSSStyleSheet，
// 经 adoptedStyleSheets 挂到各 shadow root；L1 共享样式不写进 document。原站 Fontin 位置的字体族规则是另一张
// 文档级样式，见 serif.ts（DESIGN.md“宿主全局样式”第 4 处）。
import l1Css from '@poe2-tools/ui-theme/l1.css?inline'
import { CORE_FACETS, EXT_CYAN, gemFacets, SYMBOLS } from '@poe2-tools/ui-theme/motif'

const sheets = new WeakMap<Document, CSSStyleSheet>()

/** 给 shadow root 挂上共享 L1 样式表；同一文档只构造一份，已挂过则不再追加 */
export function adoptL1(root: ShadowRoot) {
  const doc = root.ownerDocument
  let sheet = sheets.get(doc)
  if (!sheet) {
    const Sheet = doc.defaultView?.CSSStyleSheet ?? CSSStyleSheet
    sheet = new Sheet()
    sheet.replaceSync(l1Css)
    sheets.set(doc, sheet)
  }
  if (!root.adoptedStyleSheets.includes(sheet))
    root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet]
}

const SVG_NS = 'http://www.w3.org/2000/svg'

/** 扩展青 gem：母题 gem 符号（核心菱环 + 四刻面宝石），装饰，读屏不读 */
export function createGem(doc: Document, size: 12 | 16): SVGSVGElement {
  const svg = doc.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', SYMBOLS.gem.viewBox)
  svg.setAttribute('width', String(size))
  svg.setAttribute('height', String(size))
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('focusable', 'false')
  svg.setAttribute('class', 'gem')
  for (const [fill, d] of [...CORE_FACETS, ...gemFacets(EXT_CYAN)]) {
    const path = doc.createElementNS(SVG_NS, 'path')
    path.setAttribute('fill', fill)
    path.setAttribute('d', d)
    svg.append(path)
  }
  return svg
}
