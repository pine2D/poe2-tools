import { readStatAnnotations } from './annotations'
import type { CraftCatalog } from './catalog'
import { readCatalogLineValues } from './catalogMatch'
import { CATALYSTS } from './catalystQuality'
import { jewelEffectForKind } from './jewelEffects'
import { isBasicJewel } from './jewels'
import { inspectNumericLines, readNumericValues, renderNumericLines } from './numeric'
import { type CraftResult, type CraftState, createCraftState } from './rehearsal'
import { scaleStatLineByEffect, statScalabilitySourceHash } from './statScalability'

export interface CatalystChoice {
  id: string
  name: string
  label: string
  tags: readonly string[]
}
export interface CatalystEffectLine {
  before: string
  after: string | null
  status: 'estimated' | 'unaffected' | 'unscalable' | 'unknown'
  reason: string
  basis?: 'metadata' | 'display'
}
export interface CatalystEffectGroup {
  id: string
  kind: 'implicit' | 'prefix' | 'suffix'
  matched: boolean
  lines: CatalystEffectLine[]
}
export interface CatalystEstimate {
  catalystName: string
  quality: number
  maxQuality: number
  groups: CatalystEffectGroup[]
}

export function catalystChoices(
  catalog: CraftCatalog,
  state: CraftState,
): CraftResult<{ maxQuality: number; choices: CatalystChoice[] }> {
  const checked = createCraftState(catalog, state)
  if (!checked.ok) return checked
  const base = catalog.bases.find((entry) => entry.id === state.baseId)
  if (!base || (!['Ring', 'Amulet'].includes(base.type) && !isBasicJewel(base)))
    return { ok: false, error: '催化剂预览只支持可制作的戒指、项链和四类普通珠宝。' }
  if (
    (state.quality !== undefined && state.quality !== 0) ||
    (base.sourceQuality !== null && base.sourceQuality !== 0) ||
    (!state.catalyst && /^(?:Quality|品质|品質)\s*[(（]/im.test(state.sourceText ?? ''))
  )
    return { ok: false, error: '已有品质的类型与基础数值尚未核对，不能再次叠乘催化效果。' }
  if (state.pendingDesecration)
    return { ok: false, error: '请先揭示亵渎词缀，再比较完整装备的催化效果。' }
  const breach =
    base.id === 'Breach Ring' && base.type === 'Ring' && base.implicit === '+20% to Maximum Quality'
  if (
    (!breach && /quality/i.test(base.implicit ?? '')) ||
    state.affixes.some((affix) => affix.lines.some((line) => /quality/i.test(line)))
  )
    return { ok: false, error: '此装备具有尚未核对的特殊品质规则，暂不提供催化估算。' }
  return {
    ok: true,
    value: {
      maxQuality: breach ? 40 : 20,
      choices: CATALYSTS.map((entry) => ({
        ...entry,
        name: `${isBasicJewel(base) ? 'Refined ' : ''}${entry.id} Catalyst`,
      })),
    },
  }
}

const NUMBER = '[+-]?\\d+(?:\\.\\d+)?'
const RANGE = new RegExp(`([+-]?)\\((${NUMBER})[-–—](${NUMBER})\\)`, 'g')

function estimateLine(
  catalog: CraftCatalog,
  patterns: readonly string[],
  before: string,
  matched: boolean,
  quality: number,
  sideEffect = 0,
): CatalystEffectLine {
  const pending = (reason: string): CatalystEffectLine => ({
    before,
    after: null,
    status: 'unknown',
    reason,
  })
  if (!matched && sideEffect === 0)
    return { before, after: null, status: 'unaffected', reason: '未命中此类催化标签。' }
  if (readStatAnnotations(before).unscalable)
    return { before, after: null, status: 'unscalable', reason: '原文标记不可缩放，保持原值。' }
  const totalEffect = sideEffect + (matched ? quality : 0)
  // 一行若能对应多个模板，不猜测它对应的精度和位置。
  const candidates = patterns.filter(
    (pattern) => readCatalogLineValues([pattern], [before]) !== null,
  )
  const pattern = candidates[0]
  if (candidates.length !== 1 || pattern === undefined) return pending('无法唯一对应目录属性行。')
  const metadata = catalog.scalability?.[pattern]
  if (metadata !== undefined) {
    if (statScalabilitySourceHash(catalog) === null) return pending('缩放资料缺少可信来源指纹。')
    const scaled = scaleStatLineByEffect(pattern, before, metadata, totalEffect)
    return scaled.ok
      ? {
          before,
          after: scaled.value,
          status: 'estimated',
          reason: '采用来源缩放能力与内部精度；游戏版本和真机显示待验收。',
          basis: 'metadata',
        }
      : pending(scaled.error)
  }
  if (sideEffect > 0) return pending('珠宝增效缺少可核验的属性缩放资料。')
  if (/\d/.test(pattern.replace(RANGE, ''))) return pending('含固定数字，其缩放范围尚未核对。')
  const ranges = inspectNumericLines([pattern])
  const values = readNumericValues([pattern], [before])
  if (!ranges.ok || !values.ok) return pending('数值范围无法核对。')
  if (ranges.value.length === 0) return pending('没有可核对的数值范围。')
  if (values.value.some((value) => value === null))
    return pending('当前数值未知，请先在制作中指定数值。')
  const actual = values.value as number[]
  if (!renderNumericLines([pattern], actual).ok)
    return pending('当前数值超出目录显示精度，不能推断内部步长。')
  const scaled: number[] = []
  for (const range of ranges.value) {
    const scale = Math.round(1 / range.step)
    const point = Math.round((actual[range.index] ?? Number.NaN) * scale)
    if (!Number.isSafeInteger(point)) return pending('数值超出安全显示精度。')
    // 整数运算避免 1.4 × 1.2 等浮点偏差；负值按绝对值截断。
    const result = (BigInt(point) * BigInt(100 + quality)) / 100n
    if (!Number.isSafeInteger(Number(result))) return pending('估算结果超出安全显示精度。')
    scaled.push(Number(result) / scale)
  }
  let index = 0
  const after = pattern.replace(RANGE, (_text, prefix: string) => {
    const value = scaled[index++] ?? 0
    return `${prefix === '+' && value >= 0 ? '+' : ''}${value}`
  })
  return {
    before,
    after,
    status: 'estimated',
    reason: '按目录显示精度估算，内部精度与游戏取整待验收。',
    basis: 'display',
  }
}

/** 只读比较指定品质；不修改制作状态、目标、历史、导出或费用。 */
export function estimateCatalystEffects(
  catalog: CraftCatalog,
  state: CraftState,
  catalystId: string,
  quality: number,
): CraftResult<CatalystEstimate> {
  const options = catalystChoices(catalog, state)
  if (!options.ok) return options
  const choice = options.value.choices.find((entry) => entry.id === catalystId)
  if (!choice) return { ok: false, error: '未知催化剂类别。' }
  if (!Number.isInteger(quality) || quality < 0 || quality > options.value.maxQuality)
    return { ok: false, error: `预览品质必须是 0–${options.value.maxQuality} 的整数。` }
  const base = catalog.bases.find((entry) => entry.id === state.baseId)
  const patterns = base?.implicit?.split('\n') ?? []
  const matches = (tags: readonly string[]) => tags.some((tag) => choice.tags.includes(tag))
  const groups: CatalystEffectGroup[] = (state.implicitLines ?? patterns).map((line, index) => {
    const candidates = patterns.flatMap((pattern, position) =>
      readCatalogLineValues([pattern], [line]) === null ? [] : [position],
    )
    const position = candidates.length === 1 ? candidates[0] : undefined
    const matched = position !== undefined && matches(base?.implicitTags[position] ?? [])
    return {
      id: `implicit:${index}`,
      kind: 'implicit',
      matched,
      lines: [
        position === undefined
          ? { before: line, after: null, status: 'unknown', reason: '固有属性标签无法唯一对应。' }
          : estimateLine(catalog, patterns, line, matched, quality),
      ],
    }
  })
  for (const affix of state.affixes) {
    const mod = catalog.modifiers.find((entry) => entry.id === affix.modId)
    if (!mod) return { ok: false, error: '词缀不在制作目录中。' }
    const matched = matches(mod.tags)
    const effect = jewelEffectForKind(catalog, state, mod.kind)
    groups.push({
      id: mod.id,
      kind: mod.kind,
      matched,
      lines: affix.lines.map((line) =>
        effect.ok
          ? estimateLine(catalog, mod.lines, line, matched, quality, effect.value)
          : { before: line, after: null, status: 'unknown', reason: effect.error },
      ),
    })
  }
  return {
    ok: true,
    value: { catalystName: choice.name, quality, maxQuality: options.value.maxQuality, groups },
  }
}
