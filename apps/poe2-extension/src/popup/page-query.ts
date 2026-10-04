import { platform } from '../platform'
import { PAGE_STATE_TYPE, type PageStateReply, parseReply } from '../protocol'

export type PageProbe =
  | { status: 'reading' }
  | { status: 'none' }
  | { status: 'reply'; tabId: number; reply: PageStateReply; settled: boolean }

// 常量由第三期 Task 1 实测确认（.superpowers/sdd/2026-10-04-phase3/probe/probe.md）；改值只改这里，测试按常量推算。
// 改值时保持 LOADING_LIMIT_MS、SETTLE_LIMIT_MS 分别是对应 RETRY 的整数倍。
/** 单次询问的超时；超时与 reject 都算无应答。实测非超时询问最长 918 ms（刷新后内容脚本启动期间），×2 取整到 2000 */
export const ASK_TIMEOUT_MS = 2000
/** 标签页加载中（或刚点“刷新页面”）时，无应答每隔多久再问 */
export const LOADING_RETRY_MS = 500
/** 加载中重问的上限，从本轮开始计；到点仍无应答即“本页没有中文助手” */
export const LOADING_LIMIT_MS = 10_000
/** 应答为 starting 或 page=unknown 时每隔多久重查 */
export const SETTLE_RETRY_MS = 500
/** 重查上限，从本轮第一次拿到应答计；到点以 settled=true 发出 */
export const SETTLE_LIMIT_MS = 5000
/** 页面已加载完却无应答时，隔多久再问最后一次（document_idle 注入前、原站切页瞬间） */
export const IDLE_RETRY_MS = 300

const REQUEST = { type: PAGE_STATE_TYPE, v: 1 } as const

/**
 * 弹窗读取当前标签页状态（第三期裁定 2、4）。只把事实交给 onChange，状态由 pageView 推导。
 * 相同结果不重复发出；refresh() 重查且不先显示“读取中”；reload() 刷新最近一次拿到应答的标签页，
 * 刷新后在标签页仍加载中、且尚未出现过无应答之前收到的应答当作旧页面卸载前的回声忽略。
 */
export function watchPage(onChange: (probe: PageProbe) => void): {
  refresh(): void
  reload(): Promise<void>
  dispose(): void
} {
  let generation = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let disposed = false
  let lastKey = ''
  let tabId: number | null = null
  const emit = (probe: PageProbe) => {
    const key = JSON.stringify(probe)
    if (disposed || key === lastKey) return
    lastKey = key
    onChange(probe)
  }
  function run(reloading: boolean) {
    const id = ++generation
    clearTimeout(timer)
    const began = Date.now()
    let firstReply: number | null = null
    let idleRetried = false
    let sawSilence = false
    const current = () => !disposed && id === generation
    const later = (ms: number) => {
      timer = setTimeout(() => void attempt(), ms)
    }
    async function attempt() {
      let tab: { id: number; loading: boolean } | null
      try {
        tab = await platform.activeTab()
      } catch {
        tab = null
      }
      if (!current()) return
      if (!tab) {
        emit({ status: 'none' })
        return
      }
      const reply = parseReply(await platform.ask(tab.id, REQUEST, ASK_TIMEOUT_MS))
      if (!current()) return
      const now = Date.now()
      const waiting = tab.loading || reloading
      if (reply === null) sawSilence = true
      const stale = reply !== null && reloading && tab.loading && !sawSilence
      if (reply === null || stale) {
        if (waiting && now - began < LOADING_LIMIT_MS) {
          emit({ status: 'reading' })
          later(LOADING_RETRY_MS)
          return
        }
        if (reply === null) {
          if (!waiting && !idleRetried) {
            idleRetried = true
            later(IDLE_RETRY_MS)
            return
          }
          emit({ status: 'none' })
          return
        }
      }
      tabId = tab.id
      firstReply ??= now
      const pending = reply.phase === 'starting' || reply.page === 'unknown'
      const settled = !pending || now - firstReply >= SETTLE_LIMIT_MS
      emit({ status: 'reply', tabId: tab.id, reply, settled })
      if (!settled) later(SETTLE_RETRY_MS)
    }
    void attempt()
  }
  emit({ status: 'reading' })
  run(false)
  return {
    refresh() {
      if (!disposed) run(false)
    },
    async reload() {
      if (disposed || tabId === null) return
      const target = tabId
      generation++
      clearTimeout(timer)
      emit({ status: 'reading' })
      try {
        await platform.reload(target)
      } catch {
        // 标签页已关闭等：照常进入刷新模式，随后按无应答落到“本页没有中文助手”
      }
      if (!disposed) run(true)
    },
    dispose() {
      disposed = true
      generation++
      clearTimeout(timer)
    },
  }
}
