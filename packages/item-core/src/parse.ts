import { CATALYST_QUALITY_HEADER } from './catalystQuality'
import type {
  ItemBlock,
  ItemDiagnostic,
  ItemDocument,
  ItemLocale,
  ItemMod,
  ItemStat,
  ModKind,
  ParseItemResult,
  SourceLine,
} from './types.js'

const MAX_INPUT_LENGTH = 200_000
const SEPARATOR = /^-{4,}$/
const MOD_HEADER = /^\s*\{.*\}\s*$/
// 公开三服物品说明的精确文本；仅在珠宝的独立区块内分类，未知尾行继续保留诊断。
const JEWEL_USAGE_LINES = new Set([
  'Place into an allocated Jewel Socket on the Passive Skill Tree. Right click to remove from the Socket.',
  '放置到一个天赋树的珠宝插槽中以产生效果。右键点击以移出插槽。',
  '放置到一個天賦樹的珠寶插槽中以產生效果。右鍵點擊以移出插槽。',
])
// 中文标题是工具支持语法，实际客户端标题仍待真机验收；这里只分类，不推导范围。
export const CHARM_SLOTS_PROPERTY_HEADER = /^(?:Charm Slots|咒符栏|護符欄位)\s*[:：]/i
export const CHARM_SLOTS_PROPERTY =
  /^(?:Charm Slots|咒符栏|護符欄位)\s*[:：]\s*(\d+)(?:\s+\(augmented\))?$/i

const LABELS = {
  itemClass: /^(?:物品类别|物品種類|Item Class)\s*:\s*(.+)$/i,
  rarity: /^(?:稀有度|Rarity)\s*:\s*(.+)$/i,
  itemLevel: /^(?:物品等级|物品等級|Item Level)\s*[:：]\s*(\d+)\s*$/i,
  properties: /^(?:属性|屬性|Properties)\s*[:：]/i,
  requirements: /^(?:需求|Requirements|Requires)\s*[:：]/i,
  sockets: /^(?:插槽|插槽連線|Sockets)\s*[:：]/i,
  skill: /^(?:授予技能|賦予技能|获得技能|獲得技能|Grants Skill)\s*[:：]/i,
  note: /^(?:备注|備註|Note)\s*[:：]/i,
  description: /^(?:描述|Description)\s*[:：]/i,
}

const FLAG_PATTERNS = {
  fractured: FRACTURED_ITEM,
  corrupted: /^(?:已腐化|被腐化|腐化|Corrupted)$/i,
  mirrored: /^(?:镜像|鏡像|Mirrored)$/i,
  unidentified: /^(?:未鉴定|未鑑定|Unidentified)$/i,
}

type ItemFlag = keyof typeof FLAG_PATTERNS

function itemFlag(text: string): ItemFlag | null {
  for (const [flag, pattern] of Object.entries(FLAG_PATTERNS) as [ItemFlag, RegExp][]) {
    if (pattern.test(text)) return flag
  }
  return null
}

/** 导出端共用解析器结构规则，避免属性行逃逸分组或改变装备状态。 */
export function isItemStructureLine(raw: string): boolean {
  const text = raw.trim()
  return (
    SEPARATOR.test(text) ||
    MOD_HEADER.test(text) ||
    itemFlag(text) !== null ||
    isKnownProperty(text, '') ||
    Object.values(LABELS).some((pattern) => pattern.test(text))
  )
}

