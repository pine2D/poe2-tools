import { platform, type Settings } from '../platform'
import { stateIcon } from './icons'
import { type PageProbe, watchPage } from './page-query'
import { type PageView, pageView } from './page-view'
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
// 开关右侧“开启／关闭”（spec §5.13）；测试替身页面没有这些节点时跳过
const enabledState = document.querySelector<HTMLElement>('#enabled-state')
const bilingualState = document.querySelector<HTMLElement>('#bilingual-state')
// 当前页状态块（第三期 A「状态置顶」）；测试替身页面没有时跳过
const pageBlock = document.querySelector<HTMLElement>('#page')
const reloadButton = document.querySelector<HTMLButtonElement>('#reload')

// 设置提示行只管设置本身（计划裁定 9）：平时为空，只说“正在保存…”、读取失败与保存失败；当前页怎样由状态块说
type Tone = 'idle' | 'busy' | 'error'
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

// ---- 当前页状态 ----
/** 应答里的开关与弹窗已保存的设置不一致时，隔这么久再查一次：内容脚本收到 storage.onChanged 比弹窗晚（裁定 7） */
const ENABLED_RECHECK_MS = 300
let probe: PageProbe = { status: 'reading' }
// 弹窗自己的已保存设置：“简体中文已关闭”以它为准；读到设置之前为 null
let shown: Settings | null = null
let painted = ''
let rechecked = false
let recheckTimer: ReturnType<typeof setTimeout> | undefined

function paint(block: HTMLElement, view: PageView) {
  block.dataset.kind = view.kind
  const icon = stateIcon(document, view.kind)
  icon.classList.add('page__icon')
  const previous = block.querySelector('.page__icon')
  if (previous) previous.replaceWith(icon)
  else block.prepend(icon)
  const head = block.querySelector<HTMLElement>('.page__head')
  const word = block.querySelector<HTMLElement>('.page__word')
  const reason = block.querySelector<HTMLElement>('.page__reason')
  const hint = block.querySelector<HTMLElement>('.page__hint')
  if (head) head.hidden = view.word === null
  if (word) word.textContent = view.word ?? ''
  if (reason) reason.textContent = view.reason === null ? '' : ` · ${view.reason}`
  if (hint) hint.textContent = view.hint
  if (reloadButton) {
    const hide = view.action !== 'reload'
    // 按钮带着焦点被隐藏时焦点会掉回 body：先交给“启用简体中文”
    if (hide && document.activeElement === reloadButton && !enabled.disabled)
      enabled.focus({ preventScroll: true })
    reloadButton.hidden = hide
  }
}
function paintPage() {
  if (!pageBlock) return
  // 设置读到之前，“已关闭”只能看应答；读到之后一律用弹窗自己的设置
  const basis: Settings = shown ?? {
    enabled: probe.status === 'reply' ? probe.reply.enabled : true,
    bilingual: false,
  }
  const view = pageView(probe, basis)
  const key = JSON.stringify(view)
  // 状态块是 live region：结果没变就不重写，避免读屏在每次重查时重复播报
  if (key === painted) return
  painted = key
  paint(pageBlock, view)
}
function checkEnabled() {
  if (probe.status !== 'reply' || probe.reply.phase !== 'ready' || shown === null) return
  if (probe.reply.enabled === shown.enabled) {
    clearTimeout(recheckTimer)
    return
  }
  // 每个外部触发只补查一次，避免内容脚本迟迟没收到设置变化时连环重查
  if (rechecked) return
  rechecked = true
  recheckTimer = setTimeout(() => page.refresh(), ENABLED_RECHECK_MS)
}
paintPage()
const page = watchPage((next) => {
  probe = next
  checkEnabled()
  paintPage()
})
/** 设置变化（含其他窗口）与本窗保存成功后重查当前页 */
function refreshPage() {
  rechecked = false
  clearTimeout(recheckTimer)
  page.refresh()
}
if (reloadButton) {
  reloadButton.addEventListener('click', () => {
    if (reloadButton.disabled) return
    reloadButton.disabled = true
    void page
      .reload()
      .catch(() => refreshPage())
      .finally(() => {
        reloadButton.disabled = false
      })
  })
}
window.addEventListener('pagehide', () => page.dispose())

// ---- 设置 ----
let latest: Settings | null = null
let revision = 0
let receive = (_settings: Settings) => {}
platform.subscribe((settings) => {
  latest = settings
  revision++
  receive(settings)
  refreshPage()
})
let loading = false
let ready = false
function readSettings() {
  if (loading || ready) return
  loading = true
  retry.hidden = true
  say('', 'idle')
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
        shown = saved
        paintPage()
      }
      render()
      receive = (current) => {
        saved = current
        if (saving) return
        render()
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
          let stored = false
          try {
            await platform.write(next)
            if (revision === startedAt) saved = next
            stored = true
            say('', 'idle')
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
          // 保存成功不说话：状态块随后重查当前页，由它的变化代替“已保存”（裁定 9）
          if (stored) refreshPage()
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
