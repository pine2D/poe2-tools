import type { GuidePrefs } from '../guide/prefs'

export interface GuideButtonApi {
  activeTab(): Promise<{ id: number } | null>
  openGuide(tabId: number): Promise<boolean>
  readGuidePrefs(): Promise<GuidePrefs>
  writeGuidePrefs(prefs: GuidePrefs): Promise<void>
  version(): string
}

// 独立于 CoE 状态视图：这里任何失败都不影响弹窗原有功能。
export async function setupGuideButton(
  doc: Document,
  api: GuideButtonApi,
  close: () => void,
): Promise<void> {
  const button = doc.querySelector<HTMLButtonElement>('#translate')
  const notice = doc.querySelector<HTMLElement>('#guide-notice')
  if (!button) return
  try {
    const tab = await api.activeTab()
    if (tab) {
      button.hidden = false
      button.addEventListener('click', () => {
        button.disabled = true
        void api.openGuide(tab.id).then((ok) => {
          if (ok) close()
          else {
            button.disabled = false
            button.textContent = '无法打开侧边栏，请更新 Chrome'
          }
        })
      })
    }
    if (notice) {
      const prefs = await api.readGuidePrefs()
      const version = api.version()
      if (prefs.noticeVersion !== version) {
        notice.hidden = false
        await api.writeGuidePrefs({ ...prefs, noticeVersion: version })
      }
    }
  } catch {
    button.hidden = true
  }
}
