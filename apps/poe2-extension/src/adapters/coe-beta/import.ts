import {
  type ItemDictionary,
  inspectItem,
  knownExplicitHeader,
  parseItem,
} from '@poe2-tools/item-core/text'
import type { Term } from '@poe2-tools/l10n-core'

// 开发预览的文本资格边界；逐项端到端证据见兼容性文档，不调用本机制作资格。
const verifiedStats = new Set([
  'explicit.stat_4052037485',
  'explicit.stat_3291658075',
  'explicit.stat_1050105434',
  'explicit.stat_1671376347',
  'explicit.stat_789117908',
  'explicit.stat_2923486259',
])
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
  const parsed = parseItem(original)
  if (!parsed.ok) return { original, english: '', ready: false, reasons: [parsed.error] }
  const item = parsed.item
  const inspection = inspectItem(item, itemDictionary(terms))
  const reasons: string[] = []
  if (inspection.comparisonOnly) reasons.push(inspection.comparisonReason ?? '此装备仅供对照。')
  if (
    inspection.base.english !== 'Runed Focus' ||
    !['法器', 'Foci'].includes(item.itemClass) ||
    !['magic', 'rare'].includes(item.rarity)
  )
    reasons.push('首批导入仅验收符文法器的魔法／稀有普通词缀；其余装备仍可对照。')
  if (item.corrupted || item.mirrored || item.unidentified || item.fractured || item.twiceCorrupted)
    reasons.push('特殊装备标记尚未验收。')
  if (item.itemLevel === null || item.itemLevel < 1 || item.itemLevel > 100)
    reasons.push('物品等级缺失或超出范围。')
  if (item.diagnostics.length) reasons.push(...item.diagnostics.map((d) => d.message))
  if (item.nameLines.length !== (item.rarity === 'rare' ? 2 : 1)) reasons.push('装备名称区不完整。')
  if (!item.mods.length) reasons.push('缺少 Ctrl+Alt+C 高级词缀分组。')
  for (const kind of ['prefix', 'suffix'])
    if (item.mods.filter((m) => m.kind === kind).length > (item.rarity === 'magic' ? 1 : 3))
      reasons.push('前后缀数量超出普通装备范围。')
  const seenStats = new Set<string>()
  const prefixStats = new Set([
    'explicit.stat_4052037485',
    'explicit.stat_3291658075',
    'explicit.stat_1050105434',
  ])
  for (const { mod, stats } of inspection.mods) {
    if (
      !['prefix', 'suffix'].includes(mod.kind) ||
      !knownExplicitHeader(mod.header.raw) ||
      mod.tier === null ||
      mod.tier < 1 ||
      !Number.isInteger(mod.tier) ||
      mod.tier > 99 ||
      mod.states?.length ||
      mod.magnitude !== undefined ||
      stats.length !== 1
    )
      reasons.push('复合词缀、特殊来源、缺等阶等结构尚未验收。')
    for (const { source, resolution } of stats) {
      const identities = [
        ...new Set(
          resolution.candidates
            .filter((c) => c.english === resolution.english && verifiedStats.has(c.id))
            .map((c) => c.id),
        ),
      ]
      if (identities.length !== 1) reasons.push('普通属性身份未唯一识别。')
      for (const id of identities) {
        if (seenStats.has(id)) reasons.push('同一普通属性重复出现，不能确认完整导入。')
        if (mod.kind !== (prefixStats.has(id) ? 'prefix' : 'suffix'))
          reasons.push('普通属性与前后缀分组不符。')
        seenStats.add(id)
      }
      if (
        !resolution.english ||
        !resolution.candidates.some(
          (c) => verifiedStats.has(c.id) && c.english === resolution.english,
        )
      )
        reasons.push('存在未识别、歧义或尚未验收的属性。')
      if (
        source.unscalable ||
        source.states?.length ||
        !source.rolls.length ||
        source.rolls.some(
          (r) => !r.range || r.value < Math.min(...r.range) || r.value > Math.max(...r.range),
        )
      )
        reasons.push('缺少高级数值范围或数值不在范围内。')
    }
  }
  for (const block of item.blocks) {
    if (['note', 'description', 'modifiers', 'item-level'].includes(block.kind)) continue
    if (!['requirements', 'properties'].includes(block.kind)) {
      reasons.push('包含未验收的区块、孔位或技能。')
      continue
    }
    for (const line of block.lines) {
      if (
        !inspection.englishByLine[line.line] ||
        (block.kind === 'properties' && !/^(?:能量护盾|Energy Shield)\s*[:：]/.test(line.raw))
      )
        reasons.push('包含未完整识别或尚未验收的装备属性。')
    }
  }
  return {
    original,
    english: inspection.exportText,
    ready: reasons.length === 0,
    reasons: [...new Set(reasons)],
  }
}
