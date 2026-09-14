import type { CraftCatalog } from './catalog'
import { matchesCatalogLines } from './catalogMatch'
import { CATALYSTS } from './catalystQuality'
import { createItemTextLocalization } from './craftItemTextLocalization'
import type { ItemDictionary } from './export'
import { readUnlevelledSkillName } from './grantedSkills'
import { jewelEffectForKind, usesJewelEffect } from './jewelEffects'
import { inspectNumericLines } from './numeric'
import { isItemStructureLine } from './parse'
import { type CraftResult, type CraftState, createCraftState } from './rehearsal'
import { socketEffects } from './sockets'
import { splitStatScalars } from './statScalability'
import type { ItemLocale } from './types'

export interface CraftItemTextExport {
  text: string
  warnings: string[]
}

export interface CraftItemTextOptions {
  locale?: ItemLocale
  dictionary?: ItemDictionary
}

const CLASSES: Readonly<Record<string, string>> = {
  Jewel: 'Jewels',
  Focus: 'Foci',
  Sceptre: 'Sceptres',
  Staff: 'Staves',
}
const RARITIES = { normal: 'Normal', magic: 'Magic', rare: 'Rare' }
const NOTE =
  'Note: Simulated item from PoE2 Tools. Use the .craft.json project to restore the full crafting state.'

/** 增效出口补齐已核对的基础范围；不改变实际值、固定括号或来源尾注。 */
function completeBaseRanges(patterns: readonly string[], line: string): CraftResult<string> {
  const candidates = patterns.filter((pattern) => matchesCatalogLines([pattern], [line]))
  const pattern = candidates[0]
  if (candidates.length !== 1 || pattern === undefined)
    return { ok: false, error: '增效出口无法唯一对应基础属性范围。' }
  const ranges = inspectNumericLines([pattern])
  if (!ranges.ok) return ranges
  const scalars = splitStatScalars(pattern).tokens
  const number = '[+-]?\\d+(?:\\.\\d+)?'
  const token = new RegExp(
    `[+-]?\\(${number}[-–—]${number}\\)|${number}(?:\\(${number}(?:[-–—]${number})?\\))?`,
    'g',
  )
  let scalarIndex = 0
  let rangeIndex = 0
  return {
    ok: true,
    value: line.replace(token, (actual) => {
      const scalar = scalars[scalarIndex++]
      if (!scalar?.text.includes('(')) return actual
      const range = ranges.value[rangeIndex++]
      return range && !actual.includes('(') ? `${actual}(${range.min}-${range.max})` : actual
    }),
  }
}
const LABELS = {
  en: {
    itemClass: 'Item Class',
    rarity: 'Rarity',
    itemLevel: 'Item Level',
    quality: 'Quality',
    sockets: 'Sockets',
    implicit: 'Implicit Modifier',
    prefix: 'Prefix Modifier',
    suffix: 'Suffix Modifier',
    simulation: 'Crafting Simulation',
    rarities: RARITIES,
    note: NOTE,
  },
  'zh-CN': {
    itemClass: '物品类别',
    rarity: '稀有度',
    itemLevel: '物品等级',
    quality: '品质',
    sockets: '插槽',
    implicit: '基底属性',
    prefix: '前缀属性',
    suffix: '后缀属性',
    simulation: '制作演练',
    rarities: { normal: '普通', magic: '魔法', rare: '稀有' },
    note: '备注: PoE2 Tools 制作演练物品。请使用 .craft.json 项目恢复完整制作状态。',
  },
  'zh-TW': {
    itemClass: '物品種類',
    rarity: '稀有度',
    itemLevel: '物品等級',
    quality: '品質',
    sockets: '插槽',
    implicit: '基底屬性',
    prefix: '前綴屬性',
    suffix: '後綴屬性',
    simulation: '製作演練',
    rarities: { normal: '普通', magic: '魔法', rare: '稀有' },
    note: '備註: PoE2 Tools 製作演練物品。請使用 .craft.json 專案還原完整製作狀態。',
  },
}

