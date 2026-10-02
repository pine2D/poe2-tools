import { RUNE_SUFFIX } from './annotations'
import { BONDED_PREFIX } from './bodyIdols'
import { CATALYST_QUALITY_HEADER } from './catalystQuality'
import { flaskTextType } from './flaskText'
import { resolveGrantedSkill } from './grantedSkills'
import { canonicalItemClass } from './itemClasses'
import { hasSpecialModifierSource } from './modifierSource'
import { isKnownWeaponProperty } from './parse'
import { createStatResolver, type Resolution, resolveBase, type StatTemplate } from './resolve'
import type { ItemDocument, ItemMod, ItemStat, SourceLine } from './types'

export interface ItemDictionary {
  items?: { bases: Record<string, string>; uniques: Record<string, string> }
  stats?: { entries: readonly StatTemplate[] }
}

export interface InspectedMod {
  mod: ItemMod
  stats: { source: ItemStat; resolution: Resolution }[]
}

export interface InspectedRune {
  source: SourceLine
  resolution: Resolution
}

export interface InspectedSkill {
  unlevelled?: true
  source: SourceLine
  displayedLevel: number | null
  maxLevel: number | null
  resolution: Resolution
}

export interface ItemInspection {
  base: Resolution
  mods: InspectedMod[]
  runes: InspectedRune[]
  skills: InspectedSkill[]
  comparisonOnly: boolean
  comparisonReason: string | null
  englishByLine: Record<number, string>
  exportText: string
  bridgeText: string | null
  bridgeReasons: string[]
}

const RARITIES = { normal: 'Normal', magic: 'Magic', rare: 'Rare', unique: 'Unique' }

// 普通法器的六类常规词缀；基底与稀有度扩展见 docs/coe-focus-bridge-research.md。
const VERIFIED_FOCI = new Set([
  'Antler Focus',
  'Arrayed Focus',
  'Attuned Focus',
  'Crystal Focus',
  'Cultist Focus',
  'Druidic Focus',
  'Elegant Focus',
  'Engraved Focus',
  'Hallowed Focus',
  'Jingling Focus',
  'Leyline Focus',
  'Magus Focus',
  'Plumed Focus',
  'Runed Focus',
  'Sacred Focus',
  'Staghorn Focus',
  'Tasalian Focus',
  'Tonal Focus',
  'Twig Focus',
  'Voodoo Focus',
  'Whorl Focus',
  'Woven Focus',
  'Wreath Focus',
])
const VERIFIED_STATS = new Set([
  'explicit.stat_4052037485',
  'explicit.stat_3291658075',
  'explicit.stat_1050105434',
  'explicit.stat_1671376347',
  'explicit.stat_789117908',
  'explicit.stat_2923486259',
])

