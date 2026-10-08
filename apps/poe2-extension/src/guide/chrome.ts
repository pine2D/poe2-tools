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
      func?: () => unknown
    }): Promise<Array<{ result?: unknown }>>
  }
  runtime: { getURL(path: string): string; getManifest(): { version: string } }
}
declare const chrome: GuideChrome

export const guideChrome = {
  tabId(): number | null {
    const id = Number(new URL(location.href).searchParams.get('tab'))
    return Number.isInteger(id) && id >= 0 ? id : null
  },
  async readPrefs(): Promise<GuidePrefs> {
    return prefsFrom((await chrome.storage.local.get('guide')).guide)
  },
  async writePrefs(prefs: GuidePrefs): Promise<void> {
    await chrome.storage.local.set({ guide: prefs })
  },
  // 第一次注入文件注册函数，第二次调用它取回结果（隔离世界在两次注入间共享）。
  async extract(tabId: number): Promise<unknown> {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['extract.js'] })
    const [first] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => (globalThis as { __poe2GuideExtract?: () => unknown }).__poe2GuideExtract?.(),
    })
    return first?.result
  },
  resource(path: string): string {
    return chrome.runtime.getURL(path)
  },
  version(): string {
    return chrome.runtime.getManifest().version
  },
}