/** 仅消费当前已应用状态；来源文本与旧符文效果不参与输出。 */
export function exportCraftItemText(
  catalog: CraftCatalog,
  state: CraftState,
  options: CraftItemTextOptions = {},
): CraftResult<CraftItemTextExport> {
  if (Object.hasOwn(state, 'pendingDesecration'))
    return { ok: false, error: '待揭示亵渎不能导出装备文本，请保存项目以保留隐藏状态。' }
  const checked = createCraftState(catalog, state)
  if (!checked.ok) return checked
  if (
    !options ||
    typeof options !== 'object' ||
    Array.isArray(options) ||
    (options.locale !== undefined && !['en', 'zh-CN', 'zh-TW'].includes(options.locale))
  )
    return { ok: false, error: '装备文本语言选项无效。' }
  const locale = options.locale ?? 'en'
  const labels = LABELS[locale]
  const current = checked.value
  const hasJewelEffect = usesJewelEffect(catalog, current)
  const base = catalog.bases.find((entry) => entry.id === current.baseId)
  if (!base) return { ok: false, error: '当前基底不在制作目录中。' }
  const implicit = current.implicitLines ?? base.implicit?.split('\n') ?? []
  const modifiers = current.affixes.map((affix) => ({
    affix,
    mod: catalog.modifiers.find((entry) => entry.id === affix.modId),
  }))
  const runes = socketEffects(catalog, current).map(({ augment }) => augment)
  const runeLines = runes.flatMap((rune) => rune.lines)
  const names = [
    base.name,
    base.type,
    ...modifiers.flatMap(({ affix, mod }) =>
      mod
        ? [...(mod.name === '' && mod.craftedOnly && affix.crafted ? [] : [mod.name]), ...mod.tags]
        : [],
    ),
  ]
  const lines = [...implicit, ...current.affixes.flatMap((affix) => affix.lines), ...runeLines]
  // 不删除字符修补目录：结构字符会改变高级分组，必须明确拒绝。
  if (
    names.some(
      (name) => !name.trim() || /[\r\n\u2028\u2029{}"“”]/u.test(name) || isItemStructureLine(name),
    ) ||
    lines.some((line) => !line.trim() || /[\r\n\u2028\u2029{}]/u.test(line)) ||
    [...current.affixes.flatMap((affix) => affix.lines), ...runeLines].some(isItemStructureLine) ||
    implicit.some((line) => isItemStructureLine(line) && !/^Grants Skill\s*:/i.test(line))
  )
    return { ok: false, error: '名称、标签或属性行包含不支持的装备文本结构字符。' }
  const warnings = [
    `这是演练${locale === 'en' ? '英文' : '中文'}文本，未写入推算攻击/防御面板、穿戴需求或目录未提供的 Tier；不保证游戏或 CoE 全类别兼容。`,
    '文本不保存完整孔位身份、孔序和演练历史；S 只表示孔数，再导入须核对孔位，完整恢复请使用 .craft.json 项目。',
  ]
  if (locale !== 'en')
    warnings.push('类别值、词缀名称和标签保留目录英文；缺失、多义或不可逆译文保留原文并逐行说明。')
  const localize = createItemTextLocalization(locale, options.dictionary, warnings)
  if (current.quality === undefined && current.catalyst === undefined)
    warnings.push('品质未知，文本未输出 Quality。')
  if (current.catalyst && locale !== 'en')
    warnings.push('催化品质标题保留已核对英文；属性输出为高级基础值，不重复写入增效数值。')
  if (hasJewelEffect)
    warnings.push(
      '珠宝增效属性输出为演练高级基础值；英文百分比标题包含侧别增效与命中催化品质，国服原生标题仍待样本验收。',
    )
  if (current.sockets === undefined) warnings.push('孔位未知，文本未假设为空孔。')
  if (current.sockets?.length === 0)
    warnings.push('当前已知为零孔，文本省略 Sockets 行；再导入须重新核对零孔。')
  if (lines.some((line) => /(?<![\d.])\([+-]?\d+(?:\.\d+)?[-–—][+-]?\d+(?:\.\d+)?\)/u.test(line)))
    warnings.push('部分属性仍是未定值范围，已原样保留，未自动选择实际数值。')
  if (
    implicit.some(
      (line) =>
        /^Grants Skill\s*:/i.test(line) &&
        !/^Grants Skill: Level \d+ /.test(line) &&
        readUnlevelledSkillName(line, 'en') === null,
    )
  )
    warnings.push(
      '授予技能等级未明确，已原样保留；当前回读不支持此技能核验，完整状态请使用项目保存。',
    )
  const output = [
    `${labels.itemClass}: ${CLASSES[base.type] ?? base.type}`,
    `${labels.rarity}: ${labels.rarities[current.rarity]}`,
    ...(current.rarity === 'rare' ? [labels.simulation] : []),
    localize.base(base.name, current.rarity),
  ]
  const block = (values: string[]) => {
    if (values.length) output.push('--------', ...values)
  }
  if (current.quality !== undefined) block([`${labels.quality}: +${current.quality}%`])
  if (current.catalyst) {
    const definition = CATALYSTS.find((entry) => entry.id === current.catalyst?.id)
    if (!definition) return { ok: false, error: '未知催化品质类型。' }
    block([`Quality (${definition.descriptor} Modifiers): +${current.catalyst.quality}%`])
  }
  block([`${labels.itemLevel}: ${current.itemLevel}`])
  if (current.sockets?.length)
    block([`${labels.sockets}: ${current.sockets.map(() => 'S').join(' ')}`])
  const ordinary = implicit.filter((line) => !/^Grants Skill\s*:/i.test(line))
  if (ordinary.length)
    block([`{ ${labels.implicit} }`, ...ordinary.map((line) => localize.line(line))])
  block(implicit.filter((line) => /^Grants Skill\s*:/i.test(line)).map(localize.skill))
  block(
    runes.flatMap((rune) =>
      rune.lines.map((line) => `${localize.line(line, Object.keys(rune.tradeHashes))} (rune)`),
    ),
  )
  for (const { affix, mod } of modifiers) {
    if (!mod) return { ok: false, error: '当前词缀不在制作目录中。' }
    const tags = mod.tags.length ? ` — ${mod.tags.join(', ')}` : ''
    const name = mod.name === '' && mod.craftedOnly && affix.crafted ? '' : ` "${mod.name}"`
    let magnitude = ''
    const outputLines: string[] = []
    for (const line of affix.lines) {
      const complete = hasJewelEffect
        ? completeBaseRanges(mod.lines, line)
        : { ok: true as const, value: line }
      if (!complete.ok) return complete
      outputLines.push(complete.value)
    }
    if (hasJewelEffect) {
      const effect = jewelEffectForKind(catalog, current, mod.kind)
      if (!effect.ok) return effect
      const definition = CATALYSTS.find((entry) => entry.id === current.catalyst?.id)
      const quality =
        definition && mod.tags.some((tag) => (definition.tags as readonly string[]).includes(tag))
          ? (current.catalyst?.quality ?? 0)
          : 0
      if (effect.value + quality > 0) magnitude = ` — ${effect.value + quality}% Increased`
    }
    block([
      `{ ${mod.kind === 'prefix' ? labels.prefix : labels.suffix}${name}${tags}${magnitude} }`,
      ...outputLines.map(
        (line) =>
          `${localize.line(line, Object.keys(mod.tradeHashes))}${affix.crafted ? ' (crafted)' : ''}${affix.fractured ? ' (fractured)' : ''}${affix.desecrated ? ' (desecrated)' : ''}`,
      ),
    ])
  }
  if (current.affixes.some((affix) => affix.fractured)) block(['Fractured Item'])
  if (current.corrupted)
    block([locale === 'zh-CN' ? '被腐化' : locale === 'zh-TW' ? '已腐化' : 'Corrupted'])
  block([labels.note])
  return { ok: true, value: { text: output.join('\n'), warnings: [...new Set(warnings)] } }
}
