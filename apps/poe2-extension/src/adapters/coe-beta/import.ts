import {
  type ItemDictionary,
  type ItemDocument,
  inspectItem,
  knownExplicitHeader,
  knownImplicitHeader,
  parseItem,
} from '@poe2-tools/item-core/text'
import type { Term } from '@poe2-tools/l10n-core'
import { completeItemFields } from './item-fields'

/** 装备文本转换的预览结果；面板据此呈现结论与核对清单，不另行判断 */
export interface PreparedImport {
  original: string
  english: string
  /** 恒等于 issues.length === 0 */
  ready: boolean
  /** 带“第 N 行：”前缀的问题文本 */
  reasons: string[]
  issues: { line: number | null; message: string }[]
  warnings: string[]
  /** 参与核对的行数；解析失败为 null。ready 时 recognized === total */
  lines: { total: number; recognized: number } | null
  /** 传奇、咒符等仅供对照；为真时 issues[0] 是对照原因（无行号） */
  comparisonOnly: boolean
}

export function itemDictionary(terms: readonly Term[]): ItemDictionary {
  const names = (domain: Term['domain']) =>
    Object.fromEntries(terms.filter((t) => t.domain === domain).map((t) => [t.en, t.zh]))
  return {
    items: { bases: names('base'), uniques: names('unique') },
    stats: {
      entries: terms
        .filter((t) => t.domain === 'stat')
        .map((t) => ({
          id: t.sourceId ?? t.id,
          en: t.en,
          text: t.zh,
          ...(t.order ? { order: t.order } : {}),
        })),
    },
  }
}

/** 参与核对的行号：名称行，以及交易备注（note）、描述（description）以外各块的非空行。
    空行与分隔线不进 ItemDocument；类别行、稀有度行不记行号，由调用方另加 2。 */
function checkedLines(item: ItemDocument): Set<number> {
  const lines = new Set(item.nameLines.map(({ line }) => line))
  for (const block of item.blocks)
    if (block.kind !== 'note' && block.kind !== 'description')
      for (const { raw, line } of block.lines) if (raw.trim()) lines.add(line)
  return lines
}

/** item-core 只回“无法识别装备文本”；面板结论已是这句，待核对改写出认不出的具体原因（标签写法同 item-core 的 LABELS） */
function unparsedIssue(
  normalized: string,
  error: string,
): { line: number | null; message: string } {
  if (error !== '无法识别装备文本') return { line: null, message: error }
  const rows = normalized.split(/\r?\n/)
  const hasClass = rows.some((row) => /^(?:物品类别|物品種類|Item Class)\s*:\s*\S/i.test(row))
  const rarityIndex = rows.findIndex((row) => /^(?:稀有度|Rarity)\s*:\s*\S/i.test(row))
  if (!hasClass && rarityIndex < 0) return { line: null, message: '没有找到“物品类别”和“稀有度”行' }
  if (!hasClass) return { line: null, message: '没有找到“物品类别”行' }
  if (rarityIndex < 0) return { line: null, message: '没有找到“稀有度”行' }
  const value = (rows[rarityIndex] ?? '').replace(/^[^:]*:\s*/, '').trim()
  return {
    line: rarityIndex + 1,
    message: `稀有度“${value}”认不出，应为普通、魔法、稀有或传奇`,
  }
}

export function prepareImport(original: string, terms: readonly Term[]): PreparedImport {
  const normalized = original.replace(/^(物品类别|稀有度)\s*：/gm, '$1:')
  const parsed = parseItem(normalized)
  if (!parsed.ok) {
    const issue = unparsedIssue(normalized, parsed.error)
    return {
      original,
      english: '',
      ready: false,
      reasons: [issue.line === null ? issue.message : `第 ${issue.line} 行：${issue.message}`],
      issues: [issue],
      warnings: [],
      lines: null,
      comparisonOnly: false,
    }
  }
  const item = parsed.item
  const inspection = inspectItem(item, itemDictionary(terms))
  const issues: { line: number | null; message: string }[] = []
  const seenIssues = new Set<string>()
  const add = (message: string, line: number | null = null) => {
    const key = `${line}\0${message}`
    if (seenIssues.has(key)) return
    seenIssues.add(key)
    issues.push({ line, message })
  }
  // 必须是第一条：comparisonOnly 时面板以 issues[0] 作结论副句
  if (inspection.comparisonOnly) add(inspection.comparisonReason ?? '此装备仅供对照。')
  const warnings: string[] = []
  const { english, fields } = completeItemFields(item, inspection, terms)
  if (!inspection.base.english) add('基底译名未匹配或存在歧义，无法确认英文。')
  if (/^Item Class: .*\p{Script=Han}/u.test(english)) add('物品类别尚未翻译。')
  for (const diagnostic of item.diagnostics)
    if (
      !(diagnostic.code === 'unknown-line' && diagnostic.line !== null && fields[diagnostic.line])
    )
      add(diagnostic.message, diagnostic.line)
  if (item.nameLines.length !== (item.rarity === 'rare' ? 2 : 1)) add('装备名称区不完整。')
  // 只检查文本是否能准确表达；前后缀归属、数量及游戏等阶由原站判断。
  for (const { mod, stats } of inspection.mods) {
    const validHeader =
      mod.kind === 'implicit'
        ? knownImplicitHeader(mod.header.raw)
        : ['prefix', 'suffix'].includes(mod.kind) && knownExplicitHeader(mod.header.raw)
    if (!validHeader) add('词缀分组标题尚未完整识别。', mod.header.line)
    for (const { source, resolution } of stats) {
      if (!resolution.english) add('属性译名未匹配或存在歧义，无法确认英文。', source.line)
      if (
        source.rolls.some(
          (roll) =>
            !Number.isFinite(roll.value) ||
            (roll.range &&
              (roll.range.some((value) => !Number.isFinite(value)) ||
                roll.value < Math.min(...roll.range) ||
                roll.value > Math.max(...roll.range))),
        )
      )
        add('数值无效或不在原文范围内。', source.line)
      if (
        inspection.base.english === 'Mail Belt' &&
        mod.kind === 'implicit' &&
        resolution.english &&
        resolution.candidates.some((candidate) => candidate.id === 'implicit.stat_1416292992')
      )
        warnings.push(
          '原站兼容性：环锁腰带的咒符位曾被 CoE 拒绝或丢失。英文仍保留原值，请勿删行绕过；导入后核对结果。',
        )
    }
  }
  if (inspection.base.english === 'Rattling Sceptre' && inspection.skills.length)
    warnings.push(
      '原站兼容性：罪孽权杖的授予技能等级可能被 CoE 重算。转换保留当前与最高等级，请核对导入结果。',
    )
  for (const block of item.blocks) {
    if (['note', 'description', 'modifiers'].includes(block.kind)) continue
    for (const line of block.lines)
      if (line.raw.trim() && !inspection.englishByLine[line.line] && !fields[line.line])
        add('该行尚未完整识别或翻译。', line.line)
  }
  // 已识别 = 参与核对的行减去带问题的不重复行号（同一行多条问题只算一次）
  const checked = checkedLines(item)
  const flagged = new Set(
    issues.flatMap(({ line }) => (line !== null && checked.has(line) ? [line] : [])),
  )
  const total = 2 + checked.size
  return {
    original,
    english,
    ready: issues.length === 0,
    reasons: issues.map(({ line, message }) =>
      line === null ? message : `第 ${line} 行：${message}`,
    ),
    issues,
    warnings: [...new Set(warnings)],
    lines: { total, recognized: total - flagged.size },
    comparisonOnly: inspection.comparisonOnly,
  }
}
