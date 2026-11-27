// 跨存档只使用已回放的装备字段。实例号和显示顺序属于各自的制作历史。
import { readStatAnnotations } from './annotations'
import {
  canonicalBeltSlot,
  isBeltCapacityBase,
  resolveCraftImplicitPatterns,
} from './beltImplicits'
import type { CraftCatalog } from './catalog'
import { readCatalogLineValues } from './catalogMatch'
import { CATALYST_QUALITY_HEADER } from './catalystQuality'
import { corruptionEntries } from './corruptionEnchantments'
import { equivalentProjectJSON } from './craftProjectJSON'
import type { TargetCraftProject } from './craftProjectTargets'
import { translateMetadata } from './export'
import { matchesGrantedSkillImplicitLines } from './grantedSkills'
import { JEWEL_RADIUS_HEADER } from './jewelRadius'
import { uniqueMapping } from './lineMapping'
import { CHARM_SLOTS_PROPERTY, parseItem } from './parse'
import { readCraftGrantedSkillLevel } from './perfectFlux'
import type { CraftResult, CraftState } from './rehearsal'
import { readCraftGrantedSkillSockets } from './skillSockets'

export interface ComparisonLine {
  pattern: string
  values: (number | null)[]
  unscalable: boolean
}

function sorted<T>(entries: T[]): T[] {
  return entries.sort((a, b) => {
    const left = JSON.stringify(a)
    const right = JSON.stringify(b)
    return left < right ? -1 : left > right ? 1 : 0
  })
}

function equipmentLines(patterns: string[], actual: string[]): CraftResult<ComparisonLine[]> {
  const error = '属性行无法唯一对应目录，无法可靠核对两件装备的数值。'
  if (patterns.length !== actual.length) return { ok: false, error }
  const candidates = actual.map((raw) => {
    const { text, unscalable } = readStatAnnotations(raw)
    return patterns.map((pattern): ComparisonLine | null => {
      // 已核对的技能行同时记录角色显示级与装备上限，不能按一般掷值解析。
      if (
        pattern.startsWith('Grants Skill:') &&
        matchesGrantedSkillImplicitLines([pattern], [text])
      )
        return { pattern: text.trim(), values: [], unscalable }
      const values = readCatalogLineValues([pattern], [text])?.[0]
      return values ? { pattern, values, unscalable } : null
    })
  })
  const edges = candidates.map((row) => row.flatMap((match, i) => (match ? [i] : [])))
  // 相同模板的多条观察可互换位置。不同模板即使范围重叠，也要求整组能唯一对应。
  const ambiguous = new Set(
    edges.flatMap((indexes, i) =>
      new Set(indexes.map((index) => patterns[index])).size > 1 ? [i] : [],
    ),
  )
  const order = uniqueMapping(edges, ambiguous)
  if (!order) return { ok: false, error }
  const lines = order.flatMap((column, row) => candidates[row]?.[column] ?? [])
  return { ok: true, value: sorted(lines) }
}

export interface ComparisonAffix {
  modId: string
  lines: ComparisonLine[]
  fractured: boolean
  crafted: boolean
  desecrated: boolean
}

export function projectEquipment(catalog: CraftCatalog, state: CraftState) {
  const base = catalog.bases.find((entry) => entry.id === state.baseId)
  if (!base) return { ok: false as const, error: '装备基底不在当前目录中。' }
  const patterns = resolveCraftImplicitPatterns(base, state)
  if (!patterns.ok) return patterns
  const implicit = equipmentLines(
    patterns.value.patterns,
    (state.implicitLines ?? patterns.value.patterns).map((line, i) =>
      patterns.value.charm?.lineIndex === i ? canonicalBeltSlot(line) : line,
    ),
  )
  if (!implicit.ok) return implicit
  const affixes: ComparisonAffix[] = []
  for (const affix of state.affixes) {
    const mod = catalog.modifiers.find((entry) => entry.id === affix.modId)
    if (!mod) return { ok: false as const, error: '装备词缀不在当前目录中。' }
    const lines = equipmentLines(mod.lines, affix.lines)
    if (!lines.ok) return lines
    affixes.push({
      modId: mod.id,
      lines: lines.value,
      fractured: !!affix.fractured,
      crafted: !!affix.crafted,
      desecrated: !!affix.desecrated,
    })
  }
  const enchants = []
  for (const entry of corruptionEntries(state)) {
    const mod = catalog.corruptions?.find((mod) => mod.id === entry.modId)
    if (!mod) return { ok: false as const, error: '腐化属性不在当前目录中。' }
    const lines = equipmentLines(mod.lines, entry.lines)
    if (!lines.ok) return lines
    enchants.push({ modId: entry.modId, lines: lines.value })
  }
  const level = readCraftGrantedSkillLevel(catalog, state)
  const sockets = readCraftGrantedSkillSockets(catalog, state)
  const skillName = level.ok ? level.value.name : sockets.ok ? sockets.value.name : null
  const pending = state.pendingDesecration
  return {
    ok: true as const,
    value: {
      baseId: state.baseId,
      itemLevel: state.itemLevel,
      rarity: state.rarity,
      destroyed: !!state.destroyed,
      corrupted: !!state.corrupted,
      twiceCorrupted: !!state.twiceCorrupted,
      enchants: sorted(enchants),
      pending: pending
        ? {
            ...pending,
            ...(pending.options ? { options: [...pending.options].sort() } : {}),
            ...(pending.rerollOptions ? { rerollOptions: [...pending.rerollOptions].sort() } : {}),
          }
        : null,
      sockets: state.sockets ?? null,
      quality: state.quality ?? null,
      catalyst: state.catalyst ? { id: state.catalyst.id, quality: state.catalyst.quality } : null,
      implicit: implicit.value,
      skill:
        skillName === null
          ? null
          : {
              name: skillName,
              level: level.ok ? level.value.level : null,
              sockets: sockets.ok ? sockets.value.sockets : null,
            },
      affixes: sorted(affixes),
    },
  }
}
export type ProjectEquipment = Extract<ReturnType<typeof projectEquipment>, { ok: true }>['value']

