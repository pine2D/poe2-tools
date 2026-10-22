import type { GuideDictionary } from '@poe2-tools/guide-core'
import { createGameLexicon, type Term } from '@poe2-tools/l10n-core'
import { prefsFrom } from '../guide/prefs'
import { guideEngine } from '../guide/runtime'
import { translateSelection } from '../guide/selection'
import { createIdbStore } from '../guide/store/idb'
import { readSites, SITES_KEY, siteMatches, sitePermission } from '../selection/sites'
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
    onStartup: { addListener(callback: () => void): void }
    onInstalled: { addListener(callback: () => void): void }
    onConnect: { addListener(callback: (port: SelectionPort) => void): void }
  }
  permissions: {
    contains(value: { origins: string[] }): Promise<boolean>
    onRemoved: { addListener(callback: () => void): void }
    onAdded: { addListener(callback: () => void): void }
  }
  storage: {
    onChanged: {
      addListener(callback: (changes: Record<string, unknown>, area: string) => void): void
    }
    local: { get(key: string): Promise<Record<string, unknown>> }
    session: {
      get(key: string | null): Promise<Record<string, unknown>>
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
    query(query: Record<string, never>): Promise<Array<{ id?: number; url?: string }>>
    get(id: number): Promise<{ id?: number; url?: string }>
    sendMessage(id: number, message: unknown, options: { documentId: string }): Promise<unknown>
    onUpdated: {
      addListener(callback: (id: number, change: { status?: string; url?: string }) => void): void
    }
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
const allowedAutomatic = async (url: string) => {
  const sites = readSites((await chrome.storage.local.get(SITES_KEY))[SITES_KEY])
  const site = sites.find((s) => siteMatches(s, url))
  return !!site && chrome.permissions.contains({ origins: [sitePermission(site)] })
}
const broker = createSelectionBroker({
  automatic: {
    allowed: allowedAutomatic,
    async getUrl(tabId) {
      const key = `${grantKey(tabId)}:auto`
      const value = (await chrome.storage.session.get(key))[key]
      return typeof value === 'string' ? value : null
    },
    async getPaused(tabId) {
      const key = `${grantKey(tabId)}:paused`
      const value = (await chrome.storage.session.get(key))[key]
      return typeof value === 'string' ? value : null
    },
    async setPaused(tabId, documentId) {
      const key = `${grantKey(tabId)}:paused`
      if (documentId) await chrome.storage.session.set({ [key]: documentId })
      else await chrome.storage.session.remove(key)
    },
  },
  extensionId: chrome.runtime.id,
  popupUrl: chrome.runtime.getURL('popup.html'),
  async getGrant(tabId) {
    const key = grantKey(tabId),
      value = (await chrome.storage.session.get(key))[key]
    return typeof value === 'string' ? value : null
  },
  async setGrant(tabId, documentId, automaticUrl) {
    const key = grantKey(tabId)
    if (documentId) await chrome.storage.session.set({ [key]: documentId })
    else await chrome.storage.session.remove(key)
    if (automaticUrl) await chrome.storage.session.set({ [`${key}:auto`]: automaticUrl })
    else await chrome.storage.session.remove(`${key}:auto`)
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
    // 撤销 host 权限后不能 executeScript；已注入的隔离脚本仍可接收扩展消息清理。
    await chrome.tabs
      .sendMessage(tabId, { type: 'selection-deactivate' }, { documentId })
      .catch(() => {})
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
  void broker.removed(id, true).catch(() => {})
})

chrome.tabs.onUpdated.addListener((id, change) => {
  if (change.status === 'loading') void broker.removed(id).catch(() => {})
  else if (change.status === 'complete' || change.url)
    void chrome.tabs
      .get(id)
      .then(refreshTab)
      .catch(() => {})
})

const refreshTab = async (tab: { id?: number; url?: string }) => {
  if (typeof tab.id !== 'number') return
  const key = `${grantKey(tab.id)}:auto`
  const existing = (await chrome.storage.session.get(key))[key]
  if (existing || (tab.url && (await allowedAutomatic(tab.url)))) await broker.automatic(tab.id)
}
const refreshAutomatic = () => {
  void chrome.tabs
    .query({})
    .then((tabs) => Promise.all(tabs.map((tab) => refreshTab(tab).catch(() => {}))))
    .catch(() => {})
}
chrome.runtime.onStartup.addListener(refreshAutomatic)
chrome.runtime.onInstalled.addListener(refreshAutomatic)
chrome.permissions.onAdded.addListener(refreshAutomatic)
chrome.permissions.onRemoved.addListener(refreshAutomatic)
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && SITES_KEY in changes) refreshAutomatic()
})
