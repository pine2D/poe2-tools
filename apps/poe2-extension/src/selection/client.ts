import type { GuideBlock } from '@poe2-tools/guide-core'
import type { SelectionPort } from '../background/broker'
import { REQUEST_TIMEOUT_MS, SELECTION_PORT, type SelectionResult } from './protocol'

declare const chrome: {
  runtime: { connect(options: { name: string }): SelectionPort; lastError?: { message?: string } }
}
/** 内容脚本仅传受限文本，服务设置和 Key 从不经过此通道。 */
export function requestSelection(block: GuideBlock, signal: AbortSignal): Promise<SelectionResult> {
  if (signal.aborted) return Promise.resolve({ ok: false, message: '已取消翻译。' })
  return new Promise((resolve) => {
    const id = crypto.randomUUID()
    let port: SelectionPort | null = null,
      finished = false
    const finish = (result: SelectionResult) => {
      if (finished) return
      finished = true
      clearTimeout(timeout)
      signal.removeEventListener('abort', cancel)
      port?.disconnect()
      resolve(result)
    }
    const cancel = () => {
      try {
        port?.postMessage({ type: 'cancel' })
      } catch {
        /* 已断开。 */
      }
      finish({ ok: false, message: '已取消翻译。' })
    }
    const timeout = setTimeout(() => {
      try {
        port?.postMessage({ type: 'cancel' })
      } catch {
        /* 已断开。 */
      }
      finish({ ok: false, message: '翻译超时，请手动重试。' })
    }, REQUEST_TIMEOUT_MS + 5000)
    signal.addEventListener('abort', cancel, { once: true })
    try {
      port = chrome.runtime.connect({ name: SELECTION_PORT })
      port.onMessage.addListener((message) => {
        if (!message || typeof message !== 'object') return
        const m = message as { type?: string; id?: string; result?: SelectionResult }
        if (m.type === 'result' && m.id === id && m.result && typeof m.result.ok === 'boolean')
          finish(m.result)
      })
      port.onDisconnect.addListener(() => {
        void chrome.runtime.lastError
        finish({ ok: false, message: '后台连接中断，请重新启用本页划词或手动重试。' })
      })
      port.postMessage({ type: 'translate', id, block })
    } catch {
      finish({ ok: false, message: '扩展已更新或不可用，请刷新页面后重新启用划词。' })
    }
  })
}