function translateMetadata(raw: string): string | null {
  const text = raw.trim()
  // 复用解析器的严格属性语法，只翻译标题；不计算或归一化原文面板数值。
  if (isKnownWeaponProperty(text)) {
    const weaponLabels: [RegExp, string][] = [
      [/^(?:物理伤害|物理傷害)[:：\s]+/, 'Physical Damage: '],
      [/^(?:火焰伤害|火焰傷害)[:：\s]+/, 'Fire Damage: '],
      [/^(?:冰霜伤害|冰冷傷害)[:：\s]+/, 'Cold Damage: '],
      [/^(?:闪电伤害|閃電傷害)[:：\s]+/, 'Lightning Damage: '],
      [/^(?:混沌伤害|混沌傷害)[:：\s]+/, 'Chaos Damage: '],
      [/^(?:元素伤害|元素傷害)[:：\s]+/, 'Elemental Damage: '],
      [/^(?:暴击率|暴击几率|暴擊率|暴擊機率)[:：\s]+/, 'Critical Hit Chance: '],
      [/^(?:每秒攻击次数|每秒攻擊次數)[:：\s]+/, 'Attacks per Second: '],
      [/^(?:装填时间|重新裝填時間)[:：\s]+/, 'Reload Time: '],
    ]
    for (const [pattern, label] of weaponLabels) {
      if (pattern.test(text)) return text.replace(pattern, label)
    }
    return text
  }
  const labels: [RegExp, string][] = [
    [/^(?:能量护盾|能量護盾)\s*[:：]\s*/, 'Energy Shield: '],
    [/^精魂\s*[:：]\s*/, 'Spirit: '],
    [/^品質\s*[:：]\s*|^品质\s*[:：]\s*/, 'Quality: '],
    [/^(?:插槽|插槽連線)\s*[:：]\s*/, 'Sockets: '],
    [/^(?:物品等级|物品等級)\s*[:：]\s*/, 'Item Level: '],
  ]
  for (const [pattern, label] of labels) {
    if (pattern.test(text)) {
      const rest = text.replace(pattern, '')
      if (/^[\d+.,%\sSABGRW-]+(?:\s*\(augmented\))?$/.test(rest)) return label + rest
    }
  }
  if (/^(?:需求|Requirements|Requires)\s*[:：]/i.test(text)) {
    const value = text
      .replace(/^(?:需求|Requirements|Requires)\s*[:：]\s*/i, '')
      .replace(/等级|等級/g, 'Level')
      .replace(/智慧/g, 'Int')
      .replace(/力量/g, 'Str')
      .replace(/敏捷/g, 'Dex')
    if (/^(?:(?:Level|Int|Str|Dex)|\d+|\s|[,，]|\(unmet\))+$/i.test(value))
      return `Requirements: ${value}`
  }
  if (/^Fractured Item$/i.test(text)) return 'Fractured Item'
  if (/^(?:被腐化|已腐化|腐化|Corrupted)$/i.test(text)) return 'Corrupted'
  if (/^(?:镜像|鏡像|Mirrored)$/i.test(text)) return 'Mirrored'
  if (/^(?:未鉴定|未鑑定|Unidentified)$/i.test(text)) return 'Unidentified'
  if (
    /^(?:Energy Shield|Spirit|Quality|Sockets|Item Level):\s*[\d+.,%\sSABGRW-]+(?:\s*\(augmented\))?$/i.test(
      text,
    )
  )
    return text
  return null
}

function translateHeader(mod: ItemMod): string {
  if (mod.kind === 'implicit' && mod.magnitude === undefined && knownImplicitHeader(mod.header.raw))
    return `{ Implicit Modifier${mod.tags.length ? ` — ${mod.tags.join(', ')}` : ''} }`
  if (mod.kind === 'implicit' || mod.kind === 'unique') {
    if (
      !/^\s*\{\s*(?:基底(?:属性|词缀|屬性|詞綴)|传奇(?:属性|词缀)|傳奇(?:屬性|詞綴)|(?:Implicit|Unique) Modifier)\s*\}\s*$/i.test(
        mod.header.raw,
      )
    )
      return mod.header.raw
    return mod.kind === 'implicit' ? '{ Implicit Modifier }' : '{ Unique Modifier }'
  }
  if (mod.kind !== 'prefix' && mod.kind !== 'suffix') return mod.header.raw
  if (!knownExplicitHeader(mod.header.raw)) return mod.header.raw
  const kind = mod.kind === 'prefix' ? 'Prefix' : 'Suffix'
  const name = mod.name === null ? '' : ` "${mod.name}"`
  const tier = mod.tier === null ? '' : ` (Tier: ${mod.tier})`
  const tags = mod.tags.length === 0 ? '' : ` — ${mod.tags.join(', ')}`
  const magnitude =
    mod.magnitude === undefined
      ? ''
      : ` — ${Math.abs(mod.magnitude)}% ${mod.magnitude < 0 ? 'Reduced' : 'Increased'}`
  return `{ ${kind} Modifier${name}${tier}${tags}${magnitude} }`
}

// 只识别基底头和逗号分隔的标签，不吞掉名称、等阶、额外来源或增效段。
export function knownImplicitHeader(raw: string): boolean {
  const match =
    /^\s*\{\s*(?:基底(?:属性|词缀|屬性|詞綴)|Implicit Modifier)\s*(?:[—–]\s*([^{}\r\n—–]+))?\s*\}\s*$/i.exec(
      raw,
    )
  return (
    !!match &&
    (match[1] === undefined || match[1].split(/[,，]/).every((tag) => tag.trim().length > 0))
  )
}

