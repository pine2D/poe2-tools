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
    enabled.checked = settings.enabled
    bilingual.checked = settings.bilingual
    enabled.disabled = false
    bilingual.disabled = false
    status.textContent = '设置仅保存在本机'
    for (const input of [enabled, bilingual])
      input.addEventListener('change', () => {
        void platform
          .write({ enabled: enabled.checked, bilingual: bilingual.checked })
          .then(() => {
            status.textContent = '已保存，已打开的支持页面会更新'
          })
          .catch(() => {
            status.textContent = '保存失败，请重试'
          })
      })
  })
  .catch(() => {
    status.textContent = '无法读取设置，请重新打开扩展'
  })
