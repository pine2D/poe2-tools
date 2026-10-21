import type { PageResult, PageTranslation } from '../extract/inline'
import type { PageSession, ReadingMode } from '../extract/session'
import type { ReadScope } from './controller'
import { type GuidePrefs, prefsFrom } from './prefs'

// 侧边栏页面用到的 Chrome API 最小声明（与 platform.ts 一样不引入 @types/chrome）。
interface GuideChrome {
  storage: {
    local: {
      get(key: string): Promise<Record<string, unknown>>
      set(items: Record<string, unknown>): Promise<void>
    }
  }
  scripting: {
    executeScript(injection: {
      target: { tabId: number }
      files?: string[]
      func?: (command: PageCommand) => unknown
      args?: [PageCommand]
    }): Promise<Array<{ result?: unknown }>>
  }
  runtime: { getURL(path: string): string; getManifest(): { version: string } }
}
declare const chrome: GuideChrome

// 侧边栏地址 ?tab=<标签页号>：缺失、空串或不是纯数字时返回 null（Number('') 会得到 0）
export function parseTabId(href: string): number | null {
  const raw = new URL(href).searchParams.get('tab')
  if (raw === null || !/^\d+$/.test(raw)) return null
  const id = Number(raw)
  return Number.isSafeInteger(id) ? id : null
}

type PageCommand =
  | { kind: 'read'; scope: ReadScope }
  | { kind: 'render'; snapshot: string; translation: PageTranslation }
  | { kind: 'remove'; snapshot: string; id: string; revision: string }
  | { kind: 'locate'; snapshot: string; id: string }
  | { kind: 'reset'; snapshot: string; revision: string }
  | { kind: 'mode'; mode: ReadingMode }
  | { kind: 'status' | 'clear' | 'cancel' }

async function command<T>(tabId: number, payload: PageCommand): Promise<T> {
  const [first] = await chrome.scripting.executeScript({
    target: { tabId },
    args: [payload],
    func: (c) => {
      const page = (globalThis as { __poe2GuideSession?: PageSession }).__poe2GuideSession
      if (!page) throw Error('页面会话已退出')
      switch (c.kind) {
        case 'read':
          return c.scope === 'region' ? page.pickRegion() : page.read({ scope: c.scope })
        case 'render':
          return page.render(c.snapshot, c.translation)
        case 'locate':
          return page.locate(c.snapshot, c.id)
        case 'remove':
          return page.remove(c.snapshot, c.id, c.revision)
        case 'reset':
          return page.reset(c.snapshot, c.revision)
        case 'mode':
          return page.setMode(c.mode)
        case 'status':
          return page.status()
        case 'clear':
          return page.clear()
        case 'cancel':
          return page.cancelPicker()
      }
    },
  })
  return first?.result as T
}

export const guideChrome = {
  tabId(): number | null {
    return parseTabId(location.href)
  },
  async readPrefs(): Promise<GuidePrefs> {
    return prefsFrom((await chrome.storage.local.get('guide')).guide)
  },
  async writePrefs(prefs: GuidePrefs): Promise<void> {
    await chrome.storage.local.set({ guide: prefs })
  },
  // 注入只注册页面会话；后续命令只传范围/文本/编号，不传服务设置。
  async extract(tabId: number, scope: ReadScope = 'full'): Promise<unknown> {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['extract.js'] })
    await command(tabId, { kind: 'cancel' })
    return command(tabId, { kind: 'read', scope })
  },
  render: (tabId: number, snapshot: string, translation: PageTranslation) =>
    command<PageResult>(tabId, { kind: 'render', snapshot, translation }),
  locate: (tabId: number, snapshot: string, id: string) =>
    command<PageResult>(tabId, { kind: 'locate', snapshot, id }),
  remove: (tabId: number, snapshot: string, id: string, revision: string) =>
    command<void>(tabId, { kind: 'remove', snapshot, id, revision }),
  reset: (tabId: number, snapshot: string, revision: string) =>
    command<void>(tabId, { kind: 'reset', snapshot, revision }),
  mode: (tabId: number, mode: ReadingMode) => command<void>(tabId, { kind: 'mode', mode }),
  clear: (tabId: number) => command<void>(tabId, { kind: 'clear' }),
  cancelPicker: (tabId: number) => command<void>(tabId, { kind: 'cancel' }),
  status: (tabId: number) => command<ReturnType<PageSession['status']>>(tabId, { kind: 'status' }),
  resource(path: string): string {
    return chrome.runtime.getURL(path)
  },
  version(): string {
    return chrome.runtime.getManifest().version
  },
}
