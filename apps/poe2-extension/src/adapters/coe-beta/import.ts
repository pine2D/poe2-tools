import {
  type ItemDictionary,
  inspectItem,
  knownExplicitHeader,
  knownImplicitHeader,
  parseItem,
} from '@poe2-tools/item-core/text'
import type { Term } from '@poe2-tools/l10n-core'
import { completeItemFields } from './item-fields'

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
export function prepareImport(original: string, terms: readonly Term[]) {
  const parsed = parseItem(original.replace(/^(物品类别|稀有度)\s*：/gm, '$1:'))
  if (!parsed.ok)
    return {
      original,
      english: '',
      ready: false,
      reasons: [parsed.error],
      issues: [{ line: null as number | null, message: parsed.error }],
      warnings: [] as string[],
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
  return {
    original,
    english,
    ready: issues.length === 0,
    reasons: issues.map(({ line, message }) =>
      line === null ? message : `第 ${line} 行：${message}`,
    ),
    issues,
    warnings: [...new Set(warnings)],
  }
}
