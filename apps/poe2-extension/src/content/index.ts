import { createLexicon, type Term } from '@poe2-tools/l10n-core'
import { supportsPage } from '../adapters/coe-beta/context'
import { platform } from '../platform'
import { attachAttributeLayer } from './attribute-layer'
import { attachImport } from './import-controller'
import { attachSearch } from './search-controller'
import { attachStatLayer } from './stat-layer'
import { attachTextLayer } from './text-layer'

async function start() {
  const response = await fetch(platform.resource('assets/dictionary.json'))
  if (!response.ok) throw new Error('无法加载扩展词典')
  const data = (await response.json()) as { schemaVersion: number; locale: string; terms: Term[] }
  if (data.schemaVersion !== 1 || data.locale !== 'zh-CN') throw new Error('扩展词典版本不兼容')
  const lexicon = createLexicon(data.terms)
  let settings = await platform.read()
  let stop: (() => void) | undefined
  let mode = ''
  const reconcile = () => {
    const next =
      supportsPage(document, location.href) && settings.enabled
        ? settings.bilingual
          ? 'bilingual'
          : 'zh-CN'
        : ''
    if (next === mode) return
    stop?.()
    stop = undefined
    mode = next
    if (next) {
      const stopText = attachTextLayer(document, lexicon, settings.bilingual)
      const stopAttributes = attachAttributeLayer(document, lexicon, settings.bilingual)
      const stopStats = attachStatLayer(document, lexicon)
      const stopSearch = attachSearch(document, lexicon)
      const stopImport = attachImport(document, data.terms)
      stop = () => {
        stopAttributes()
        stopStats()
        stopImport()
        stopSearch()
        stopText()
      }
    }
  }
  platform.subscribe((value) => {
    settings = value
    reconcile()
  })
  const observer = new MutationObserver(reconcile)
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'key'],
  })
  reconcile()
}
void start().catch((error) =>
  console.error('[PoE2 中文助手]', error instanceof Error ? error.message : '初始化失败'),
)
