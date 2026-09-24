import { platform } from '../platform'
import './popup.css'

function required<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`缺少扩展界面：${selector}`)
  return element
}
const enabled = required<HTMLInputElement>('#enabled')
const bilingual = required<HTMLInputElement>('#bilingual')
const status = required<HTMLElement>('#status')
enabled.disabled = true
bilingual.disabled = true
void platform
  .read()
  .then((settings) => {
    let saved = settings
    function render() {
      enabled.checked = saved.enabled
      bilingual.checked = saved.bilingual
      enabled.disabled = false
      bilingual.disabled = !saved.enabled
    }
    render()
    status.textContent = saved.enabled ? '简体中文已开启；设置仅保存在本机' : '简体中文已关闭'
    for (const input of [enabled, bilingual]) {
      input.addEventListener('change', async () => {
        const next = { enabled: enabled.checked, bilingual: bilingual.checked }
        enabled.disabled = true
        bilingual.disabled = true
        status.textContent = '正在保存…'
        try {
          await platform.write(next)
          saved = next
          status.textContent = next.enabled
            ? '已保存；符合条件的已打开页面会更新'
            : '已保存，简体中文已关闭'
        } catch {
          status.textContent = '未保存，已恢复原设置。请再次操作重试。'
        } finally {
          render()
        }
      })
    }
  })
  .catch(() => {
    status.textContent = '无法读取设置，请重新打开扩展'
  })
