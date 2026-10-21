import type { GuideDictionary } from '@poe2-tools/guide-core'
import { createGameLexicon, type Term } from '@poe2-tools/l10n-core'
import { prefsFrom } from '../guide/prefs'
import { guideEngine } from '../guide/runtime'
import { translateSelection } from '../guide/selection'
import { createIdbStore } from '../guide/store/idb'
import { createSelectionBroker, type SelectionPort, type Sender } from './broker'

interface BackgroundChrome {
  runtime: {
    id: string
    getURL(path: string): string
    onMessage: {
      addListener(
        callback: (
          message: unknown,
          sender: Sender,
          reply: (result: unknown) => void,
        ) => boolean | undefined,
      ): void
    }
    onConnect: { addListener(callback: (port: SelectionPort) => void): void }
  }
  storage: {
    local: { get(key: string): Promise<Record<string, unknown>> }
    session: {
      get(key: string): Promise<Record<string, unknown>>
      set(value: Record<string, unknown>): Promise<void>
      remove(key: string): Promise<void>
    }
  }
  scripting: {
    executeScript(injection: {
      target: { tabId: number; documentIds?: string[] }
      files?: string[]
      func?: () => unknown
    }): Promise<Array<{ documentId: string; result?: unknown }>>
  }
  tabs: {
    onUpdated: { addListener(callback: (id: number, change: { status?: string }) => void): void }
    onRemoved: { addListener(callback: (id: number) => void): void }
  }
}
declare const chrome: BackgroundChrome

const json = async <T>(file: string): Promise<T> => {
  const response = await fetch(chrome.runtime.getURL(file))
  if (!response.ok) throw Error('包内词典读取失败')
  return response.json() as Promise<T>
}
let assets: Promise<{
  dictionary: GuideDictionary
  stats: { terms: Term[]; hash: string; ruleVersion: string }
}> | null = null
const resources = () => {
  assets ??= Promise.all([
    json<GuideDictionary>('assets/guide-dictionary.json'),
    json<{ terms: Term[]; hash: string; ruleVersion: string }>('assets/guide-stats.json'),
  ])
    .then(([dictionary, stats]) => ({ dictionary, stats }))
    .catch((error) => {
      assets = null
      throw error
    })
  return assets
}
const grantKey = (tabId: number) => `selection:${tabId}`
const broker = createSelectionBroker({
  extensionId: chrome.runtime.id,
  popupUrl: chrome.runtime.getURL('popup.html'),
  async getGrant(tabId) {
    const key = grantKey(tabId),
      value = (await chrome.storage.session.get(key))[key]
    return typeof value === 'string' ? value : null
  },
  async setGrant(tabId, documentId) {
    const key = grantKey(tabId)
    if (documentId) await chrome.storage.session.set({ [key]: documentId })
    else await chrome.storage.session.remove(key)
  },
  async probe(tabId) {
    const [page] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => location.href,
    })
    if (!page || typeof page.result !== 'string') throw Error('页面不可用')
    return { documentId: page.documentId, url: page.result }
  },
  async inject(tabId, documentId) {
    await chrome.scripting.executeScript({
      target: { tabId, documentIds: [documentId] },
      files: ['selection.js'],
    })
  },
  async disable(tabId, documentId) {
    await chrome.scripting.executeScript({
      target: { tabId, documentIds: [documentId] },
      func: () => {
        const g = globalThis as { __poe2Selection?: { destroy(): void } }
        g.__poe2Selection?.destroy()
        delete g.__poe2Selection
      },
    })
  },
  async run(block, signal) {
    const prefs = prefsFrom((await chrome.storage.local.get('guide')).guide)
    const store = createIdbStore({
      factory: indexedDB,
      capacityBytes: prefs.cacheLimitMb * 1024 * 1024,
      now: Date.now,
    })
    const { dictionary, stats } = await resources()
    const lexicon = createGameLexicon(stats.terms)
    return translateSelection(
      block,
      {
        dictionary: async () => dictionary,
        stats: { hash: stats.hash, ruleVersion: stats.ruleVersion, resolve: lexicon.resolveStat },
        store,
        prefs: async () => prefs,
        engine: () => guideEngine(prefs, store),
        random: () => crypto.randomUUID().replaceAll('-', ''),
      },
      signal,
    )
  },
})
chrome.runtime.onConnect.addListener(broker.connect)
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (
    !message ||
    typeof message !== 'object' ||
    !String((message as { type?: string }).type).startsWith('selection-')
  )
    return
  void broker
    .control(message, sender)
    .then(reply, () => reply({ ok: false, message: '划词未启用，请重试。' }))
  return true // Chrome 116 用字面 true 保持异步响应通道。
})
chrome.tabs.onRemoved.addListener((id) => {
  void broker.removed(id).catch(() => {})
})

chrome.tabs.onUpdated.addListener((id, change) => {
  if (change.status === 'loading') void broker.removed(id).catch(() => {})
})
