import { CHECK_VERSION } from './check'
import { buildContexts, CONTEXT_VERSION } from './context'
import { MATCHER_VERSION, type Matcher } from './matcher'
import { type PreparedBlock, prepareBlock } from './prepare'
import { ROUTE_VERSION, routeBlock, type StatResolver } from './route'
import type { GuideBlock } from './types'

export interface GuideStats {
  hash: string
  ruleVersion: string
  resolve: StatResolver
}
// 浏览器和质量周期共用入口；固定所有已选块的语境后，调用方才能过滤缓存/阶段或重试。
export async function prepareGuideBlocks(
  blocks: readonly GuideBlock[],
  matcher: Matcher,
  stats: GuideStats,
): Promise<PreparedBlock[]> {
  const routes = new Map(blocks.map((b) => [b.id, routeBlock(b, stats.resolve)]))
  const contexts = await buildContexts(blocks.filter((b) => routes.get(b.id)?.kind !== 'preserved'))
  return blocks.map((b) => {
    const context = contexts.get(b.id)
    const route = routes.get(b.id)
    if (!route) throw new Error('缺少已选段落的路由')
    return {
      ...prepareBlock(b, matcher, stats.resolve),
      route,
      ...(context ? { context } : {}),
      processing: {
        kind: b.kind,
        ...(b.stageId !== undefined ? { stageId: b.stageId } : {}),
        entities: b.entities ?? [],
        emphasis: b.emphasis ?? [],
        verbatim: b.verbatim ?? [],
        breaks: b.breaks ?? [],
        ...(b.context ? { structure: b.context } : {}),
        rules: {
          route: ROUTE_VERSION,
          matcher: MATCHER_VERSION,
          checker: CHECK_VERSION,
          context: CONTEXT_VERSION,
          stats: `${stats.ruleVersion}:${stats.hash}`,
        },
        contextFingerprint: context?.fingerprint ?? '',
      },
    }
  })
}
