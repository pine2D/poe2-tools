import type { KeyRecord } from './types'

const LOCAL = new Set(['localhost', '127.0.0.1'])

export function originOf(baseUrl: string): string | null {
  try {
    const url = new URL(baseUrl)
    if (url.protocol === 'https:' || (url.protocol === 'http:' && LOCAL.has(url.hostname)))
      return url.origin
    return null
  } catch {
    return null
  }
}

// Key 只交给它保存时绑定的那个来源。
export function keyForConfig(record: KeyRecord | null, baseUrl: string): string | null {
  const origin = originOf(baseUrl)
  return record && origin && record.origin === origin ? record.apiKey : null
}
