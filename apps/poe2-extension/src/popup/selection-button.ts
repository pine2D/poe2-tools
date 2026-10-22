interface SelectionButtonApi {
  activeTab(): Promise<{ id: number } | null>
  selection(
    tabId: number,
    action: 'status' | 'enable' | 'disable',
  ): Promise<{ ok: boolean; enabled?: boolean; message?: string }>
}
export async function setupSelectionButton(
  doc: Document,
  api: SelectionButtonApi,
  close: () => void,
): Promise<void> {
  const button = doc.querySelector<HTMLButtonElement>('#selection')
  const notice = doc.querySelector<HTMLElement>('#selection-notice')
  if (!button || !notice) return
  try {
    const tab = await api.activeTab()
    if (!tab) return
    const status = await api.selection(tab.id, 'status')
    if (!status.ok) return
    let enabled = status.enabled === true
    const render = () => {
      button.textContent = enabled ? '关闭本页划词' : '启用本页划词'
      button.setAttribute('aria-pressed', String(enabled))
    }
    button.hidden = false
    render()
    button.addEventListener('click', () => {
      button.disabled = true
      void api
        .selection(tab.id, enabled ? 'disable' : 'enable')
        .then(
          (result) => {
            if (result.ok) {
              enabled = result.enabled === true
              render()
              if (enabled) close()
              else {
                notice.hidden = false
                notice.textContent = '本页划词已关闭。'
              }
            } else {
              notice.hidden = false
              notice.textContent = result.message ?? '划词未启用，请刷新页面后重试。'
            }
          },
          () => {
            notice.hidden = false
            notice.textContent = '无法连接扩展后台，请重新打开扩展弹窗。'
          },
        )
        .finally(() => {
          button.disabled = false
        })
    })
  } catch {
    button.hidden = true
  }
}
