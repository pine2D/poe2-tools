import { pageStatus } from '../adapters/coe-beta/context'
import { searchPresence } from '../adapters/coe-beta/search'
import type { PageStateReply } from '../protocol'

/**
 * 内容脚本对弹窗询问的应答（第三期裁定 1、5、6）：只汇总事实，不做展示判断。
 * page 在应答时现算；mode 为空（关闭或不满足条件）时不数、不查搜索框。
 */
export function snapshot(input: {
  phase: PageStateReply['phase']
  error: PageStateReply['error']
  enabled: boolean
  mode: '' | 'zh-CN' | 'bilingual'
  doc: Document
  href: string
  counters: readonly (() => number)[]
}): PageStateReply {
  const active = input.mode !== ''
  const presence = active ? searchPresence(input.doc) : { search: 'none' as const, missing: [] }
  return {
    v: 1,
    phase: input.phase,
    error: input.error,
    page: pageStatus(input.doc, input.href),
    enabled: input.enabled,
    translated: active ? input.counters.reduce((sum, count) => sum + count(), 0) : 0,
    search: presence.search,
    searchMissing: presence.missing,
  }
}
