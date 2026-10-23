import type { GuidePrefs } from '../guide/prefs'

export interface GuideButtonApi {
  activeTab(): Promise<{ id: number } | null>
  /** 当前标签页地址；about:blank 等拿不到地址的页面为 undefined。不提供该方法时不做页面类型判断 */
  activeUrl?(): Promise<string | undefined>
  /** 浏览器是否提供侧栏接口；缺省按提供处理 */
  hasSidePanel?(): boolean
  openGuide(tabId: number): Promise<boolean>
  readGuidePrefs(): Promise<GuidePrefs>
  writeGuidePrefs(prefs: GuidePrefs): Promise<void>
  version(): string
}

/** 只有 http(s) 页面能翻译；about:blank、chrome://、扩展页等与划词入口一样不提供入口 */
function translatable(url: string | undefined): boolean {
  return /^https?:\/\//i.test(url ?? '')
}

// 独立于 CoE 状态视图：这里任何失败都不影响弹窗原有功能。
export async function setupGuideButton(
  doc: Document,
  api: GuideButtonApi,
  close: () => void,
): Promise<void> {
  const button = doc.querySelector<HTMLButtonElement>('#translate')
  const notice = doc.querySelector<HTMLElement>('#guide-notice')
  const failure = doc.querySelector<HTMLElement>('#translate-error')
  if (!button) return
  try {
    const tab = await api.activeTab()
    const checkUrl = tab !== null && api.activeUrl !== undefined
    const url = checkUrl ? await api.activeUrl?.() : undefined
    // 首次说明展开或点“翻译此页”之后才算看过，只写一次
    let markSeen = async () => {}
    if (notice) {
      const prefs = await api.readGuidePrefs()
      const version = api.version()
      if (prefs.noticeVersion !== version) {
        notice.hidden = false
        let written = false
        markSeen = async () => {
          if (written) return
          written = true
          await api.writeGuidePrefs({ ...prefs, noticeVersion: version }).catch(() => {})
        }
        notice.addEventListener('toggle', () => {
          if ((notice as HTMLDetailsElement).open) void markSeen()
        })
      }
    }
    if (tab && (!checkUrl || translatable(url))) {
      button.hidden = false
      let opening = false
      button.addEventListener('click', () => {
        // 请求期间用 aria-disabled 而非 disabled，避免按钮丢失焦点
        if (opening) return
        opening = true
        button.setAttribute('aria-disabled', 'true')
        if (failure) failure.hidden = true
        void markSeen()
        void api.openGuide(tab.id).then((ok) => {
          if (ok) close()
          else {
            opening = false
            button.removeAttribute('aria-disabled')
            if (failure) {
              failure.hidden = false
              // 先清空再写，连续失败时读屏也会重新播报
              failure.textContent = ''
              failure.textContent =
                (api.hasSidePanel?.() ?? true)
                  ? '这次没能打开侧边栏，可以再试一次。'
                  : '无法打开侧边栏，请更新 Chrome'
            }
          }
        })
      })
    }
  } catch {
    button.hidden = true
  }
}