export function knownExplicitHeader(raw: string): boolean {
  return /^\s*\{\s*(?:前缀(?:属性|词缀)|后缀(?:属性|词缀)|前綴(?:屬性|詞綴)|後綴(?:屬性|詞綴)|(?:Prefix|Suffix) Modifier)\s*["“][^"”{}\r\n]+["”]\s*(?:\((?:等阶|等階|阶级|階級|Tier)\s*[:：]\s*\d+\)\s*)?(?:[—–]\s*[^{}]+)?\s*\}\s*$/i.test(
    raw,
  )
}

function choose(resolution: Resolution, id: string | undefined): Resolution {
  if (id === undefined) return resolution
  const selected = resolution.candidates.find((candidate) => candidate.id === id)
  return selected === undefined ? resolution : { ...resolution, english: selected.english }
}

export function inspectItem(
  item: ItemDocument,
  dictionary: ItemDictionary,
  selections: Record<number, string> = {},
): ItemInspection {
  const base = choose(
    resolveBase(
      item.nameLines.map((line) => line.raw),
      item.rarity,
      dictionary.items?.bases ?? {},
    ),
    selections[item.nameLines.at(-1)?.line ?? -1],
  )
  const flaskType = flaskTextType(item.itemClass)
  const className = flaskType
    ? `${flaskType} Flasks`
    : canonicalItemClass(item.itemClass, item.locale)
  const comparisonReason =
    item.rarity === 'unique'
      ? '传奇装备仅供解析与中英对照，不开放制作。'
      : ['咒符', '護符', 'Charms'].includes(item.itemClass)
        ? '咒符仅供解析与中英对照，不开放制作。'
        : null
  const entries = dictionary.stats?.entries ?? []
  const translate = createStatResolver(
    item.locale === 'en' ? entries.map(({ id, en }) => ({ id, en, text: en })) : entries,
  )
  const englishByLine: Record<number, string> = {}
  const mods = item.mods.map((mod) => {
    englishByLine[mod.header.line] = translateHeader(mod)
    return {
      mod,
      stats: mod.stats.map((source) => {
        const resolution = choose(translate(source.raw), selections[source.line])
        if (resolution.english !== null) englishByLine[source.line] = resolution.english
        return { source, resolution }
      }),
    }
  })
  const bridgeReasons: string[] = []
  const skills = item.blocks
    .filter((block) => block.kind === 'skill')
    .flatMap((block) => block.lines)
    .map((source) => {
      const skill = resolveGrantedSkill(source.raw, entries, item.locale)
      const resolution = choose(skill.resolution, selections[source.line])
      if (resolution.english !== null) englishByLine[source.line] = resolution.english
      return { source, ...skill, resolution }
    })
  const runes = item.blocks
    .filter((block) => block.kind === 'runes')
    .flatMap((block) => block.lines)
    .map((source) => {
      const raw = source.raw.replace(RUNE_SUFFIX, '').trim()
      const bonded = raw.startsWith(BONDED_PREFIX)
      const selected = choose(
        translate(bonded ? raw.slice(BONDED_PREFIX.length) : raw),
        selections[source.line],
      )
      const resolution =
        bonded && selected.english !== null
          ? { ...selected, english: BONDED_PREFIX + selected.english }
          : selected
      if (resolution.english !== null) englishByLine[source.line] = `${resolution.english} (rune)`
      return { source, resolution }
    })
  if (hasSpecialModifierSource(item))
    bridgeReasons.push('已识别特殊词缀来源或破裂物品，其 CoE 转接尚未验证。')
  if (
    item.mods.some((mod) => mod.magnitude !== undefined) ||
    item.blocks.some(
      (block) =>
        block.kind === 'properties' &&
        block.lines.some((line) => CATALYST_QUALITY_HEADER.test(line.raw.trim())),
    )
  )
    bridgeReasons.push('催化品质或属性增效的 CoE 转接尚未验证。')
  if (runes.length > 0) bridgeReasons.push('符文效果的 CoE 转接尚未验证。')
  if (comparisonReason !== null) bridgeReasons.push(comparisonReason)
  if (base.english === null) bridgeReasons.push('基底未唯一识别，不能完整转接。')
  if (
    base.english === null ||
    !VERIFIED_FOCI.has(base.english) ||
    className !== 'Foci' ||
    !['magic', 'rare'].includes(item.rarity)
  ) {
    bridgeReasons.push('转接仅验证23种普通法器的魔法或稀有装备，其他基底与稀有度暂供对照。')
  }
  if (item.corrupted || item.mirrored || item.unidentified)
    bridgeReasons.push('当前特殊状态尚未完成 CoE 转接验证。')
  if (item.itemLevel === null) bridgeReasons.push('缺少物品等级。')
  if (item.mods.length === 0)
    bridgeReasons.push('缺少高级词缀分组，请在游戏内用 Ctrl+Alt+C 重新复制。')
  if (item.diagnostics.length > 0) bridgeReasons.push('原文仍有结构诊断，请先核对。')
  const expectedNames = item.rarity === 'rare' || item.rarity === 'unique' ? 2 : 1
  if (item.nameLines.length !== expectedNames)
    bridgeReasons.push('名称区存在缺失或多余信息，请核对原文。')
  for (const { mod, stats } of mods) {
    if (!knownExplicitHeader(mod.header.raw)) bridgeReasons.push('词缀头包含尚未适配的结构或标记。')
    if (!['prefix', 'suffix'].includes(mod.kind) || mod.tier === null || stats.length !== 1) {
      bridgeReasons.push('存在尚未验证的词缀类型、混合词缀或缺失阶级。')
    }
    for (const { resolution } of stats) {
      if (resolution.english === null) bridgeReasons.push('有属性未识别或存在多个译法。')
      else if (
        !resolution.candidates.some(
          (entry) => VERIFIED_STATS.has(entry.id) && entry.english === resolution.english,
        )
      ) {
        bridgeReasons.push('部分词缀尚未完成 CoE 保真验证。')
      }
    }
  }
  if (
    ['prefix', 'suffix'].some(
      (kind) =>
        item.mods.filter((mod) => mod.kind === kind).length > (item.rarity === 'magic' ? 1 : 3),
    )
  ) {
    bridgeReasons.push(
      item.rarity === 'magic'
        ? '前后缀数量超出魔法法器的一前一后限制。'
        : '前后缀数量超出已验证的普通法器范围。',
    )
  }
  const name = item.nameLines[0]?.raw ?? ''
  const unique =
    item.rarity === 'unique'
      ? resolveBase([name], 'normal', dictionary.items?.uniques ?? {}).english
      : null
  const names = item.nameLines.map((line, index) => {
    if (index === item.nameLines.length - 1) return base.english ?? line.raw
    if (index === 0 && unique !== null) return unique
    return line.raw
  })
  const output = [`Item Class: ${className}`, `Rarity: ${RARITIES[item.rarity]}`, ...names]
  for (const block of item.blocks) {
    if (block.kind === 'note' || block.kind === 'description') continue
    const lines: string[] = []
    for (const line of block.lines) {
      if (isKnownWeaponProperty(line.raw.trim()))
        bridgeReasons.push('武器面板属性的 CoE 转接尚未验证。')
      const translated = englishByLine[line.line] ?? translateMetadata(line.raw)
      if (translated !== null) englishByLine[line.line] = translated
      lines.push(translated ?? line.raw)
      if (translated === null && line.raw.trim() !== '')
        bridgeReasons.push('部分区块尚未完整识别或翻译。')
    }
    if (block.kind === 'skill' || block.kind === 'sockets')
      bridgeReasons.push('授予技能或插槽状态的转接尚未验证。')
    if (lines.length > 0) output.push('--------', ...lines)
  }
  const exportText = output.join('\n')
  if (createCoeUrl(exportText).length > 16000)
    bridgeReasons.push('装备文本过长，请使用复制文本方式。')
  const reasons = [...new Set(bridgeReasons)]
  return {
    base,
    mods,
    runes,
    skills,
    comparisonOnly: comparisonReason !== null,
    comparisonReason,
    englishByLine,
    exportText,
    bridgeText: reasons.length === 0 ? exportText : null,
    bridgeReasons: reasons,
  }
}

export function createCoeUrl(text: string): string {
  return `https://beta.craftofexile.com/?game=poe2&eimport=${encodeURIComponent(text)}`
}