// 武器原文面板仅分类保存，绝不以这里的数字参与本地面板计算。
const WEAPON_NUMBER = String.raw`\d+(?:\.\d+)?`
const WEAPON_AUGMENTED = String.raw`(?:\s+\(augmented\))?`
const WEAPON_RANGE = String.raw`${WEAPON_NUMBER}\s*[-–—]\s*${WEAPON_NUMBER}${WEAPON_AUGMENTED}`
const WEAPON_PROPERTIES = [
  new RegExp(
    String.raw`^(?:Physical Damage|物理伤害|物理傷害|Fire Damage|火焰伤害|火焰傷害|Cold Damage|冰霜伤害|冰冷傷害|Lightning Damage|闪电伤害|閃電傷害|Chaos Damage|混沌伤害|混沌傷害)\s*[:：]\s*${WEAPON_RANGE}$`,
    'i',
  ),
  new RegExp(
    String.raw`^(?:Elemental Damage|元素伤害|元素傷害)\s*[:：]\s*${WEAPON_RANGE}(?:\s*[,，]\s*${WEAPON_RANGE}){0,2}$`,
    'i',
  ),
  new RegExp(
    String.raw`^(?:Critical Hit Chance|Critical Strike Chance|暴击率|暴击几率|暴擊率|暴擊機率)\s*[:：]\s*${WEAPON_NUMBER}%${WEAPON_AUGMENTED}$`,
    'i',
  ),
  new RegExp(
    String.raw`^(?:Attacks per Second|每秒攻击次数|每秒攻擊次數|Reload Time|装填时间|重新裝填時間)\s*[:：]\s*${WEAPON_NUMBER}${WEAPON_AUGMENTED}$`,
    'i',
  ),
]

function isKnownProperty(text: string, itemClass: string): boolean {
  if (CATALYST_QUALITY_HEADER.test(text)) return true
  if (
    (itemClass === '' || /^(?:Belt|Belts|腰带|腰帶)$/i.test(itemClass)) &&
    CHARM_SLOTS_PROPERTY.test(text)
  )
    return true
  if (WEAPON_PROPERTIES.some((pattern) => pattern.test(text))) return true
  const numericValue = String.raw`[+-]?\d+(?:\.\d+)?(?:\([+-]?\d+(?:\.\d+)?-[+-]?\d+(?:\.\d+)?\))?`
  const standardProperty = new RegExp(
    String.raw`^(?:品质|品質|Quality|护甲|護甲|Armour|闪避值|閃避值|Evasion Rating|能量护盾|能量護盾|精魂|护盾|護盾|Energy Shield|Spirit)\s*[:：]\s*${numericValue}%?(?:\s+\(augmented\))?$`,
    'i',
  )
  if (standardProperty.test(text)) return true

  if (!/^(?:咒符|咒符|Charm|Charms)$/i.test(itemClass)) return false
  return (
    new RegExp(String.raw`^持续\s+${numericValue}\s+秒$`).test(text) ||
    new RegExp(
      String.raw`^每次使用会从\s+${numericValue}\s+充能次数中消耗\s+${numericValue}(?:\s+\(augmented\))?\s+次$`,
    ).test(text) ||
    new RegExp(String.raw`^目前有\s+${numericValue}\s+充能次数$`).test(text) ||
    /^免疫\S+$/.test(text)
  )
}

function sourceLine(raw: string, index: number): SourceLine {
  return { raw, line: index + 1 }
}

function localeFromLabel(label: string): ItemLocale {
  if (label.startsWith('物品種類')) return 'zh-TW'
  if (label.startsWith('物品类别')) return 'zh-CN'
  return 'en'
}

function parseRarity(value: string): ItemDocument['rarity'] | null {
  const normalized = value.trim().toLowerCase()
  if (['普通', '正常', 'normal'].includes(normalized)) return 'normal'
  if (['魔法', 'magic'].includes(normalized)) return 'magic'
  if (['稀有', 'rare'].includes(normalized)) return 'rare'
  if (['传奇', '傳奇', 'unique'].includes(normalized)) return 'unique'
  return null
}

