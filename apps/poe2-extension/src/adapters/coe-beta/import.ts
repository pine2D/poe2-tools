import {
  type ItemDictionary,
  type ItemDocument,
  inspectItem,
  knownModifierHeader,
  parseItem,
} from '@poe2-tools/item-core/text'
import { createGameLexicon, type Term } from '@poe2-tools/l10n-core'
import { completeItemFields } from './item-fields'

/** 装备文本转换的预览结果；面板据此呈现结论与核对清单，不另行判断 */
export interface PreparedImport {
  original: string
  english: string
  /** 恒等于 issues.length === 0 */
  ready: boolean
  /** 所有参与转换的机制行均已识别；不等于原站支持导入，名称和标签仍可保留原文。 */
  complete: boolean
  /** 带“第 N 行：”前缀的问题文本 */
  reasons: string[]
  issues: {
    line: number | null
    message: string
    kind: 'unsupported' | 'ambiguous' | 'format' | 'policy'
  }[]
  warnings: string[]
  /** 参与核对的行数；解析失败为 null。ready 时 recognized === total */
  lines: { total: number; recognized: number } | null
  /** 传奇、咒符等仅供对照；为真时 issues[0] 是对照原因（无行号） */
  comparisonOnly: boolean
}

export function itemDictionary(terms: readonly Term[]): ItemDictionary {
  // 原始 stat ID 可对应 Area/Map 等多个模板；语法身份唯一，选择结果保留来源 ID。
  const lexicon = createGameLexicon(
    terms
      .filter((term) => term.domain === 'stat')
      .map((term, i) => ({
        ...term,
        id: `input:${i}:${term.id}`,
        sourceId: term.sourceId ?? term.id,
      })),
  )
  const names = (domain: Term['domain']) =>
    Object.fromEntries(
      terms.filter((t) => t.domain === domain && !t.inputOnly).map((t) => [t.en, t.zh]),
    )
  const inputNames = (domain: Term['domain']) => {
    const result: Record<string, string[]> = {}
    for (const term of terms.filter((t) => t.domain === domain)) {
      const names = result[term.en] ?? []
      names.push(term.zh)
      result[term.en] = names
    }
    return result
  }
  return {
    items: { bases: names('base'), uniques: names('unique') },
    inputNames: { bases: inputNames('base'), uniques: inputNames('unique') },
    mixedInput: true,
    resolveStat(text) {
      const result = lexicon.resolveStat(text, 'toEnglish')
      const candidates = result.candidates.map(({ term, text: english }) => ({
        id: term.sourceId ?? term.id,
        english,
      }))
      return { english: result.text, candidates }
    },
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
    const issue = { ...unparsedIssue(normalized, parsed.error), kind: 'format' as const }
    return {
      original,
      english: '',
      ready: false,
      complete: false,
      reasons: [issue.line === null ? issue.message : `第 ${issue.line} 行：${issue.message}`],
      issues: [issue],
      warnings: [],
      lines: null,
      comparisonOnly: false,
    }
  }
  const item = parsed.item
  const inspection = inspectItem(item, itemDictionary(terms))
  const issues: PreparedImport['issues'] = []
  const seenIssues = new Set<string>()
  const add = (
    message: string,
    line: number | null = null,
    kind: PreparedImport['issues'][number]['kind'] = 'unsupported',
  ) => {
    const key = `${line}\0${message}`
    if (seenIssues.has(key)) return
    seenIssues.add(key)
    issues.push({ line, message, kind })
  }
  // 必须是第一条：comparisonOnly 时面板以 issues[0] 作结论副句
  if (inspection.comparisonOnly)
    add(inspection.comparisonReason ?? '此装备仅供对照。', null, 'policy')
  const warnings: string[] = []
  const { english, fields, ambiguousClass } = completeItemFields(item, inspection, terms)
  if (!inspection.base.english)
    add(
      inspection.base.candidates.length
        ? '基底存在多个英文候选，暂不选择。'
        : '词典暂未收录此基底译名，原文已保留。',
      null,
      inspection.base.candidates.length ? 'ambiguous' : 'unsupported',
    )
  if (ambiguousClass)
    add('物品类别存在跨服译名歧义，原文已保留。请确认实际类别后使用英文类别名。', null, 'ambiguous')
  else if (/^Item Class: .*\p{Script=Han}/u.test(english)) add('物品类别尚未翻译。')
  for (const diagnostic of item.diagnostics)
    if (
      !(diagnostic.code === 'unknown-line' && diagnostic.line !== null && fields[diagnostic.line])
    )
      add(
        diagnostic.message,
        diagnostic.line,
        diagnostic.code.startsWith('unknown-') ? 'unsupported' : 'format',
      )
  if (item.nameLines.length !== (['rare', 'unique'].includes(item.rarity) ? 2 : 1))
    add('装备名称区不完整。', null, 'format')
  // 只检查文本是否能准确表达；前后缀归属、数量及游戏等阶由原站判断。
  for (const { mod, stats } of inspection.mods) {
    const validHeader = knownModifierHeader(mod.header.raw)
    if (!validHeader) add('词缀分组标题尚未完整识别。', mod.header.line)
    for (const { source, resolution } of stats) {
      if (!resolution.english)
        add(
          resolution.candidates.length
            ? '属性存在多个英文候选，暂不选择。'
            : '词典暂未收录此属性译名，原文已保留。',
          source.line,
          resolution.candidates.length ? 'ambiguous' : 'unsupported',
        )
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
        add('数值无效或不在原文范围内。', source.line, 'format')
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
  if (item.mods.some((mod) => mod.magnitude !== undefined))
    warnings.push(
      '原站兼容性：CoE 可能按品质再次计算增效，已见召唤技能等级 +3 显示为 +4。转换保留原文数值与增效，请核对导入后的显示及复制结果。',
    )
  if (inspection.skills.length)
    warnings.push(
      '原站兼容性：授予技能的等级或列表可能被 CoE 重算。已见权杖技能等级变化、项链出现额外技能；转换保留原文，请核对导入结果。',
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
    complete: issues.every((issue) => issue.kind === 'policy'),
    reasons: issues.map(({ line, message }) =>
      line === null ? message : `第 ${line} 行：${message}`,
    ),
    issues,
    warnings: [...new Set(warnings)],
    lines: { total, recognized: total - flagged.size },
    comparisonOnly: inspection.comparisonOnly,
  }
}
