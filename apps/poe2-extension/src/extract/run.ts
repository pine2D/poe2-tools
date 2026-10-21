import type {
  ExtractionDiagnostic,
  ExtractResult,
  GuideBlock,
  GuideDocument,
  GuideStage,
  SiteId,
} from '@poe2-tools/guide-core'
import { collectBlocks, createSink } from './blocks'
import { extractGeneric, pickRoot } from './sites/generic'
import { documentSlug, extractMobalytics } from './sites/mobalytics'
import { entityMarker, extractPoe2com } from './sites/poe2com'
import { type CaptureBlock, selectedSources, sourceRange } from './source'

export interface PageLocation {
  hostname: string
  pathname: string
  href: string
}

export interface ExtractOptions {
  scope: 'full' | 'selection' | 'region'
  regionRoot?: Element
  onBlock?: CaptureBlock
}

const MIN_CHARS = 80

const siteOf = (host: string): SiteId =>
  host === 'mobalytics.gg' || host.endsWith('.mobalytics.gg')
    ? 'mobalytics'
    : host === 'poe2.com' || host.endsWith('.poe2.com')
      ? 'poe2com'
      : 'generic'

export function extractPage(
  doc: Document,
  loc: PageLocation,
  selectionText: string,
  now: string,
  selectedRange?: Range,
  options: ExtractOptions = { scope: 'full' },
): ExtractResult {
  if (loc.hostname === 'craftofexile.com' || loc.hostname.endsWith('.craftofexile.com'))
    return { ok: false, reason: 'coe' }
  const siteId = siteOf(loc.hostname)
  if (siteId === 'mobalytics' && !loc.pathname.startsWith('/poe-2/'))
    return { ok: false, reason: 'poe1' }

  const diagnostics: ExtractionDiagnostic[] = []
  let blocks: GuideBlock[]
  let stages: GuideStage[] = []
  // 站点适配器没读到数据、改用通用提取时置位，侧边栏据此在站点行常驻提示（Mobalytics 多为站内跳转，其他站点提示可能改版）
  let fallback = false
  const selection = selectionText.trim()
  const scope = options.scope
  if (scope === 'selection') {
    const sink = createSink(diagnostics)
    if (selectedRange && !selectedRange.collapsed) {
      // 克隆范围本身，不读祖先或邻段的文字；浅克隆仅保留选中内容的语义包装。
      const root = doc.createElement('div')
      const common = selectedRange.commonAncestorContainer
      const ancestor = common.nodeType === 1 ? (common as Element) : common.parentElement
      const fragment = selectedRange.cloneContents()
      const sources = selectedSources(selectedRange, fragment)
      if (!sources) return { ok: false, reason: 'empty' }
      const wrapper = ancestor?.cloneNode(false) as Element | undefined
      if (wrapper) {
        wrapper.appendChild(fragment)
        root.appendChild(wrapper)
      } else root.appendChild(fragment)
      const capture: CaptureBlock = (block, copy) => {
        const a = sources.get(copy.start),
          z = sources.get(copy.end)
        if (!a || !z || !options.onBlock) return
        const source = {
          ...copy,
          start: a.node,
          startOffset: a.from + copy.startOffset,
          end: z.node,
          endOffset: z.from + copy.endOffset,
        }
        const range = sourceRange(source)
        const common = range.commonAncestorContainer
        source.container =
          common.nodeType === 1 ? (common as Element) : (common.parentElement ?? doc.body)
        source.quote = range.toString()
        options.onBlock(block, source)
      }
      collectBlocks(root, sink, '', siteId === 'poe2com' ? entityMarker : undefined, true, capture)
    } else {
      for (const line of selection.split(/\n\s*\n|\n/))
        sink.add('paragraph', line.replace(/\s+/g, ' ').trim())
    }
    blocks = sink.blocks
  } else if (scope === 'region') {
    const root = options.regionRoot
    if (!root || !doc.body.contains(root)) return { ok: false, reason: 'empty' }
    const sink = createSink(diagnostics)
    collectBlocks(
      root,
      sink,
      '',
      siteId === 'poe2com' ? entityMarker : undefined,
      true,
      options.onBlock,
    )
    blocks = sink.blocks
  } else if (siteId === 'mobalytics') {
    const moba = extractMobalytics(doc, loc.pathname, diagnostics)
    // 只有攻略页（路径带 slug）读不到内嵌状态才算适配器失效；列表页等本来就走通用提取
    fallback = !moba && documentSlug(loc.pathname) !== ''
    blocks = moba ? moba.blocks : extractGeneric(doc, diagnostics, options.onBlock)
    stages = moba ? moba.stages : []
  } else if (siteId === 'poe2com') {
    blocks = extractPoe2com(doc, diagnostics, options.onBlock)
    if (blocks.reduce((n, b) => n + b.text.length, 0) < MIN_CHARS) {
      fallback = true
      diagnostics.length = 0
      blocks = extractGeneric(doc, diagnostics, options.onBlock)
    }
  } else blocks = extractGeneric(doc, diagnostics, options.onBlock)

  const chars = blocks.reduce((n, b) => n + b.text.length, 0)
  if (!blocks.length || (scope === 'full' && chars < MIN_CHARS && pickRoot(doc) === doc.body))
    return { ok: false, reason: 'empty' }
  const guide: GuideDocument = {
    version: 1,
    game: 'poe2',
    targetLocale: 'zh-CN',
    source: {
      url: loc.href,
      title: (doc.title || loc.hostname).trim().slice(0, 300),
      siteId,
      extractedAt: now,
      scope,
      ...(fallback ? { fallback: true as const } : {}),
    },
    stages,
    blocks,
    ...(diagnostics.length ? { diagnostics } : {}),
  }
  return { ok: true, doc: guide }
}
