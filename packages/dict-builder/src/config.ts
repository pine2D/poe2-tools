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

export const REPOE_SKILL_GEMS_URL =
  'https://raw.githubusercontent.com/repoe-fork/poe2/master/data/skill_gems.json'

// poe2db 天赋树：页面里引用的 bundle 文件名带哈希，bundle 里硬编码模板版本（当前 4.5）
export const POE2DB_TREE_PAGE_URL = 'https://poe2db.tw/cn/passive-skill-tree'
export const POE2DB_JS_BASE = 'https://cdn.poe2db.tw/js/'
export const POE2DB_TREE_FALLBACK_VERSION = '4.5'
export type Poe2dbLang = 'us' | 'cn' | 'tw'
export const POE2DB_EN_LANG: Poe2dbLang = 'us'
export const POE2DB_LANG: Record<Locale, Poe2dbLang> = { 'zh-CN': 'cn', 'zh-TW': 'tw' }

// poe2db 列表页：只抓这些页面，不抓详情页。相邻真实请求至少间隔 POE2DB_MIN_INTERVAL_MS
export const POE2DB_MIN_INTERVAL_MS = 1500
export const POE2DB_GEM_LIST = 'Gem'
export const POE2DB_UNIQUE_LIST = 'Unique_item'
// 装备分类页：按 trade2 en /items 的装备类分组（accessory / armour / flask / jewel / weapon，1543 个 type）
// 反查得到的最小完备名单，实测 100% 覆盖；站上另有 Claws / Relics / Traps / Tablet / Waystones 等分类页，
// 当前没有对应的 trade2 type，不抓
export const POE2DB_BASE_LISTS: readonly string[] = [
  'Amulets',
  'Belts',
  'Body_Armours',
  'Boots',
  'Bows',
  'Bucklers',
  'Charms',
  'Crossbows',
  'Daggers',
  'Flails',
  'Foci',
  'Gloves',
  'Helmets',
  'Jewels',
  'Life_Flasks',
  'Mana_Flasks',
  'One_Hand_Axes',
  'One_Hand_Maces',
  'One_Hand_Swords',
  'Quarterstaves',
  'Quivers',
  'Rings',
  'Sceptres',
  'Shields',
  'Spears',
  'Staves',
  'Talismans',
  'Two_Hand_Axes',
  'Two_Hand_Maces',
  'Two_Hand_Swords',
  'Wands',
]

export function poe2dbListUrl(lang: Poe2dbLang, slug: string): string {
  return `https://poe2db.tw/${lang}/${slug}`
}

export function poe2dbTreeUrl(version: string, locale: Locale): string {
  return `https://poe2db.tw/data/passive-skill-tree/${version}/data_${POE2DB_LANG[locale]}.json?5`
}

// 灰区源总开关：未设置或非 0/false 即开启
export function poe2dbEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env.DICT_ENABLE_POE2DB
  if (value === undefined) return true
  return value !== '0' && value.toLowerCase() !== 'false'
}
