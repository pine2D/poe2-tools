// dict-builder 的常量：URL、路径、User-Agent。网络请求本身只在 cache.ts 里发生。
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Locale } from '@poe2-tools/build-core'

export const LOCALES: readonly Locale[] = ['zh-CN', 'zh-TW']
export const USER_AGENT = 'poe2-tools-dict-builder (github.com/pine2D/poe2-tools)'

// 仓库根：packages/dict-builder/src → 上三级
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
export const CACHE_DIR = resolve(REPO_ROOT, 'data', 'cache')
export const DICT_DIR = resolve(REPO_ROOT, 'data', 'dict')
export const OVERRIDES_DIR = resolve(DICT_DIR, '_overrides')
// 覆盖率语料：local 为第三方真实样本（不入库，可缺席），synthetic 为合成样本
export const FIXTURE_DIRS: Record<'local' | 'synthetic', string> = {
  local: resolve(REPO_ROOT, 'data', 'fixtures', 'local'),
  synthetic: resolve(REPO_ROOT, 'data', 'fixtures', 'synthetic'),
}

// 三服交易站：en 只作英文侧规范文本，不产出词典
export const TRADE2_HOSTS = {
  en: 'https://www.pathofexile.com',
  'zh-CN': 'https://poe.game.qq.com',
  'zh-TW': 'https://pathofexile.tw',
} as const
export type Trade2Realm = keyof typeof TRADE2_HOSTS
export type Trade2Endpoint = 'stats' | 'items' | 'static' | 'leagues'

export function trade2Url(realm: Trade2Realm, endpoint: Trade2Endpoint): string {
  return `${TRADE2_HOSTS[realm]}/api/trade2/data/${endpoint}`
}

export const REPOE_PASSIVES_URL =
  'https://raw.githubusercontent.com/repoe-fork/poe2/master/data/passive_skill_trees/Default.json'

// poe2db 天赋树：页面里引用的 bundle 文件名带哈希，bundle 里硬编码模板版本（当前 4.5）
export const POE2DB_TREE_PAGE_URL = 'https://poe2db.tw/cn/passive-skill-tree'
export const POE2DB_JS_BASE = 'https://cdn.poe2db.tw/js/'
export const POE2DB_TREE_FALLBACK_VERSION = '4.5'
export const POE2DB_LANG: Record<Locale, string> = { 'zh-CN': 'cn', 'zh-TW': 'tw' }

export function poe2dbTreeUrl(version: string, locale: Locale): string {
  return `https://poe2db.tw/data/passive-skill-tree/${version}/data_${POE2DB_LANG[locale]}.json?5`
}

// 灰区源总开关：未设置或非 0/false 即开启
export function poe2dbEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env.DICT_ENABLE_POE2DB
  if (value === undefined) return true
  return value !== '0' && value.toLowerCase() !== 'false'
}
