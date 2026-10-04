import type { PageStateRequest } from './protocol'

export interface Settings {
  enabled: boolean
  bilingual: boolean
}
export const defaults: Settings = { enabled: true, bilingual: false }
interface ChromeTab {
  id?: number
  status?: string
}
interface ChromeApi {
  runtime: {
    getURL(path: string): string
    getManifest(): { version: string }
    onMessage: {
      addListener(
        callback: (
          message: unknown,
          sender: unknown,
          sendResponse: (response: unknown) => void,
        ) => boolean | undefined,
      ): void
    }
  }
  storage: {
    local: {
      get(key: string): Promise<Record<string, unknown>>
      set(value: Record<string, unknown>): Promise<void>
    }
    onChanged: {
      addListener(
        callback: (changes: Record<string, { newValue?: unknown }>, area: string) => void,
      ): void
    }
  }
  // 只在扩展页面（弹窗）存在，内容脚本里没有。只读 id 与 status，不需要 tabs 权限（第三期裁定 2）。
  tabs?: {
    query(query: { active: boolean; currentWindow: boolean }): Promise<ChromeTab[]>
    sendMessage(tabId: number, message: unknown, options: { frameId: number }): Promise<unknown>
    reload(tabId: number): Promise<void>
  }
}
declare const chrome: ChromeApi
export function settingsFrom(value: unknown): Settings {
  if (!value || typeof value !== 'object') return { ...defaults }
  const input = value as Record<string, unknown>
  return {
    enabled: typeof input.enabled === 'boolean' ? input.enabled : defaults.enabled,
    bilingual: typeof input.bilingual === 'boolean' ? input.bilingual : defaults.bilingual,
  }
}
export const platform = {
  resource: (path: string) => chrome.runtime.getURL(path),
  version: () => chrome.runtime.getManifest().version,
  read: async () => settingsFrom((await chrome.storage.local.get('settings')).settings),
  write: (settings: Settings) => chrome.storage.local.set({ settings }),
  subscribe: (callback: (settings: Settings) => void) =>
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.settings) callback(settingsFrom(changes.settings.newValue))
    }),
  /** 弹窗：当前窗口的活动标签页；拿不到或 id 无效时为 null */
  activeTab: async (): Promise<{ id: number; loading: boolean } | null> => {
    const [tab] = (await chrome.tabs?.query({ active: true, currentWindow: true })) ?? []
    if (typeof tab?.id !== 'number' || tab.id < 0) return null
    return { id: tab.id, loading: tab.status === 'loading' }
  },
  /** 弹窗：问顶层框架的内容脚本；reject、同步抛错、超时与 undefined 一律为 null，永不 reject */
  ask: (tabId: number, message: PageStateRequest, timeoutMs: number) =>
    new Promise<unknown | null>((resolve) => {
      const timer = setTimeout(() => resolve(null), timeoutMs)
      const settle = (value: unknown) => {
        clearTimeout(timer)
        resolve(value ?? null)
      }
      try {
        const pending = chrome.tabs?.sendMessage(tabId, message, { frameId: 0 })
        if (pending) pending.then(settle, () => settle(null))
        else settle(null)
      } catch {
        settle(null)
      }
    }),
  /** 弹窗：刷新指定标签页（“刷新页面”按钮，只在状态 2、7 出现） */
  reload: async (tabId: number) => {
    await chrome.tabs?.reload(tabId)
  },
  /** 内容脚本：同步应答指定类型的询问（返回 Promise 的应答从 Chrome 148 起才支持） */
  answer: (type: string, snapshot: () => unknown) =>
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!message || typeof message !== 'object' || (message as { type?: unknown }).type !== type)
        return false
      sendResponse(snapshot())
      return false
    }),
}
