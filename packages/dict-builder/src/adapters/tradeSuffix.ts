// 交易站为消歧追加、游戏内不显示的行尾后缀（名单式；清单见
// docs/superpowers/research/2026-09-07-dict-builder-scout.md §2.7）。zh-CN 与 zh-TW 都混用半角与全角括号。
import type { Locale } from '@poe2-tools/build-core'

const SUFFIXES: Record<'en' | Locale, readonly string[]> = {
  en: ['Local', 'Jewel', 'Global', 'Gold Piles', 'Tablets', 'Charm', 'Flask'],
  'zh-CN': ['区域', '珠宝', '全域', '金币堆', '咒符', '药剂', '石板'],
  'zh-TW': ['部分', '珠寶', '全域', '金幣堆', '護符', '藥劑', '碑牌'],
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function pattern(terms: readonly string[]): RegExp {
  return new RegExp(`\\s*[（(](?:${terms.map(escapeRegex).join('|')})[)）]\\s*$`, 'u')
}

const PATTERNS: Record<'en' | Locale, RegExp> = {
  en: pattern(SUFFIXES.en),
  'zh-CN': pattern(SUFFIXES['zh-CN']),
  'zh-TW': pattern(SUFFIXES['zh-TW']),
}

export function stripTradeSuffix(text: string, lang: 'en' | Locale): string {
  return text.replace(PATTERNS[lang], '')
}
