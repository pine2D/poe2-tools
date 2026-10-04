import { createLexicon, type Term } from '@poe2-tools/l10n-core'
import { pageStatus } from '../adapters/coe-beta/context'
import { defaults, platform } from '../platform'
import { PAGE_STATE_TYPE, type PageStateReply } from '../protocol'
import { attachAttributeLayer } from './attribute-layer'
import { attachImport } from './import-controller'
import { attachInstructionLayout } from './instruction-layout'
import { createLanguageNotice } from './language-notice'
import { attachPageLabels } from './page-labels'
import { snapshot } from './page-state'
import { attachSearch } from './search-controller'
import { attachSerif } from './serif'
import { attachStatLayer } from './stat-layer'
import { attachTextLayer } from './text-layer'

type Failure = NonNullable<PageStateReply['error']>
// 弹窗询问当前页状态时读这些变量（第三期裁定 3）；failed 保持到页面刷新。
let phase: PageStateReply['phase'] = 'starting'
let failure: PageStateReply['error'] = null
let step: Failure = 'dictionary'
let settings = { ...defaults }
let mode: '' | 'zh-CN' | 'bilingual' = ''
let counters: readonly (() => number)[] = []

// 必须在 start() 的第一个 await 之前注册：词典或设置读取失败时，弹窗仍能问到“初始化失败”。
platform.answer(PAGE_STATE_TYPE, () =>
  snapshot({
    phase,
    error: failure,
    enabled: settings.enabled,
    mode,
    doc: document,
    href: location.href,
    counters,
  }),
)

function fail(kind: Failure, error: unknown) {
  phase = 'failed'
  failure = kind
  console.error('[PoE2 中文助手]', error instanceof Error ? error.message : '初始化失败')
}

async function start() {
  step = 'dictionary'
  const response = await fetch(platform.resource('assets/dictionary.json'))
  if (!response.ok) throw new Error('无法加载扩展词典')
  const data = (await response.json()) as { schemaVersion: number; locale: string; terms: Term[] }
  if (data.schemaVersion !== 1 || data.locale !== 'zh-CN') throw new Error('扩展词典版本不兼容')
  step = 'other'
  const lexicon = createLexicon(data.terms)
  let stop: (() => void) | undefined
  const languageNotice = createLanguageNotice(document)
  const reconcile = () => {
    try {
      const status = pageStatus(document, location.href)
      languageNotice.update(settings.enabled && status === 'english-required')
      const next =
        status === 'supported' && settings.enabled
          ? settings.bilingual
            ? 'bilingual'
            : 'zh-CN'
          : ''
      if (next === mode) return
      stop?.()
      stop = undefined
      mode = next
      if (next) {
        const stopSerif = attachSerif(document)
        const stopInstructionLayout = attachInstructionLayout(document)
        const stopLabels = attachPageLabels(document, settings.bilingual)
        const stopText = attachTextLayer(document, lexicon, settings.bilingual)
        const stopAttributes = attachAttributeLayer(document, lexicon, settings.bilingual)
        const stopStats = attachStatLayer(document, lexicon)
        const stopSearch = attachSearch(document, lexicon)
        const stopImport = attachImport(document, data.terms)
        counters = [stopText.count, stopStats.count]
        stop = () => {
          counters = []
          stopSerif()
          stopInstructionLayout()
          stopLabels()
          stopAttributes()
          stopStats()
          stopImport()
          stopSearch()
          stopText()
        }
      }
    } catch (error) {
      // MutationObserver 回调里的异常不会进 start() 的 catch；挂层失败记为初始化失败，弹窗提示刷新。
      fail('other', error)
    }
  }
  // 先监听再读取；读取期间到达的变化比初始快照更新。
  let changedDuringRead = false
  let ready = false
  platform.subscribe((value) => {
    changedDuringRead = true
    settings = value
    if (ready) reconcile()
  })
  step = 'settings'
  const initial = await platform.read()
  step = 'other'
  if (!changedDuringRead) settings = initial
  ready = true
  const observer = new MutationObserver(reconcile)
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'key', 'id'],
  })
  reconcile()
  if (phase === 'starting') phase = 'ready'
}
void start().catch((error) => fail(step, error))
