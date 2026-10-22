import './guide.css'
import type { GuideDictionary } from '@poe2-tools/guide-core'
import { createGameLexicon, type Term } from '@poe2-tools/l10n-core'
import { guideChrome } from './chrome'
import { resolveConfig } from './config'
import { type Controller, createController, type ReadScope } from './controller'
import { streamChat } from './engines/openai'
import { limitError } from './prefs'
import { guideEngine } from './runtime'
import { createIdbStore } from './store/idb'
import { createReadingView } from './view-reading'
import { createSettingsView } from './view-settings'

const app = document.querySelector('#app')

const json = async <T>(path: string): Promise<T> =>
  (await fetch(guideChrome.resource(path))).json() as Promise<T>
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
  // 共用确定性核心，仅读攻略专用简体投影；CoE UI 和繁体输入不进入正文依赖。
  const stats = await json<{ terms: Term[]; hash: string; ruleVersion: string }>(
    'assets/guide-stats.json',
  )
  const lexicon = createGameLexicon(stats.terms)

  const engine = () => guideEngine(prefs, store)

  // controller 在下方创建；这些回调只会在用户操作时执行，届时已经赋值。
  let controller: Controller
  let readScope: ReadScope = 'full'
  const savePrefs = async (next: typeof prefs) => {
    await guideChrome.writePrefs(next)
    prefs = next
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
      // 重读会移除首次配置提示，保存后把焦点交给常驻的设置入口。
      settingsTrigger = null
      await controller.start(readScope, { preserveSelection: true })
      showReading()
      return null
    },
    async onSaveLimits(charLimit, cacheLimitMb) {
      const error = limitError('charLimit', charLimit) ?? limitError('cacheLimitMb', cacheLimitMb)
      if (error) throw new Error(error)
      await savePrefs({ ...prefs, charLimit, cacheLimitMb })
    },
    async onTest(values, signal) {
      const resolved = resolveConfig(values, await store.getKey(), prefs.confirmedOrigins)
      if (signal.aborted) throw signal.reason
      if (!resolved.ok) throw new Error(resolved.error)
      try {
        await streamChat(resolved.config, [{ role: 'user', content: 'Reply with OK.' }], {
          signal,
          onText: () => {},
        })
        return '连接正常。'
      } catch (error) {
        if (signal.aborted) throw signal.reason
        throw error
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
    onRefresh: () => fillSettings(),
    onClose: () => showReading(),
  })

  const reading = createReadingView(
    document,
    {
      onStage: (id) => void controller.selectStage(id),
      onRetryBlock: (id) => void controller.retryBlock(id),
      onStop: () => {
        controller.stop()
        void guideChrome.cancelPicker(tabId).catch(() => {})
      },
      onReload: () => void controller.start(readScope),
      onSettings: () => void showSettings(),
      onScope: (scope) => {
        readScope = scope
        void controller.start(scope)
      },
      onSelection: (ids) => void controller.preview(ids),
      onBegin: () => void controller.begin(),
      onMode: (mode) => void controller.setMode(mode),
      onLocate: (id) => void controller.locate(id),
      onRestore: () =>
        void controller
          .restore()
          .catch(() => reading.setBanner('error', '页面已更换，请重新读取。')),
      onIntroSeen: () => void savePrefs({ ...prefs, introSeen: true }),
    },
    guideChrome.version(),
  )
  let settingsTrigger: HTMLElement | null = null
  let restoreReadingPosition: (() => void) | null = null
  let openingSettings = false
  const showReading = () => {
    settings.root.hidden = true
    reading.root.hidden = false
    const target =
      settingsTrigger?.isConnected && !settingsTrigger.closest('[hidden]')
        ? settingsTrigger
        : reading.root.querySelector<HTMLElement>('[aria-label="设置翻译服务"]')
    target?.focus({ preventScroll: true })
    restoreReadingPosition?.()
    restoreReadingPosition = null
  }
  // 用当前偏好、Key 状态与缓存占用回填设置表单（打开设置、清除数据后都会调用）
  const fillSettings = async () => {
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
  }
  const showSettings = async () => {
    if (openingSettings) return
    openingSettings = true
    restoreReadingPosition = reading.rememberPosition()
    settingsTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    controller.stop()
    void guideChrome.cancelPicker(tabId).catch(() => {})
    try {
      await fillSettings()
    } catch {
      settings.setMessage('无法读取本机设置，请返回后重试。')
    } finally {
      openingSettings = false
    }
    reading.root.hidden = true
    settings.root.hidden = false
    settings.root.querySelector<HTMLElement>('h1')?.focus()
  }
  root.replaceChildren(reading.root, settings.root)
  reading.showIntro(!prefs.introSeen)

  controller = createController({
    extract: (scope) => guideChrome.extract(tabId, scope),
    page: {
      async check(snapshot) {
        const status = await guideChrome.status(tabId)
        return status?.snapshotId === snapshot && !status.stale
      },
      notice: (snapshot, notice) => guideChrome.notice(tabId, snapshot, notice),
      render: (snapshot, result) => guideChrome.render(tabId, snapshot, result),
      remove: (snapshot, id, revision) => guideChrome.remove(tabId, snapshot, id, revision),
      reset: (snapshot, revision) => guideChrome.reset(tabId, snapshot, revision),
      mode: (mode) => guideChrome.mode(tabId, mode),
      locate: (snapshot, id) => guideChrome.locate(tabId, snapshot, id),
      clear: () => guideChrome.clear(tabId),
    },
    dictionary: () => json<GuideDictionary>('assets/guide-dictionary.json'),
    stats: { hash: stats.hash, ruleVersion: stats.ruleVersion, resolve: lexicon.resolveStat },
    store,
    prefs: async () => prefs,
    engine,
    view: reading,
    random: randomHex,
  })
  let checking = false
  const timer = setInterval(() => {
    if (checking) return
    checking = true
    void controller.checkPage().finally(() => {
      checking = false
    })
  }, 1500)
  const stop = () => {
    controller.stop()
    void guideChrome.cancelPicker(tabId).catch(() => {})
  }
  window.addEventListener(
    'pagehide',
    () => {
      clearInterval(timer)
      stop()
    },
    { once: true },
  )
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop()
  })
  await controller.start()
}

if (app)
  void boot(app).catch(() => {
    app.textContent = '侧边栏启动失败，请关闭后重新打开。'
  })
