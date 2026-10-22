import type { Provider } from './engines/openai'

// 保存在 chrome.storage.local 的 guide 键：只放非敏感偏好，CoE 内容脚本只关心 settings 键。
export interface GuidePrefs {
  introSeen: boolean
  noticeVersion: string | null
  charLimit: number
  cacheLimitMb: number
  provider: Provider
  customBaseUrl: string
  customModel: string
  extraBody: string
  confirmedOrigins: string[]
}

export const DEFAULT_PREFS: GuidePrefs = {
  introSeen: false,
  noticeVersion: null,
  charLimit: 20000,
  cacheLimitMb: 50,
  provider: 'deepseek',
  customBaseUrl: '',
  customModel: '',
  extraBody: '',
  confirmedOrigins: [],
}

export const LIMIT_RANGES = {
  charLimit: [1000, 200000],
  cacheLimitMb: [5, 500],
} as const

/** 交互保存必须拒绝非法值；仅读取旧配置时允许回退默认值。 */
export function limitError(name: keyof typeof LIMIT_RANGES, value: number): string | null {
  const [min, max] = LIMIT_RANGES[name]
  return Number.isInteger(value) && value >= min && value <= max
    ? null
    : `请输入 ${min}–${max} 之间的整数。`
}

const int = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : fallback
const text = (v: unknown, fallback: string) => (typeof v === 'string' ? v : fallback)

export function prefsFrom(value: unknown): GuidePrefs {
  const v = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
  return {
    introSeen: v.introSeen === true,
    noticeVersion: typeof v.noticeVersion === 'string' ? v.noticeVersion : null,
    charLimit: int(v.charLimit, ...LIMIT_RANGES.charLimit, DEFAULT_PREFS.charLimit),
    cacheLimitMb: int(v.cacheLimitMb, ...LIMIT_RANGES.cacheLimitMb, DEFAULT_PREFS.cacheLimitMb),
    provider: v.provider === 'custom' ? 'custom' : 'deepseek',
    customBaseUrl: text(v.customBaseUrl, ''),
    customModel: text(v.customModel, ''),
    extraBody: text(v.extraBody, ''),
    confirmedOrigins: Array.isArray(v.confirmedOrigins)
      ? v.confirmedOrigins.filter((o): o is string => typeof o === 'string')
      : [],
  }
}