function modKind(header: string): ModKind {
  if (/(?:前缀(?:词缀|属性)|前綴(?:詞綴|屬性)|Prefix Modifier)/i.test(header)) return 'prefix'
  if (/(?:后缀(?:词缀|属性)|後綴(?:詞綴|屬性)|Suffix Modifier)/i.test(header)) return 'suffix'
  if (/(?:基底(?:词缀|属性)|基底(?:詞綴|屬性)|Implicit Modifier)/i.test(header)) return 'implicit'
  if (
    /(?:腐化强化(?:词缀)?|腐化強化(?:詞綴)?|附魔(?:词缀|属性)|附魔(?:詞綴|屬性)|Enchant Modifier)/i.test(
      header,
    )
  )
    return 'enchant'
  if (/(?:传奇(?:词缀|属性)|傳奇(?:詞綴|屬性)|Unique Modifier)/i.test(header)) return 'unique'
  return 'unknown'
}

function parseModHeader(line: SourceLine, diagnostics: ItemDiagnostic[]): ItemMod {
  const kind = modKind(line.raw)
  const named = line.raw.match(/[“"]([^”"]+)[”"]/)
  const name = named?.[1] ?? null
  // 阶级只来自名称后、标签前的独立段，名称和标签中的 Tier 字样仍是字面文本。
  const tierText = named
    ? line.raw
        .slice((named.index ?? 0) + named[0].length)
        .match(
          /^\s*\((?:阶级|階級|等阶|等階|Tier)\s*[:：]\s*(\d+)\)\s*(?:[—–]\s*[^{}]+)?\s*\}\s*$/i,
        )?.[1]
    : undefined
  const magnitude = line.raw.match(/[—–]\s*(\d+)%\s+(Increased|Reduced)\s*}\s*$/i)
  const header = magnitude ? `${line.raw.slice(0, magnitude.index)}}` : line.raw
  const tagText = header.match(/[—–]\s*([^}]+?)\s*}\s*$/)?.[1]

  if (kind === 'unknown') {
    diagnostics.push({ code: 'unknown-mod-header', message: '无法识别词缀属性头', line: line.line })
  }

  const states = readHeaderStates(line.raw)
  return {
    ...(magnitude
      ? { magnitude: Number(magnitude[1]) * (magnitude[2]?.toLowerCase() === 'reduced' ? -1 : 1) }
      : {}),
    ...(states.length ? { states } : {}),
    kind,
    name,
    tier: tierText === undefined ? null : Number(tierText),
    tags:
      tagText === undefined
        ? []
        : tagText
            .split(/[,，]/)
            .map((tag) => tag.trim())
            .filter(Boolean),
    header: line,
    stats: [],
  }
}

function parseStat(line: SourceLine, diagnostics: ItemDiagnostic[]): ItemStat {
  const { text: annotatedText, states, unscalable } = readStatAnnotations(line.raw)
  let text = annotatedText

  const rolls: ItemStat['rolls'] = []
  const rollPattern =
    /([+-]?\d+(?:\.\d+)?)(?:\s*\(\s*([+-]?\d+(?:\.\d+)?)(?:\s*[-–—]\s*([+-]?\d+(?:\.\d+)?))?\s*\))?/g
  text = text.replace(
    rollPattern,
    (_match, value: string, minimum: string | undefined, maximum: string | undefined) => {
      rolls.push({
        value: Number(value),
        range:
          minimum === undefined || maximum === undefined
            ? null
            : [Number(minimum), Number(maximum)],
        ...(minimum !== undefined && maximum === undefined ? { baseValue: Number(minimum) } : {}),
      })
      return value
    },
  )

  const asciiOpen = (text.match(/\(/g) ?? []).length
  const asciiClose = (text.match(/\)/g) ?? []).length
  const fullOpen = (text.match(/（/g) ?? []).length
  const fullClose = (text.match(/）/g) ?? []).length
  if (asciiOpen !== asciiClose || fullOpen !== fullClose) {
    diagnostics.push({
      code: 'incomplete-roll-range',
      message: '属性数值范围括号不完整',
      line: line.line,
    })
  }

  return { ...line, text: text.trim(), rolls, unscalable, ...(states.length ? { states } : {}) }
}

function appendBlock(blocks: ItemBlock[], kind: ItemBlock['kind'], line: SourceLine): void {
  const previous = blocks.at(-1)
  if (previous?.kind === kind) {
    previous.lines.push(line)
  } else {
    blocks.push({ kind, lines: [line] })
  }
}

