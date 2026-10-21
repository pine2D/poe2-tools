import { type GuidePrefs, prefsFrom } from '../guide/prefs'

// 只给弹窗用：不放进 platform.ts，否则 CoE 的 content.js 会把攻略翻译代码一起打包，产物字节随之改变。
interface GuideChromeApi {
  runtime: {
    sendMessage(message: unknown): Promise<{ ok: boolean; enabled?: boolean; message?: string }>
  }
  storage: {
    local: {
      get(key: string): Promise<Record<string, unknown>>
      set(value: Record<string, unknown>): Promise<void>
    }
  }
  // 扩展 0.5.0：攻略翻译侧边栏。只在扩展页面（弹窗）调用。
  sidePanel?: {
    setOptions(options: { tabId: number; path: string; enabled: boolean }): Promise<void>
    open(options: { tabId: number }): Promise<void>
  }
}
declare const chrome: GuideChromeApi

export const guidePlatform = {
  selection: (tabId: number, action: 'status' | 'enable' | 'disable') =>
    chrome.runtime.sendMessage({ type: `selection-${action}`, tabId }),
  // 必须在点击回调里同步发出两次调用：await 之后会丢失用户手势，sidePanel.open 会被拒绝。
  openGuide: (tabId: number): Promise<boolean> => {
    const panel = chrome.sidePanel
    if (!panel) return Promise.resolve(false)
    const set = panel.setOptions({ tabId, path: `guide.html?tab=${tabId}`, enabled: true })
    const open = panel.open({ tabId })
    return Promise.all([set, open]).then(
      () => true,
      () => false,
    )
  },
  readGuidePrefs: async (): Promise<GuidePrefs> =>
    prefsFrom((await chrome.storage.local.get('guide')).guide),
  writeGuidePrefs: (prefs: GuidePrefs): Promise<void> => chrome.storage.local.set({ guide: prefs }),
}
