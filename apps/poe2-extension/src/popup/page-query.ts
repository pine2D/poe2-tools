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
 * 刷新模式从 reload() 开始，到采纳新页应答或判定无应答为止；其间 refresh() 不退出刷新模式（R-T3b）。
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
  // 刷新模式：pending 是等浏览器开始刷新，on 是刷新后的这一轮询问；silent 记刷新后是否出现过无应答（旧页已卸载）
  let reloadMode: 'off' | 'pending' | 'on' = 'off'
  let silent = false
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
    let lastReply: PageStateReply | null = null
    let idleRetried = false
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
        if (reloading) reloadMode = 'off'
        emit({ status: 'none' })
        return
      }
      const reply = parseReply(await platform.ask(tab.id, REQUEST, ASK_TIMEOUT_MS))
      if (!current()) return
      const now = Date.now()
      const waiting = tab.loading || reloading
      if (reply === null) silent = true
      // 本轮已拿到过应答，证明是 beta 页：之后的无应答（挂层期间询问超时等）按“读取中”重查到 SETTLE_LIMIT_MS，
      // 到点以最后一次应答 settled 发出，不报“本页没有中文助手”（R-T3a）
      if (reply === null && lastReply !== null && firstReply !== null) {
        if (now - firstReply < SETTLE_LIMIT_MS) {
          emit({ status: 'reading' })
          later(SETTLE_RETRY_MS)
          return
        }
        emit({ status: 'reply', tabId: tab.id, reply: lastReply, settled: true })
        return
      }
      const stale = reply !== null && reloading && tab.loading && !silent
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
          if (reloading) reloadMode = 'off'
          emit({ status: 'none' })
          return
        }
      }
      if (reloading) reloadMode = 'off'
      tabId = tab.id
      firstReply ??= now
      lastReply = reply
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
      // 等浏览器开始刷新期间不抢先询问旧页（随后 reload() 自己开始这一轮）；刷新模式中保持旧页回声保护
      if (disposed || reloadMode === 'pending') return
      run(reloadMode === 'on')
    },
    async reload() {
      if (disposed || tabId === null) return
      const target = tabId
      generation++
      clearTimeout(timer)
      reloadMode = 'pending'
      silent = false
      emit({ status: 'reading' })
      try {
        await platform.reload(target)
      } catch {
        // 标签页已关闭等：照常进入刷新模式，随后按无应答落到“本页没有中文助手”
      }
      if (disposed) return
      reloadMode = 'on'
      run(true)
    },
    dispose() {
      disposed = true
      generation++
      clearTimeout(timer)
    },
  }
}