export function parseItem(text: string): ParseItemResult {
  if (text.length > MAX_INPUT_LENGTH) {
    return { ok: false, error: '装备文本超过 200000 字符限制' }
  }

  const rawLines = text.split(/\r?\n/)
  const classIndex = rawLines.findIndex((line) => LABELS.itemClass.test(line))
  const rarityIndex = rawLines.findIndex((line) => LABELS.rarity.test(line))
  if (classIndex < 0 || rarityIndex < 0) return { ok: false, error: '无法识别装备文本' }

  const classMatch = rawLines[classIndex]?.match(LABELS.itemClass)
  const rarityMatch = rawLines[rarityIndex]?.match(LABELS.rarity)
  const rarity = rarityMatch?.[1] === undefined ? null : parseRarity(rarityMatch[1])
  if (classMatch?.[1] === undefined || rarity === null)
    return { ok: false, error: '无法识别装备文本' }

  const locale = localeFromLabel(rawLines[classIndex] ?? '')
  const diagnostics: ItemDiagnostic[] = []
  const blocks: ItemBlock[] = []
  const mods: ItemMod[] = []
  const nameLines: SourceLine[] = []
  let itemLevel: number | null = null
  let fractured = false
  let corrupted = false
  let mirrored = false
  let unidentified = false
  let currentSection: ItemBlock['kind'] | null = null
  let currentMod: ItemMod | null = null

  const closeCurrentMod = (): void => {
    if (currentMod?.stats.length === 0) {
      diagnostics.push({
        code: 'empty-mod-group',
        message: '词缀属性头下没有属性行',
        line: currentMod.header.line,
      })
    }
    currentMod = null
  }

  const preserveFlag = (line: SourceLine): boolean => {
    const flag = itemFlag(line.raw.trim())
    if (flag === null) return false
    if (flag === 'fractured') fractured = true
    if (flag === 'corrupted') corrupted = true
    if (flag === 'mirrored') mirrored = true
    if (flag === 'unidentified') unidentified = true
    closeCurrentMod()
    currentSection = null
    appendBlock(blocks, 'flags', line)
    return true
  }

  const identityEnd = Math.max(classIndex, rarityIndex)
  const firstSeparator = rawLines.findIndex(
    (line, index) => index > identityEnd && SEPARATOR.test(line.trim()),
  )
  const nameEnd = firstSeparator < 0 ? rawLines.length : firstSeparator
  for (let index = 0; index <= identityEnd; index += 1) {
    if (index === classIndex || index === rarityIndex) continue
    const raw = rawLines[index] ?? ''
    if (!raw.trim()) continue
    const line = sourceLine(raw, index)
    if (preserveFlag(line)) continue

    appendBlock(blocks, 'unknown', line)
    diagnostics.push({ code: 'unknown-line', message: '无法分类的原文已保留', line: line.line })
  }
  for (let index = identityEnd + 1; index < nameEnd; index += 1) {
    const raw = rawLines[index] ?? ''
    if (!raw.trim()) continue
    const line = sourceLine(raw, index)
    if (!preserveFlag(line)) nameLines.push(line)
  }

  for (
    let index = firstSeparator < 0 ? rawLines.length : firstSeparator + 1;
    index < rawLines.length;
    index += 1
  ) {
    const raw = rawLines[index] ?? ''
    const trimmed = raw.trim()
    if (!trimmed) continue
    if (SEPARATOR.test(trimmed)) {
      closeCurrentMod()
      currentSection = null
      continue
    }

    const line = sourceLine(raw, index)
    if (MOD_HEADER.test(trimmed)) {
      closeCurrentMod()
      currentMod = parseModHeader(line, diagnostics)
      mods.push(currentMod)
      appendBlock(blocks, 'modifiers', line)
      currentSection = null
      continue
    }

    const itemLevelMatch = trimmed.match(LABELS.itemLevel)
    if (itemLevelMatch?.[1] !== undefined) {
      if (itemLevel === null) itemLevel = Number(itemLevelMatch[1])
      else
        diagnostics.push({
          code: 'duplicate-item-level',
          message: '发现重复的物品等级',
          line: line.line,
        })
      appendBlock(blocks, 'item-level', line)
      closeCurrentMod()
      currentSection = null
      continue
    }

    if (LABELS.properties.test(trimmed)) {
      currentSection = 'properties'
      closeCurrentMod()
      appendBlock(blocks, currentSection, line)
      continue
    }
    if (currentMod === null && isKnownProperty(trimmed, classMatch[1])) {
      currentSection = null
      closeCurrentMod()
      appendBlock(blocks, 'properties', line)
      continue
    }
    if (LABELS.requirements.test(trimmed)) {
      currentSection = 'requirements'
      closeCurrentMod()
      appendBlock(blocks, currentSection, line)
      continue
    }
    if (LABELS.description.test(trimmed)) {
      currentSection = 'description'
      closeCurrentMod()
      appendBlock(blocks, currentSection, line)
      continue
    }
    if (LABELS.sockets.test(trimmed)) {
      currentSection = null
      closeCurrentMod()
      appendBlock(blocks, 'sockets', line)
      continue
    }
    if (LABELS.skill.test(trimmed)) {
      currentSection = null
      closeCurrentMod()
      appendBlock(blocks, 'skill', line)
      continue
    }
    if (LABELS.note.test(trimmed)) {
      currentSection = null
      closeCurrentMod()
      appendBlock(blocks, 'note', line)
      continue
    }

    if (preserveFlag(line)) continue

    if (
      currentMod === null &&
      currentSection === null &&
      ['Jewel', 'Jewels', '珠宝', '珠寶'].includes(classMatch[1]) &&
      JEWEL_USAGE_LINES.has(trimmed)
    ) {
      appendBlock(blocks, 'description', line)
      continue
    }

    if (currentMod === null && currentSection === null && RUNE_SUFFIX.test(trimmed)) {
      appendBlock(blocks, 'runes', line)
      continue
    }

    if (currentMod === null && currentSection === null && /^[“"]/.test(trimmed)) {
      currentSection = /[”"]$/.test(trimmed) && trimmed.length > 1 ? null : 'description'
      closeCurrentMod()
      appendBlock(blocks, 'description', line)
      continue
    }

    if (currentMod !== null) {
      const stat = parseStat(line, diagnostics)
      currentMod.stats.push(stat)
      if (stat.states?.length)
        currentMod.states = [...new Set([...(currentMod.states ?? []), ...stat.states])]
      appendBlock(blocks, 'modifiers', line)
      if (currentMod.kind === 'unknown') {
        diagnostics.push({
          code: 'unknown-line',
          message: '未知词缀组中的原文已保留',
          line: line.line,
        })
      }
      continue
    }
    if (currentSection !== null) {
      appendBlock(blocks, currentSection, line)
      if (currentSection === 'description' && /[”"]$/.test(trimmed)) currentSection = null
      continue
    }

    appendBlock(blocks, 'unknown', line)
    diagnostics.push({ code: 'unknown-line', message: '无法分类的原文已保留', line: line.line })
  }

  closeCurrentMod()
  if (itemLevel === null)
    diagnostics.push({ code: 'missing-item-level', message: '未找到物品等级', line: null })

  return {
    ok: true,
    item: {
      schemaVersion: 1,
      rawText: text,
      locale,
      itemClass: classMatch[1].trim(),
      rarity,
      nameLines,
      itemLevel,
      blocks,
      mods,
      ...(fractured ? { fractured: true as const } : {}),
      corrupted,
      mirrored,
      unidentified,
      diagnostics,
    },
  }
}

import { FRACTURED_ITEM, RUNE_SUFFIX, readHeaderStates, readStatAnnotations } from './annotations'
