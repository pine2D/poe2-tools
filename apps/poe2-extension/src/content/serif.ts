// 原站 Fontin 位置与扩展面板的中文衬线（扩展 0.4.0；DESIGN.md“宿主全局样式”第 4 处）。
// 原站：一张文档级 <style data-poe2-l10n="serif">，全文档唯一，只声明 font-family，选择器加 :root 前缀
// （特异性 +0,1,0，不依赖插入顺序），不写 !important、url()、@font-face；由 content/index.ts 的 reconcile 在 stop 时移除。
// 字体：包内 assets/serif-sc-l1.woff2 经 fetch → ArrayBuffer → FontFace 注册到 document.fonts。隔离世界注册的 face，
// 原站样式与各 shadow root 都能用（2026-10-04 无头 Chromium 实测）；ArrayBuffer 源不经过页面 CSP 的 font-src。
// 首次挂载时读取一次并在模块内记住（失败也记住）；停用时从 document.fonts 删除，再启用只重新 add。
// 失败（没有 FontFace 或 document.fonts、读取失败、load 被拒）只 warn 一行，不算初始化失败：栈里的下一个字体接手。
import { HOST_SERIF_FALLBACK, HOST_SERIF_SELECTORS } from '../adapters/coe-beta/serif'
import { platform } from '../platform'

/** 与 @poe2-tools/ui-theme/compliance 的 L1_FONT_FAMILY 相同（compliance.mjs 依赖 Node 模块，不能打进 content.js），由 tests/serif.test.ts 断言 */
export const SERIF_FAMILY = 'PoE2 Serif SC L1'
/** 包内路径：与 manifest 的 web_accessible_resources、check.mjs 的 L1_FONT_PATH 相同 */
export const SERIF_FONT_PATH = 'assets/serif-sc-l1.woff2'
const WARNING = '[PoE2 中文助手] 衬线字体未加载，中文保持无衬线'

/** 文档级字体规则：Fontin 在前，英文保持原站字形；汉字落到 L1 子集，其余缺字交给原站后备 */
export function serifCss(): string {
  const stack = ['Fontin', `"${SERIF_FAMILY}"`, HOST_SERIF_FALLBACK]
    .filter((part) => part !== '')
    .join(', ')
  const selectors = HOST_SERIF_SELECTORS.map((selector) => `:root ${selector}`).join(',\n')
  return `${selectors} {\n  font-family: ${stack};\n}\n`
}

function fontsOf(doc: Document): FontFaceSet | undefined {
  const fonts = (doc as { fonts?: FontFaceSet }).fonts
  return typeof fonts?.add === 'function' ? fonts : undefined
}

async function load(doc: Document): Promise<FontFace | null> {
  const Face = (globalThis as { FontFace?: typeof FontFace }).FontFace
  if (typeof Face !== 'function' || fontsOf(doc) === undefined) return null
  const response = await fetch(platform.resource(SERIF_FONT_PATH))
  if (!response.ok) return null
  const face = new Face(SERIF_FAMILY, await response.arrayBuffer(), {
    weight: '700',
    style: 'normal',
    display: 'swap',
  })
  return face.load()
}

// 同一文档只读一次字体（含失败）；current 是最近一次挂载的令牌，被取代的旧挂载 stop 时不动字体
let pending: Promise<FontFace | null> | undefined
let current: symbol | null = null

/** 挂上原站 Fontin 位置的字体规则并注册 L1 子集；返回的 stop 移除规则、从 document.fonts 删除字体 */
export function attachSerif(doc: Document): () => void {
  for (const old of doc.querySelectorAll('style[data-poe2-l10n="serif"]')) old.remove()
  const style = doc.createElement('style')
  style.dataset.poe2L10n = 'serif'
  style.textContent = serifCss()
  doc.head.append(style)
  const token = Symbol('serif')
  current = token
  let added: FontFace | null = null
  pending ??= load(doc)
    .catch(() => null)
    .then((face) => {
      if (face === null) console.warn(WARNING)
      return face
    })
  void pending.then((face) => {
    if (face === null || current !== token) return
    fontsOf(doc)?.add(face)
    added = face
  })
  return () => {
    style.remove()
    if (current !== token) return
    current = null
    if (added !== null) fontsOf(doc)?.delete(added)
  }
}
