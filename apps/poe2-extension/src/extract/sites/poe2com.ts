import type { GuideBlock } from '@poe2-tools/guide-core'
import { collectBlocks, createSink } from '../blocks'
import { pickRoot } from './generic'

// poe2.com 文章页：评分、评论、分享、相关推荐区不属于正文。
// 2026-10-08 渲染快照（juice-box 策略页）没有 article/main：正文与目录侧栏（.juice-box-enter）同在
// #main-content 里，侧栏与流程图图例（StrategyDiagram_legend__*）不属于正文。
const ROOTS = ['article .entry-content', '.entry-content', 'article', 'main', '#main-content']
const EXTRA_SKIP =
  '[class*="rating"],[class*="comment"],[class*="share"],[class*="related"],.juice-box-enter,[class*="StrategyDiagram_legend"]'

export function extractPoe2com(doc: Document): GuideBlock[] {
  const sink = createSink()
  collectBlocks(pickRoot(doc, ROOTS), sink, EXTRA_SKIP)
  return sink.blocks
}
