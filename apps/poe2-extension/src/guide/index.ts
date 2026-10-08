import './guide.css'
import type { GuideDictionary } from '@poe2-tools/guide-core'
import { createLexicon, type Term } from '@poe2-tools/l10n-core'
import { guideChrome } from './chrome'
import { resolveConfig } from './config'
import { type Controller, createController, type EngineHandle } from './controller'
import { streamChat } from './engines/openai'
import { DEEPSEEK, deepseekPeak, estimateCost, REQUEST_PARAMS } from './engines/presets'
import { withRetry } from './engines/retry'
import { prefsFrom } from './prefs'
import { createIdbStore } from './store/idb'
import { keyForConfig } from './store/keys'
import { createReadingView } from './view-reading'
import { createSettingsView } from './view-settings'

const app = document.querySelector('#app')

const json = async <T>(path: string): Promise<T> =>
  (await fetch(guideChrome.resource(path))).json() as Promise<T>
// 停止时清掉计时器（withRetry 自己会立即以“已停止”结束）
const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => clearTimeout(timer), { once: true })
  })
const randomHex = () =>
  [...crypto.getRandomValues(new Uint8Array(6))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

async function boot(root: Element) {
  const tabId = guideChrome.tabId()
  if (tabId === null) {
    root.textContent = '请在攻略页点击扩展图标，再点“翻译此页”。'
    return
  }
  let prefs = await guideChrome.readPrefs()
  const store = createIdbStore({
    factory: indexedDB,
    capacityBytes: prefs.cacheLimitMb * 1024 * 1024,
    now: Date.now,
  })
  // 词缀行用现有 l10n-core 的整行模板翻译（与 CoE 同一份词典）
  const lexicon = createLexicon((await json<{ terms: Term[] }>('assets/dictionary.json')).terms)

  const engine = async (): Promise<EngineHandle | null> => {
    const record = await store.getKey()
    const baseUrl = prefs.provider === 'custom' ? prefs.customBaseUrl : DEEPSEEK.baseUrl
    const apiKey = keyForConfig(record, baseUrl)
    if (!record || !apiKey) return null
    const resolved = resolveConfig(
      {
        provider: prefs.provider,
        baseUrl,
        model: prefs.customModel,
        apiKey,
        extraBody: prefs.extraBody,
        confirmOrigin: false,
      },
      record,
      prefs.confirmedOrigins,
    )
    if (!resolved.ok) return null
    const cfg = resolved.config
    return {
      provider: cfg.provider,
      model: cfg.model,
      params: JSON.stringify([REQUEST_PARAMS, cfg.extraBody ?? null]),
      runner: {
        run: (messages, onText, signal) =>
          withRetry(() => streamChat(cfg, messages, { signal, onText }), sleep, signal),
      },
      costText: (prompt, completion) => {
        if (cfg.provider !== 'deepseek') return '费用以服务商账单为准'
        const peak = deepseekPeak(new Date())
        return `估算 ¥${estimateCost(prompt, completion, peak).cny.toFixed(4)}${peak ? '（高峰价）' : ''}`
      },
    }
  }

  // controller 在下方创建；这些回调只会在用户操作时执行，届时已经赋值。
  let controller: Controller
  const savePrefs = async (next: typeof prefs) => {
    prefs = next
    await guideChrome.writePrefs(prefs)
  }

  const settings = createSettingsView(document, {
    async onSave(values) {
      const resolved = resolveConfig(values, await store.getKey(), prefs.confirmedOrigins)
      if (!resolved.ok) return resolved.error
      await store.putKey(resolved.record)
      await savePrefs({
        ...prefs,
        provider: values.provider,
        customBaseUrl: values.provider === 'custom' ? resolved.config.baseUrl : prefs.customBaseUrl,
        customModel: values.provider === 'custom' ? resolved.config.model : prefs.customModel,
        extraBody: values.extraBody,
        confirmedOrigins: [...new Set([...prefs.confirmedOrigins, resolved.origin])],
      })
      showReading()
      void controller.start()
      return null
    },
    async onSaveLimits(charLimit, cacheLimitMb) {
      // 经 prefsFrom 校验范围，非法值回到默认
      const checked = prefsFrom({ ...prefs, charLimit, cacheLimitMb })
      await savePrefs({
        ...prefs,
        charLimit: checked.charLimit,
        cacheLimitMb: checked.cacheLimitMb,
      })
    },
    async onTest(values) {
      const resolved = resolveConfig(values, await store.getKey(), prefs.confirmedOrigins)
      if (!resolved.ok) return resolved.error
      try {
        await streamChat(resolved.config, [{ role: 'user', content: 'Reply with OK.' }], {
          signal: AbortSignal.timeout(20000),
          onText: () => {},
        })
        return '连接正常。'
      } catch (error) {
        return error instanceof Error ? error.message : '连接失败。'
      }
    },
    async onClearCache() {
      await store.clearCache()
    },
    async onClearAll() {
      await store.clearAll()
      await savePrefs({
        ...prefs,
        confirmedOrigins: [],
        customBaseUrl: '',
        customModel: '',
        extraBody: '',
      })
    },
    onClose: () => showReading(),
  })

  const reading = createReadingView(
    document,
    {
      onStage: (id) => void controller.translateStage(id),
      onRetryBlock: (id) => void controller.retryBlock(id),
      onStop: () => controller.stop(),
      onReload: () => void controller.start(),
      onSettings: () => void showSettings(),
      onFullPage: () => void controller.start(),
      onIntroSeen: () => void savePrefs({ ...prefs, introSeen: true }),
    },
    guideChrome.version(),
  )
  const showReading = () => {
    settings.root.hidden = true
    reading.root.hidden = false
  }
  const showSettings = async () => {
    settings.fill(
      {
        provider: prefs.provider,
        baseUrl: prefs.customBaseUrl,
        model: prefs.customModel,
        extraBody: prefs.extraBody,
      },
      { charLimit: prefs.charLimit, cacheLimitMb: prefs.cacheLimitMb },
      !!(await store.getKey()),
      await store.usage(),
    )
    reading.root.hidden = true
    settings.root.hidden = false
  }
  root.replaceChildren(reading.root, settings.root)
  reading.showIntro(!prefs.introSeen)

  controller = createController({
    extract: () => guideChrome.extract(tabId),
    dictionary: () => json<GuideDictionary>('assets/guide-dictionary.json'),
    translateLine: (line) => lexicon.translate(line, 'stat'),
    store,
    prefs: async () => prefs,
    engine,
    view: reading,
    random: randomHex,
  })
  await controller.start()
}

if (app)
  void boot(app).catch(() => {
    app.textContent = '侧边栏启动失败，请关闭后重新打开。'
  })
