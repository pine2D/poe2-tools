import { readSites, SITES_KEY } from '../selection/sites'
import { createSitesView } from './view'
import '../guide/guide.css'
import './sites.css'

declare const chrome: {
  storage: {
    local: {
      get(key: string): Promise<Record<string, unknown>>
      set(value: Record<string, unknown>): Promise<void>
    }
  }
  permissions: {
    request(value: { origins: string[] }): Promise<boolean>
    contains(value: { origins: string[] }): Promise<boolean>
    remove(value: { origins: string[] }): Promise<boolean>
    onRemoved: { addListener(fn: () => void): void }
  }
}
const view = createSitesView(document, {
  read: async () => readSites((await chrome.storage.local.get(SITES_KEY))[SITES_KEY]),
  write: (sites) => chrome.storage.local.set({ [SITES_KEY]: sites }),
  request: (origins) => chrome.permissions.request({ origins }),
  contains: (origin) => chrome.permissions.contains({ origins: [origin] }),
  remove: (origin) => chrome.permissions.remove({ origins: [origin] }),
})
document.body.append(view.root)
chrome.permissions.onRemoved.addListener(() => {
  void view.refresh()
})
