import type { GuideBlock } from '@poe2-tools/guide-core'
import { collectBlocks, createSink } from '../blocks'
import { pickRoot } from './generic'

// poe2.com 文章页：评分、评论、分享、相关推荐区不属于正文。
// 2026-10-08 渲染快照（juice-box 策略页）没有 article/main：正文与目录侧栏（.juice-box-enter）同在
// #main-content 里，侧栏与流程图图例（StrategyDiagram_legend__*）不属于正文。
const ROOTS = ['article .entry-content', '.entry-content', 'article', 'main', '#main-content']
const EXTRA_SKIP =
  '[class*="rating"],[class*="comment"],[class*="share"],[class*="related"],.juice-box-enter,[class*="StrategyDiagram_legend"]'

// 2026-10-19 实站：专名组件带匹配可见名称的 tooltip 标题和 poe2db 英文词条链接。
// 参考资料链接、普通强调和同名纯文本都不因此升级为实体；不跟随链接联网。
function entityMarker(el: Element, text: string): boolean {
  if (el.tagName !== 'A') return false
  const title = el.getAttribute('title')?.replace(/\s+/g, ' ').trim()
  if (title !== `${text} — hover for tooltip, click for poe2db`) return false
  try {
    const url = new URL(el.getAttribute('href') ?? '')
    return (
      url.protocol === 'https:' &&
      url.hostname === 'poe2db.tw' &&
      /^\/us\/[^/]+$/.test(url.pathname)
    )
  } catch {
    return false
  }
}

export function extractPoe2com(doc: Document): GuideBlock[] {
  const sink = createSink()
  collectBlocks(pickRoot(doc, ROOTS), sink, EXTRA_SKIP, entityMarker)
  return sink.blocks
}
