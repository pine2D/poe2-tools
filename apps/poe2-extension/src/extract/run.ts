import type {
  ExtractResult,
  GuideBlock,
  GuideDocument,
  GuideStage,
  SiteId,
} from '@poe2-tools/guide-core'
import { createSink } from './blocks'
import { extractGeneric } from './sites/generic'
import { documentSlug, extractMobalytics } from './sites/mobalytics'
import { extractPoe2com } from './sites/poe2com'

export interface PageLocation {
  hostname: string
  pathname: string
  href: string
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
): ExtractResult {
  if (loc.hostname === 'craftofexile.com' || loc.hostname.endsWith('.craftofexile.com'))
    return { ok: false, reason: 'coe' }
  const siteId = siteOf(loc.hostname)
  if (siteId === 'mobalytics' && !loc.pathname.startsWith('/poe-2/'))
    return { ok: false, reason: 'poe1' }

  let blocks: GuideBlock[]
  let stages: GuideStage[] = []
  // 站点适配器没读到数据、改用通用提取时置位，侧边栏据此常驻提示“站点可能改版”
  let fallback = false
  const selection = selectionText.trim()
  const scope = selection.length >= 2 ? 'selection' : 'full'
  if (scope === 'selection') {
    const sink = createSink()
    for (const line of selection.split(/\n\s*\n|\n/))
      sink.add('paragraph', line.replace(/\s+/g, ' ').trim())
    blocks = sink.blocks
  } else if (siteId === 'mobalytics') {
    const moba = extractMobalytics(doc, loc.pathname)
    // 只有攻略页（路径带 slug）读不到内嵌状态才算适配器失效；列表页等本来就走通用提取
    fallback = !moba && documentSlug(loc.pathname) !== ''
    blocks = moba ? moba.blocks : extractGeneric(doc)
    stages = moba ? moba.stages : []
  } else if (siteId === 'poe2com') {
    blocks = extractPoe2com(doc)
    if (blocks.reduce((n, b) => n + b.text.length, 0) < MIN_CHARS) {
      fallback = true
      blocks = extractGeneric(doc)
    }
  } else blocks = extractGeneric(doc)

  const chars = blocks.reduce((n, b) => n + b.text.length, 0)
  if (!blocks.length || (scope === 'full' && chars < MIN_CHARS))
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
  }
  return { ok: true, doc: guide }
}
