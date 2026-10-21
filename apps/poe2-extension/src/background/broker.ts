import type { GuideBlock } from '@poe2-tools/guide-core'
import {
  parseSelectionRequest,
  REQUEST_TIMEOUT_MS,
  SELECTION_PORT,
  type SelectionResult,
} from '../selection/protocol'

export interface Sender {
  id?: string
  url?: string
  tab?: { id?: number }
  frameId?: number
  documentId?: string
}
export interface SelectionPort {
  name: string
  sender?: Sender
  postMessage(message: unknown): void
  disconnect(): void
  onMessage: { addListener(callback: (message: unknown) => void): void }
  onDisconnect: { addListener(callback: () => void): void }
}
export interface BrokerDeps {
  extensionId: string
  popupUrl: string
  getGrant(tabId: number): Promise<string | null>
  setGrant(tabId: number, documentId: string | null): Promise<void>
  probe(tabId: number): Promise<{ documentId: string; url: string }>
  inject(tabId: number, documentId: string): Promise<void>
  disable(tabId: number, documentId: string): Promise<void>
  run(block: GuideBlock, signal: AbortSignal): Promise<SelectionResult>
}
const tabNumber = (id: unknown): id is number =>
  typeof id === 'number' && Number.isSafeInteger(id) && id >= 0
const webPage = (url: string | undefined) => {
  try {
    const u = new URL(url ?? '')
    return (
      ['https:', 'http:'].includes(u.protocol) &&
      u.hostname !== 'craftofexile.com' &&
      !u.hostname.endsWith('.craftofexile.com')
    )
  } catch {
    return false
  }
}

export function createSelectionBroker(deps: BrokerDeps) {
  const jobs = new Map<number, () => void>()
  const revisions = new Map<number, number>()
  const revoke = (tabId: number) => revisions.set(tabId, (revisions.get(tabId) ?? 0) + 1)
  const controls = new Map<number, Promise<unknown>>()
  const cancel = (tabId: number) => jobs.get(tabId)?.()
  async function control(
    raw: unknown,
    sender: Sender,
  ): Promise<{ ok: boolean; enabled?: boolean; message?: string }> {
    if (
      sender.id !== deps.extensionId ||
      sender.url !== deps.popupUrl ||
      sender.tab ||
      !raw ||
      typeof raw !== 'object'
    )
      return { ok: false, message: '只能从扩展弹窗启用划词。' }
    const m = raw as Record<string, unknown>
    if (
      !['selection-enable', 'selection-disable', 'selection-status'].includes(String(m.type)) ||
      !tabNumber(m.tabId)
    )
      return { ok: false, message: '操作无效。' }
    const tabId = m.tabId
    const previous = controls.get(tabId)
    const task = (async () => {
      await previous
      try {
        const page = await deps.probe(tabId)
        if (!page.documentId || !webPage(page.url))
          return { ok: false, message: '此页不支持划词；CoE 请使用本地中文显示。' }
        if (m.type === 'selection-status')
          return { ok: true, enabled: (await deps.getGrant(tabId)) === page.documentId }
        revoke(tabId)
        cancel(tabId)
        if (m.type === 'selection-disable') {
          await deps.setGrant(tabId, null)
          await deps.disable(tabId, page.documentId)
          return { ok: true, enabled: false }
        }
        await deps.setGrant(tabId, page.documentId)
        try {
          await deps.inject(tabId, page.documentId)
        } catch (error) {
          await deps.setGrant(tabId, null)
          throw error
        }
        return { ok: true, enabled: true }
      } catch {
        return { ok: false, message: '无法访问当前页，请刷新后重新点击扩展图标。' }
      }
    })()
    controls.set(tabId, task)
    try {
      return await task
    } finally {
      if (controls.get(tabId) === task) controls.delete(tabId)
    }
  }

  function connect(port: SelectionPort) {
    const sender = port.sender,
      tabId = sender?.tab?.id
    if (
      port.name !== SELECTION_PORT ||
      sender?.id !== deps.extensionId ||
      !tabNumber(tabId) ||
      sender.frameId !== 0 ||
      !sender.documentId ||
      !webPage(sender.url)
    ) {
      port.disconnect()
      return
    }
    const revision = revisions.get(tabId) ?? 0
    const authorized = deps.getGrant(tabId).then(
      (id) => id === sender.documentId,
      () => false,
    )
    let closed = false,
      started = false
    const controller = new AbortController()
    let pulse: ReturnType<typeof setInterval> | undefined
    let timeout: ReturnType<typeof setTimeout> | undefined
    const finish = () => {
      if (closed) return
      closed = true
      clearTimeout(timeout)
      clearInterval(pulse)
      controller.abort()
      if (jobs.get(tabId) === finish) jobs.delete(tabId)
      port.disconnect()
    }
    const send = (value: unknown) => {
      if (!closed) {
        try {
          port.postMessage(value)
        } catch {
          finish()
        }
      }
    }
    timeout = setTimeout(finish, 5000)
    port.onDisconnect.addListener(finish)
    // 监听同步注册；首条消息到达时再等授权读取，避免消息早到而丢失。
    port.onMessage.addListener((message) => {
      if (closed) return
      if (
        typeof message === 'object' &&
        message !== null &&
        (message as { type?: string }).type === 'cancel'
      ) {
        finish()
        return
      }
      if (started) return
      started = true
      void (async () => {
        if (!(await authorized) || closed || revision !== (revisions.get(tabId) ?? 0)) {
          finish()
          return
        }
        const request = parseSelectionRequest(message)
        if (!request) {
          finish()
          return
        }
        cancel(tabId)
        if (jobs.size >= 4) {
          send({
            type: 'result',
            id: request.id,
            result: { ok: false, message: '已有多个划词任务，请稍后重试。' },
          })
          finish()
          return
        }
        jobs.set(tabId, finish)
        clearTimeout(timeout)
        timeout = setTimeout(() => {
          send({
            type: 'result',
            id: request.id,
            result: { ok: false, message: '翻译超时，请手动重试。' },
          })
          finish()
        }, REQUEST_TIMEOUT_MS)
        // 仅在用户已发起的有界请求期间通信；结束或截止后清理，不维持空闲后台。
        pulse = setInterval(() => send({ type: 'working', id: request.id }), 20000)
        try {
          const result = await deps.run(request.block, controller.signal)
          send({ type: 'result', id: request.id, result })
        } catch {
          send({
            type: 'result',
            id: request.id,
            result: { ok: false, message: '翻译服务暂不可用，请手动重试。' },
          })
        } finally {
          finish()
        }
      })()
    })
  }
  return {
    control,
    connect,
    async removed(tabId: number) {
      revoke(tabId)
      cancel(tabId)
      await deps.setGrant(tabId, null)
    },
  }
}