// 需求可合写在标题后，也可逐行写成「等级：50」。仅拆分已有译法可确认的数值。
function requirementRows(line: string): string[] | null {
  const content = line
    .replace(/^(?:需求|Requirements|Requires)\s*[:：]\s*/i, '')
    .replace(/[:：]/g, ' ')
  const english = translateMetadata(`Requirements: ${content}`)
  if (!english) return null
  const rows: string[] = []
  for (const part of english.slice('Requirements:'.length).split(/[,，]/)) {
    const value =
      /^(?:(Level|Str|Dex|Int)\s+(\d+)|(\d+)\s+(Level|Str|Dex|Int))(\s+\(unmet\))?$/i.exec(
        part.trim(),
      )
    if (!value) return null
    rows.push(
      `requirement:${(value[1] ?? value[4])?.toLowerCase()}:${value[2] ?? value[3]}${value[5] ? ' (unmet)' : ''}`,
    )
  }
  return rows
}

// 原文中的面板观察不一定能从 CraftState 还原。保留这些行作为额外的核对条件，
// 未识别的内容只允许原样相等；交易备注和已投影的来源行不参与身份比较。
function sourceObservations(catalog: CraftCatalog, state: CraftState): CraftResult<string[]> {
  if (state.sourceText === null) return { ok: true, value: [] }
  const parsed = parseItem(state.sourceText)
  if (!parsed.ok) return parsed
  const base = catalog.bases.find((entry) => entry.id === state.baseId)
  const lines = parsed.item.blocks.flatMap((block) => {
    if (block.kind !== 'properties' && block.kind !== 'requirements' && block.kind !== 'unknown')
      return []
    return block.lines.flatMap(({ raw }) => {
      const line = raw.trim()
      if (
        /^(?:属性|屬性|Properties|需求|Requirements|Requires)\s*[:：]\s*$/i.test(line) ||
        (/^(?:Quality|品质|品質)\s*[:：]/i.test(line) && state.quality !== undefined) ||
        (CATALYST_QUALITY_HEADER.test(line) && state.catalyst) ||
        (base && isBeltCapacityBase(base) && CHARM_SLOTS_PROPERTY.test(line)) ||
        JEWEL_RADIUS_HEADER.test(line)
      )
        return []
      if (block.kind === 'requirements') {
        const requirements = requirementRows(line)
        if (requirements) return requirements
      }
      const known = translateMetadata(line)
      const observation =
        known
          ?.replace(/[,，]\s*/g, ', ')
          .replace(/\s+/g, ' ')
          .trim() ?? line
      return [`${block.kind}:${observation}`]
    })
  })
  if (state.sourceText.split(/\r?\n/).some((line) => line.trim() === 'Sanctified'))
    lines.push('Sanctified')
  return { ok: true, value: lines.sort() }
}

const equipmentLabels: Record<keyof ProjectEquipment, string> = {
  baseId: '基底',
  itemLevel: '物等',
  rarity: '稀有度',
  quality: '品质',
  catalyst: '催化品质',
  sockets: '装备孔位',
  implicit: '固有属性',
  skill: '授予技能',
  affixes: '词缀与数值',
  corrupted: '腐化状态',
  twiceCorrupted: '二重腐化',
  destroyed: '摧毁状态',
  enchants: '腐化属性',
  pending: '待揭示亵渎',
}

export function checkProjectOrigins(
  catalog: CraftCatalog,
  left: TargetCraftProject,
  right: TargetCraftProject,
): CraftResult<ProjectEquipment> {
  const a = projectEquipment(catalog, left.initialState)
  if (!a.ok) return a
  const b = projectEquipment(catalog, right.initialState)
  if (!b.ok) return b
  for (const field of Object.keys(equipmentLabels) as (keyof ProjectEquipment)[]) {
    if (!equivalentProjectJSON(a.value[field], b.value[field]))
      return { ok: false, error: `起始装备的${equipmentLabels[field]}不同，请选择同一起点的收藏。` }
  }
  if (
    !equivalentProjectJSON(left.importedSockets, right.importedSockets) ||
    left.importedQuality !== right.importedQuality
  )
    return { ok: false, error: '起始装备的导入孔位或品质声明不同，请核对两份收藏。' }
  const first = sourceObservations(catalog, left.initialState)
  if (!first.ok) return first
  const second = sourceObservations(catalog, right.initialState)
  if (!second.ok) return second
  if (!equivalentProjectJSON(first.value, second.value))
    return { ok: false, error: '起始装备的原文面板或需求有差异，无法可靠核对为同一起点。' }
  return a
}

export interface AffixDifference extends ComparisonAffix {
  leftCount: number
  rightCount: number
}

export function compareProjectAffixes(
  left: ComparisonAffix[],
  right: ComparisonAffix[],
): AffixDifference[] {
  const counts = new Map<string, AffixDifference>()
  for (const [affixes, side] of [
    [left, 'leftCount'],
    [right, 'rightCount'],
  ] as const) {
    for (const affix of affixes) {
      const key = JSON.stringify(affix)
      const row = counts.get(key) ?? { ...affix, leftCount: 0, rightCount: 0 }
      row[side]++
      counts.set(key, row)
    }
  }
  return [...counts.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, row]) => row)
    .filter((row) => row.leftCount !== row.rightCount)
}
