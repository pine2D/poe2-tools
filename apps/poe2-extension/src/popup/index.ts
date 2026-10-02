import { platform, type Settings } from '../platform'
import './popup.css'

function required<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`缺少扩展界面：${selector}`)
  return element
}
const enabled = required<HTMLInputElement>('#enabled')
const bilingual = required<HTMLInputElement>('#bilingual')
const status = required<HTMLElement>('#status')
const retry = required<HTMLButtonElement>('#retry')
// 开关右侧“开启／关闭”与状态行语气（spec §5.13、B.12 修订 3）；测试替身页面没有这些节点时跳过
const enabledState = document.querySelector<HTMLElement>('#enabled-state')
const bilingualState = document.querySelector<HTMLElement>('#bilingual-state')
type Tone = 'busy' | 'ok' | 'off' | 'error'
function say(text: string, tone: Tone) {
  status.textContent = text
  status.dataset.tone = tone
}
function syncStates() {
  if (enabledState) enabledState.textContent = enabled.checked ? '开启' : '关闭'
  if (bilingualState) bilingualState.textContent = bilingual.checked ? '开启' : '关闭'
}
// 页脚版本号读自 manifest；测试替身页面没有页脚时跳过
const versionLabel = document.querySelector<HTMLElement>('#version')
if (versionLabel) versionLabel.textContent = `版本 ${platform.version()}`
enabled.disabled = true
bilingual.disabled = true
let latest: Settings | null = null
let revision = 0
let receive = (_settings: Settings) => {}
platform.subscribe((settings) => {
  latest = settings
  revision++
  receive(settings)
})
let loading = false
let ready = false
function readSettings() {
  if (loading || ready) return
  loading = true
  retry.hidden = true
  say('读取设置…', 'busy')
  void platform
    .read()
    .then((settings) => {
      ready = true
      let saved = latest ?? settings
      let saving = false
      function render() {
        enabled.checked = saved.enabled
        bilingual.checked = saved.bilingual
        enabled.disabled = false
        bilingual.disabled = !saved.enabled
        syncStates()
      }
      render()
      saved.enabled ? say('简体中文已开启；设置仅保存在本机', 'ok') : say('简体中文已关闭', 'off')
      receive = (current) => {
        saved = current
        if (saving) return
        render()
        saved.enabled ? say('简体中文已开启；设置仅保存在本机', 'ok') : say('简体中文已关闭', 'off')
      }
      for (const input of [enabled, bilingual]) {
        input.addEventListener('change', async () => {
          syncStates()
          const next = { enabled: enabled.checked, bilingual: bilingual.checked }
          const restoreFocus = document.activeElement === input
          const startedAt = revision
          saving = true
          enabled.disabled = true
          bilingual.disabled = true
          say('正在保存…', 'busy')
          try {
            await platform.write(next)
            if (revision === startedAt) saved = next
            saved.enabled
              ? say('已保存；符合条件的已打开页面会更新', 'ok')
              : say('已保存，简体中文已关闭', 'off')
          } catch {
            say('未保存，已恢复原设置。请再次操作重试。', 'error')
          } finally {
            saving = false
            render()
            // Chrome禁用当前控件会丢失焦点；不覆盖用户已转移到其他控件的焦点。
            if (restoreFocus && document.activeElement === document.body) {
              const target = input.disabled ? enabled : input
              target.focus({ preventScroll: true })
            }
          }
        })
      }
    })
    .catch(() => {
      say('无法读取设置，请重试。', 'error')
      retry.hidden = false
    })

    .finally(() => {
      loading = false
    })
}
retry.addEventListener('click', readSettings)
readSettings()
