import {
  type ItemDictionary,
  inspectItem,
  knownExplicitHeader,
  parseItem,
} from '@poe2-tools/item-core/text'
import type { Term } from '@poe2-tools/l10n-core'

// 开发预览的文本资格边界；逐项端到端证据见兼容性文档，不调用本机制作资格。
const focusStats = new Set([
  'explicit.stat_4052037485',
  'explicit.stat_3291658075',
  'explicit.stat_1050105434',
  'explicit.stat_1671376347',
  'explicit.stat_789117908',
  'explicit.stat_2923486259',
])
// 每个档案仅开放该装备已核对的普通词缀，不跨类别继承法器词缀。
const profiles = [
  {
    base: 'Runed Focus',
    classes: ['法器', 'Foci'],
    stats: focusStats,
    prefixes: new Set([
      'explicit.stat_4052037485',
      'explicit.stat_3291658075',
      'explicit.stat_1050105434',
    ]),
  },
  {
    base: 'Twig Circlet',
    classes: ['头盔', 'Helmets'],
    stats: new Set(['explicit.stat_4052037485', 'explicit.stat_1671376347']),
    prefixes: new Set(['explicit.stat_4052037485']),
  },
]
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
  if (!parsed.ok)
    return {
      original,
      english: '',
      ready: false,
      reasons: [parsed.error],
      issues: [{ line: null as number | null, message: parsed.error }],
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
  const profile = profiles.find(
    (p) => p.base === inspection.base.english && p.classes.includes(item.itemClass),
  )
  const verifiedStats = profile?.stats ?? new Set<string>()
  if (!profile || !['magic', 'rare'].includes(item.rarity))
    add('导入仅支持已验收的符文法器和细枝头冠普通词缀；其余装备仍可对照。')
  if (item.corrupted || item.mirrored || item.unidentified || item.fractured || item.twiceCorrupted)
    add('特殊装备标记尚未验收。')
  if (item.itemLevel === null || item.itemLevel < 1 || item.itemLevel > 100)
    add('物品等级缺失或超出范围。')
  for (const diagnostic of item.diagnostics) add(diagnostic.message, diagnostic.line)
  if (item.nameLines.length !== (item.rarity === 'rare' ? 2 : 1)) add('装备名称区不完整。')
  if (!item.mods.length) add('缺少 Ctrl+Alt+C 高级词缀分组。')
  for (const kind of ['prefix', 'suffix'])
    if (item.mods.filter((m) => m.kind === kind).length > (item.rarity === 'magic' ? 1 : 3))
      add('前后缀数量超出普通装备范围。')
  const seenStats = new Set<string>()
  const prefixStats = profile?.prefixes ?? new Set<string>()
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
      add('复合词缀、特殊来源、缺等阶等结构尚未验收。', mod.header.line)
    for (const { source, resolution } of stats) {
      const identities = [
        ...new Set(
          resolution.candidates
            .filter((c) => c.english === resolution.english && verifiedStats.has(c.id))
            .map((c) => c.id),
        ),
      ]
      if (identities.length !== 1) add('普通属性身份未唯一识别。', source.line)
      for (const id of identities) {
        if (seenStats.has(id)) add('同一普通属性重复出现，不能确认完整导入。', source.line)
        if (mod.kind !== (prefixStats.has(id) ? 'prefix' : 'suffix'))
          add('普通属性与前后缀分组不符。', source.line)
        seenStats.add(id)
      }
      if (
        !resolution.english ||
        !resolution.candidates.some(
          (c) => verifiedStats.has(c.id) && c.english === resolution.english,
        )
      )
        add('存在未识别、歧义或尚未验收的属性。', source.line)
      if (
        source.unscalable ||
        source.states?.length ||
        !source.rolls.length ||
        source.rolls.some(
          (r) => !r.range || r.value < Math.min(...r.range) || r.value > Math.max(...r.range),
        )
      )
        add('缺少高级数值范围或数值不在范围内。', source.line)
    }
  }
  for (const block of item.blocks) {
    if (['note', 'description', 'modifiers', 'item-level'].includes(block.kind)) continue
    if (!['requirements', 'properties'].includes(block.kind)) {
      add('包含未验收的区块、孔位或技能。', block.lines[0]?.line ?? null)
      continue
    }
    for (const line of block.lines) {
      if (
        !inspection.englishByLine[line.line] ||
        (block.kind === 'properties' && !/^(?:能量护盾|Energy Shield)\s*[:：]/.test(line.raw))
      )
        add('包含未完整识别或尚未验收的装备属性。', line.line)
    }
  }
  return {
    original,
    english: inspection.exportText,
    ready: issues.length === 0,
    reasons: issues.map(({ line, message }) =>
      line === null ? message : `第 ${line} 行：${message}`,
    ),
    issues,
  }
}
