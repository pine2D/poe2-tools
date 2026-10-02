export interface Settings {
  enabled: boolean
  bilingual: boolean
}
export const defaults: Settings = { enabled: true, bilingual: false }
interface ChromeApi {
  runtime: { getURL(path: string): string }
  storage: {
    local: {
      get(key: string): Promise<Record<string, unknown>>
      set(value: Record<string, unknown>): Promise<void>
    }
    onChanged: {
      addListener(
        callback: (changes: Record<string, { newValue?: unknown }>, area: string) => void,
      ): void
    }
  }
}
declare const chrome: ChromeApi
export function settingsFrom(value: unknown): Settings {
  if (!value || typeof value !== 'object') return { ...defaults }
  const input = value as Record<string, unknown>
  return {
    enabled: typeof input.enabled === 'boolean' ? input.enabled : defaults.enabled,
    bilingual: typeof input.bilingual === 'boolean' ? input.bilingual : defaults.bilingual,
  }
}
export const platform = {
  resource: (path: string) => chrome.runtime.getURL(path),
  read: async () => settingsFrom((await chrome.storage.local.get('settings')).settings),
  write: (settings: Settings) => chrome.storage.local.set({ settings }),
  subscribe: (callback: (settings: Settings) => void) =>
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.settings) callback(settingsFrom(changes.settings.newValue))
    }),
}
