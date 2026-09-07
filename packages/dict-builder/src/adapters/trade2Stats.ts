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
  // pseudo 组从不印在装备上：整组跳过，这里记录被跳过的 en 条目数
  excludedEntries: number
  // 常量数字写成字面量的词缀（如 "per 20 Dexterity"）：消费端归一化后永远匹配不上，先只做度量
  literalNumber: number
  literalNumberIds: MultiPlaceholderEntry[]
  // 国服未翻译、译文与原文字面相同的词缀条数
  untranslatedSameAsEn: number
  // stat-order.json 里没有被任何输出条目消费的键
  unusedOrderKeys: string[]
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

// pseudo 组是交易站筛选器的聚合项（如 "# Desecrated Prefix Modifiers"），从不印在装备上；
// 其中的词条会抢在 explicit 之前被索引并产出错译，整组跳过
function textsById(response: Trade2StatsResponse): Map<string, Occurrence[]> {
  const map = new Map<string, Occurrence[]>()
  for (const group of response.result) {
    if (group.id === 'pseudo') continue
    for (const entry of group.entries) {
      const occurrence: Occurrence = { group: group.id, text: entry.text }
      const list = map.get(entry.id)
      if (list === undefined) map.set(entry.id, [occurrence])
      else list.push(occurrence)
    }
  }
  return map
}

function countPseudoEntries(response: Trade2StatsResponse): number {
  let count = 0
  for (const group of response.result) {
    if (group.id === 'pseudo') count += group.entries.length
  }
  return count
}

// 交易站个别词条把说明写成多行（如 "Recover #% of Life\nevery 4 seconds"）；折成单行再剥后缀，
// 避免换行混进编号行；匹配侧本就由 templateKey 折叠空白，不受影响
function foldMultiline(text: string): string {
  return text.replace(/\s*\r?\n\s*/g, ' ')
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
  const usedOrderKeys = new Set<string>()
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
    excludedEntries: countPseudoEntries(input.en),
    literalNumber: 0,
    literalNumberIds: [],
    untranslatedSameAsEn: 0,
    unusedOrderKeys: [],
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
      const enStripped = stripTradeSuffix(foldMultiline(occurrence.text), 'en')
      const textStripped = stripTradeSuffix(foldMultiline(targetText), input.locale)
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
      if (/\d/.test(enStripped)) {
        audit.literalNumber += 1
        audit.literalNumberIds.push({ key, en: enStripped, text: textStripped })
      }
      if (textStripped === enStripped) audit.untranslatedSameAsEn += 1
      const exactOrder = input.orderOverrides[key]
      let order: number[] | undefined
      if (exactOrder !== undefined) {
        order = exactOrder
        usedOrderKeys.add(key)
      } else if (k === 0) {
        const plainOrder = input.orderOverrides[id]
        if (plainOrder !== undefined) {
          order = plainOrder
          usedOrderKeys.add(id)
        }
      }
      if (order === undefined) {
        entries.push({ id, en: enStripped, text: textStripped })
      } else {
        entries.push({ id, en: enStripped, text: textStripped, order })
        audit.orderApplied += 1
      }
      audit.joined += 1
    }
  }
  for (const orderKey of Object.keys(input.orderOverrides)) {
    if (!usedOrderKeys.has(orderKey)) audit.unusedOrderKeys.push(orderKey)
  }
  return {
    dict: { _meta: { ...input.meta, tier: 'primary', count: entries.length }, entries },
    audit,
  }
}
