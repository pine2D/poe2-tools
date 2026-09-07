// 官方交易站 /api/trade2/data/stats：三服 stat id 同构，按 id 对齐即可得到 en → 目标语言的词缀模板。
import { type Locale, type StatEntry, type StatsDict, templateKey } from '@poe2-tools/build-core'
import { countPlaceholders } from '../util/json'
import { stripTradeSuffix } from './tradeSuffix'

export interface Trade2StatEntry {
  id: string
  text: string
  type: string
}

export interface Trade2StatsResponse {
  result: Array<{ id: string; label: string; entries: Trade2StatEntry[] }>
}

export interface StatsBuildInput {
  en: Trade2StatsResponse
  target: Trade2StatsResponse
  locale: Locale
  orderOverrides: Record<string, number[]>
  meta: { source: string; gameVersion: string; fetchedAt: string }
}

export interface MultiPlaceholderEntry {
  key: string
  en: string
  text: string
}

// 键形式 <id>#<k>：k 是该 id 在组内第几次出现（Area / Map 语境变体）
export interface StatsAudit {
  enIds: number
  targetIds: number
  joined: number
  missingInTarget: number
  groupMismatch: number
  placeholderMismatch: string[]
  duplicateIds: number
  multiPlaceholder: number
  multiPlaceholderIds: MultiPlaceholderEntry[]
  orderApplied: number
  residualSuffix: string[]
  mergedSameText: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireString(value: unknown, where: string): string {
  if (typeof value !== 'string') throw new Error(`trade2 stats 形态不对：${where} 不是字符串`)
  return value
}

export function parseTrade2Stats(raw: unknown): Trade2StatsResponse {
  if (!isRecord(raw) || !Array.isArray(raw.result))
    throw new Error('trade2 stats 形态不对：缺少 result 数组')
  const result = raw.result.map((group, g) => {
    const where = `result[${g}]`
    if (!isRecord(group) || !Array.isArray(group.entries))
      throw new Error(`trade2 stats 形态不对：${where}.entries 不是数组`)
    const entries = group.entries.map((entry, e) => {
      const at = `${where}.entries[${e}]`
      if (!isRecord(entry)) throw new Error(`trade2 stats 形态不对：${at} 不是对象`)
      return {
        id: requireString(entry.id, `${at}.id`),
        text: requireString(entry.text, `${at}.text`),
        type: requireString(entry.type, `${at}.type`),
      }
    })
    return {
      id: requireString(group.id, `${where}.id`),
      label: requireString(group.label, `${where}.label`),
      entries,
    }
  })
  return { result }
}

// 同一 id 可在组内出现两次（Area / Map 语境变体）：按出现顺序收集，三服按"第 k 次出现"对齐；
// 顺带记录所属分组，供跨服核对（同一 id 目前只在一个分组出现，突变即审计告警）
interface Occurrence {
  group: string
  text: string
}

function textsById(response: Trade2StatsResponse): Map<string, Occurrence[]> {
  const map = new Map<string, Occurrence[]>()
  for (const group of response.result) {
    for (const entry of group.entries) {
      const occurrence: Occurrence = { group: group.id, text: entry.text }
      const list = map.get(entry.id)
      if (list === undefined) map.set(entry.id, [occurrence])
      else list.push(occurrence)
    }
  }
  return map
}

// 剥离后仍以短括号词结尾：可能是名单没收录的新后缀，只作审计信号
const RESIDUAL_SUFFIX = /[（(][^（()）]{1,10}[)）]\s*$/u

function variantKey(id: string, k: number): string {
  return `${id}#${k}`
}

export function buildStatsDict(input: StatsBuildInput): { dict: StatsDict; audit: StatsAudit } {
  const en = textsById(input.en)
  const target = textsById(input.target)
  const entries: StatEntry[] = []
  const seen = new Set<string>()
  const audit: StatsAudit = {
    enIds: en.size,
    targetIds: target.size,
    joined: 0,
    missingInTarget: 0,
    groupMismatch: 0,
    placeholderMismatch: [],
    duplicateIds: 0,
    multiPlaceholder: 0,
    multiPlaceholderIds: [],
    orderApplied: 0,
    residualSuffix: [],
    mergedSameText: 0,
  }
  for (const [id, enList] of en) {
    const targetList = target.get(id)
    if (targetList === undefined) {
      audit.missingInTarget += 1
      continue
    }
    if (enList.length > 1) audit.duplicateIds += 1
    // 第 k 次出现所属分组必须两边一致，否则 k 对齐无意义
    const groupsAgree = enList.every((occurrence, k) => {
      const counterpart = targetList[k]
      return counterpart === undefined || counterpart.group === occurrence.group
    })
    if (!groupsAgree) {
      audit.groupMismatch += 1
      continue
    }
    for (const [k, occurrence] of enList.entries()) {
      const targetText = targetList[k]?.text
      if (targetText === undefined) {
        audit.missingInTarget += 1
        continue
      }
      const key = variantKey(id, k)
      const enStripped = stripTradeSuffix(occurrence.text, 'en')
      const textStripped = stripTradeSuffix(targetText, input.locale)
      const enCount = countPlaceholders(enStripped)
      const textCount = countPlaceholders(textStripped)
      // 占位符个数不一致：不输出（运行期本就 fail-closed），order 也救不了，留给 2b 的整句直出
      if (enCount !== textCount) {
        audit.placeholderMismatch.push(key)
        continue
      }
      // 同一模板键且译文相同（explicit / fractured / crafted… 分组间的同文本词缀）只留先出现的一条
      const mergeKey = JSON.stringify([templateKey(enStripped), textStripped])
      if (seen.has(mergeKey)) {
        audit.mergedSameText += 1
        continue
      }
      seen.add(mergeKey)
      // 以下审计只统计真正输出的条目
      if (RESIDUAL_SUFFIX.test(enStripped) || RESIDUAL_SUFFIX.test(textStripped))
        audit.residualSuffix.push(key)
      if (enCount >= 2) {
        audit.multiPlaceholder += 1
        audit.multiPlaceholderIds.push({ key, en: enStripped, text: textStripped })
      }
      const order = input.orderOverrides[key] ?? (k === 0 ? input.orderOverrides[id] : undefined)
      if (order === undefined) {
        entries.push({ id, en: enStripped, text: textStripped })
      } else {
        entries.push({ id, en: enStripped, text: textStripped, order })
        audit.orderApplied += 1
      }
      audit.joined += 1
    }
  }
  return {
    dict: { _meta: { ...input.meta, tier: 'primary', count: entries.length }, entries },
    audit,
  }
}
