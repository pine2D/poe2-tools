import {
  type ItemDictionary,
  inspectItem,
  knownExplicitHeader,
  knownImplicitHeader,
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
const movementSpeedId = 'explicit.stat_2250533757'
const verifiedSpeedTiers = new Map([
  [10, 6],
  [15, 5],
  [20, 4],
  [25, 3],
  [30, 2],
  [35, 1],
])
const focusCompoundPrefix = ['explicit.stat_4015621042', 'explicit.stat_1050105434']
// 每个档案仅开放该装备已核对的普通词缀，不跨类别继承法器词缀。
const implicitTagsByBase: Record<string, ReadonlySet<string>> = {
  'Sapphire Ring': new Set(['元素', '冰霜', '抗性', 'Elemental', 'Cold', 'Resistance']),
  'Jade Amulet': new Set(['属性', 'Attribute']),
}
const profiles = [
  {
    base: 'Jade Amulet',
    emptySockets: 0,
    classes: ['项链', 'Amulets'],
    armour: false,
    implicitStats: new Set(['explicit.stat_3261801346']),
    stats: new Set(['explicit.stat_3261801346', 'explicit.stat_1671376347']),
    prefixes: new Set<string>(),
  },
  {
    base: 'Sapphire Ring',
    emptySockets: 0,
    classes: ['戒指', 'Rings'],
    armour: false,
    implicitStats: new Set(['explicit.stat_4220027924']),
    stats: new Set(['explicit.stat_4220027924']),
    prefixes: new Set<string>(),
  },
  {
    base: 'Runed Focus',
    implicitStats: new Set<string>(),
    armour: true,
    emptySockets: 1,
    classes: ['法器', 'Foci'],
    stats: focusStats,
    prefixes: new Set([
      'explicit.stat_4052037485',
      'explicit.stat_3291658075',
      'explicit.stat_1050105434',
    ]),
  },
  {
    base: 'Silk Robe',
    implicitStats: new Set<string>(),
    armour: true,
    emptySockets: 2,
    classes: ['胸甲', 'Body Armours'],
    stats: new Set(['explicit.stat_4052037485', 'explicit.stat_1671376347']),
    prefixes: new Set(['explicit.stat_4052037485']),
  },
  {
    base: 'Silk Slippers',
    implicitStats: new Set<string>(),
    armour: true,
    emptySockets: 1,
    classes: ['靴子', 'Boots'],
    stats: new Set(['explicit.stat_4052037485', 'explicit.stat_1671376347', movementSpeedId]),
    prefixes: new Set(['explicit.stat_4052037485', movementSpeedId]),
  },
  {
    base: 'Twig Circlet',
    implicitStats: new Set<string>(),
    armour: true,
    emptySockets: 1,
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
  // 新版原站拒绝环锁腰带的咒符固有词缀，移到属性行又会静默丢失；实测见兼容性记录。
  if (inspection.base.english === 'Mail Belt' && ['腰带', 'Belts'].includes(item.itemClass)) {
    for (const { mod, stats } of inspection.mods) {
      if (mod.kind !== 'implicit') continue
      for (const { source, resolution } of stats) {
        if (
          resolution.english &&
          resolution.candidates.length === 1 &&
          resolution.candidates[0]?.id === 'implicit.stat_1416292992'
        )
          add(
            '新版 CoE 暂不能可靠导入该腰带的咒符位：基底词缀形式会报错，改成属性行会丢失数值。请保留对照，不要删行后继续。',
            source.line,
          )
      }
    }
  }
  const profile = profiles.find(
    (p) => p.base === inspection.base.english && p.classes.includes(item.itemClass),
  )
  const verifiedStats = profile?.stats ?? new Set<string>()
  if (!profile || !['normal', 'magic', 'rare'].includes(item.rarity))
    add(
      '导入仅支持已验收的符文法器、细枝头冠、丝质之袍、丝绸便鞋、蓝玉戒指及翠玉项链的指定属性；其余装备仍可对照。',
    )
  if (item.corrupted || item.mirrored || item.unidentified || item.fractured || item.twiceCorrupted)
    add('特殊装备标记尚未验收。')
  if (item.itemLevel === null || item.itemLevel < 1 || item.itemLevel > 100)
    add('物品等级缺失或超出范围。')
  for (const diagnostic of item.diagnostics) add(diagnostic.message, diagnostic.line)
  if (item.nameLines.length !== (item.rarity === 'rare' ? 2 : 1)) add('装备名称区不完整。')
  const explicitMods = item.mods.filter((mod) => mod.kind !== 'implicit')
  const expectedImplicits = profile?.implicitStats.size ?? 0
  if (profile && item.mods.filter((mod) => mod.kind === 'implicit').length !== expectedImplicits)
    add('基底属性数量与已验收结构不符。')
  if (item.rarity === 'normal') {
    if (explicitMods.length) add('普通稀有度与词缀分组不符；普通装备不能包含显式词缀。')
  } else if (!explicitMods.length) add('缺少 Ctrl+Alt+C 高级词缀分组。')
  for (const kind of ['prefix', 'suffix'])
    if (item.mods.filter((m) => m.kind === kind).length > (item.rarity === 'magic' ? 1 : 3))
      add('前后缀数量超出普通装备范围。')
  const seenStats = new Set<string>()
  const prefixStats = profile?.prefixes ?? new Set<string>()
  // 未接入的基底已由范围提示阻止提交，不能用空档案把所有已翻译词缀误报为未识别。
  for (const { mod, stats } of profile ? inspection.mods : []) {
    const implicit = mod.kind === 'implicit'
    // 仅放行原站已核对的两行组合，不能把任意两个普通属性拼成复合词缀。
    const compound =
      profile?.base === 'Runed Focus' &&
      mod.kind === 'prefix' &&
      stats.length === focusCompoundPrefix.length &&
      stats.every(({ resolution }, index) =>
        resolution.candidates.some(
          (c) => c.id === focusCompoundPrefix[index] && c.english === resolution.english,
        ),
      )
    const allowedStats = implicit
      ? (profile?.implicitStats ?? new Set<string>())
      : compound
        ? new Set(focusCompoundPrefix)
        : verifiedStats
    const validHeader = implicit
      ? knownImplicitHeader(mod.header.raw) &&
        mod.tier === null &&
        mod.tags.every((tag) => implicitTagsByBase[profile?.base ?? '']?.has(tag))
      : ['prefix', 'suffix'].includes(mod.kind) &&
        knownExplicitHeader(mod.header.raw) &&
        mod.tier !== null &&
        Number.isInteger(mod.tier) &&
        mod.tier >= 1 &&
        mod.tier <= 99
    if (
      !validHeader ||
      mod.states?.length ||
      mod.magnitude !== undefined ||
      (stats.length !== 1 && !compound)
    )
      add('复合词缀、特殊来源、缺等阶等结构尚未验收。', mod.header.line)
    for (const { source, resolution } of stats) {
      const identities = [
        ...new Set(
          resolution.candidates
            .filter((c) => c.english === resolution.english && allowedStats.has(c.id))
            .map((c) => c.id),
        ),
      ]
      if (identities.length !== 1) add('普通属性身份未唯一识别。', source.line)
      for (const id of identities) {
        // 已验收复合组与普通组可各自贡献魔力，同类组内的重复仍拒绝。
        const origin = implicit ? 'implicit' : compound ? 'focus-hybrid' : 'explicit'
        const identity = `${origin}:${id}`
        if (seenStats.has(identity)) add('同一普通属性重复出现，不能确认完整导入。', source.line)
        if (!implicit && mod.kind !== (compound || prefixStats.has(id) ? 'prefix' : 'suffix'))
          add('普通属性与前后缀分组不符。', source.line)
        seenStats.add(identity)
      }
      if (
        !resolution.english ||
        !resolution.candidates.some(
          (c) => allowedStats.has(c.id) && c.english === resolution.english,
        )
      )
        add('存在未识别、歧义或尚未验收的属性。', source.line)
      const fixedSpeed =
        profile?.base === 'Silk Slippers' &&
        identities.length === 1 &&
        identities[0] === movementSpeedId
      const speedRoll = source.rolls[0]
      const validFixedSpeed =
        fixedSpeed &&
        source.rolls.length === 1 &&
        speedRoll !== undefined &&
        verifiedSpeedTiers.get(speedRoll.value) === mod.tier &&
        (!speedRoll.range || speedRoll.range.every((value) => value === speedRoll.value))
      if (fixedSpeed && !validFixedSpeed)
        add('移动速度的固定数值与等阶不属于已验收组合。', source.line)
      if (
        source.unscalable ||
        source.states?.length ||
        !source.rolls.length ||
        source.rolls.some(
          (r) =>
            (!r.range && !validFixedSpeed) ||
            (r.range && (r.value < Math.min(...r.range) || r.value > Math.max(...r.range))),
        )
      )
        add('缺少高级数值范围或数值不在范围内。', source.line)
    }
  }
  let qualityCount = 0
  let socketLines = 0
  for (const block of item.blocks) {
    if (['note', 'description', 'modifiers', 'item-level'].includes(block.kind)) continue
    if (block.kind === 'sockets') {
      for (const line of block.lines) {
        socketLines++
        const match = /^(?:插槽|Sockets)\s*[:：]\s*(S(?:\s+S)*)$/.exec(line.raw.trim())
        if (
          !match ||
          !inspection.englishByLine[line.line] ||
          socketLines > 1 ||
          (match[1]?.split(/\s+/).length ?? Number.POSITIVE_INFINITY) > (profile?.emptySockets ?? 0)
        )
          add('仅支持该基底已验收数量的单行空 S 插槽；其他孔位结构尚未验收。', line.line)
      }
      continue
    }
    if (!['requirements', 'properties'].includes(block.kind)) {
      add('包含未验收的区块、孔位或技能。', block.lines[0]?.line ?? null)
      continue
    }
    for (const line of block.lines) {
      const quality = block.kind === 'properties' && /^(?:品质|Quality)\s*[:：]/.test(line.raw)
      if (quality) {
        if (!profile?.armour) add('该首饰的品质结构尚未验收。', line.line)
        qualityCount++
        const match = /^(?:品质|Quality)\s*[:：]\s*\+?(\d+)%(?:\s+\(augmented\))?$/.exec(line.raw)
        if (!match || Number(match[1]) > 20 || qualityCount > 1)
          add('普通品质仅支持单条 0–20% 整数；其他品质结构尚未验收。', line.line)
      }
      if (
        !inspection.englishByLine[line.line] ||
        (block.kind === 'properties' &&
          !quality &&
          (!profile?.armour || !/^(?:能量护盾|Energy Shield)\s*[:：]/.test(line.raw)))
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
