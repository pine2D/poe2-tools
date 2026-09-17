import { RUNE_SUFFIX } from './annotations'
import { astridSourceMatches } from './astridRune'
import type { CraftCatalog } from './catalog'
import { conditionalRuneSourceMatches } from './conditionalArmourRunes'
import type { InspectedRune } from './export'
import { influenceRuneSourceMatches } from './influenceRunes'
import { parseItem } from './parse'
import type { CraftResult, CraftState } from './rehearsal'
import {
  parseRuneEffectTotals,
  RUNE_EFFECT_LABELS,
  type RuneEffectKey,
  type RuneEffectTotals,
  sumRuneEffects,
} from './runeEffects'
import {
  isSceptreEffectLine,
  isSupportedSceptreBase,
  sceptreSourceMatches,
} from './sceptreAugments'
import { serleSourceMatches } from './serleRune'
import { effectiveSocketAugment } from './socketAmplification'
import { specialMartialSourceMatches } from './specialMartialRunes'
import type { ItemDocument } from './types'
import {
  parseWeaponRuneEffectTotals,
  sumWeaponRuneEffects,
  weaponSocketKind,
} from './weaponRuneEffects'

function supportedSource(lines: readonly string[]): boolean {
  return (
    lines.every(isSceptreEffectLine) ||
    parseRuneEffectTotals(lines) !== null ||
    parseWeaponRuneEffectTotals(lines) !== null
  )
}

export function readRuneSourceLines(
  item: ItemDocument,
  inspected: readonly InspectedRune[] = [],
): CraftResult<string[] | undefined> {
  const sources = item.blocks
    .filter((block) => block.kind === 'runes')
    .flatMap((block) => block.lines)
  if (sources.length !== inspected.length)
    return { ok: false, error: '符文效果原文尚未完整核对，不能遗漏或添加属性行。' }
  if (sources.length === 0) return { ok: true, value: undefined }
  const rawLines = item.rawText.split(/\r\n|\n|\r/)
  const english: string[] = []
  for (const [index, source] of sources.entries()) {
    const rune = inspected[index]
    if (
      !rune ||
      rune.source.raw !== source.raw ||
      rune.source.line !== source.line ||
      rawLines[source.line - 1] !== source.raw ||
      !RUNE_SUFFIX.test(source.raw)
    )
      return { ok: false, error: '符文效果的原文或行号不一致，请重新核对。' }
    const raw = source.raw.replace(RUNE_SUFFIX, '').trim()
    const resolved =
      rune.resolution.english ?? (rune.resolution.candidates.length === 0 ? raw : null)
    if (resolved === null || !supportedSource([resolved]))
      return {
        ok: false,
        error: '镶嵌效果仍有歧义或不受支持，目前仅核对已支持的符文与基础魂核效果。',
      }
    if (supportedSource([raw]) && raw !== resolved)
      return { ok: false, error: '符文英文原文与确认译法矛盾。' }
    english.push(resolved)
  }
  return { ok: true, value: english }
}

/** 仅核对导入起点；后续替换必须继续保留来源，不能与当前孔位重新求等。 */
export function runeSocketContributionError(
  catalog: CraftCatalog,
  state: CraftState,
): string | null {
  if (state.runeSourceLines === undefined) return null
  if (state.sockets === undefined) return '原文含符文效果，必须完整声明孔位及孔内符文。'
  const augments = []
  for (const id of state.sockets) {
    if (id === null) continue
    const augment = catalog.augments?.find((entry) => entry.id === id)
    if (!augment?.lines.length) return '孔内符文缺少可核对的目录效果。'
    const effective = effectiveSocketAugment(catalog, state, augment)
    if (effective === null) return '孔内符文增效暂不支持，不能核对。'
    augments.push(effective)
  }
  if (
    !influenceRuneSourceMatches(
      state.runeSourceLines,
      augments.flatMap((a) => a.lines),
    )
  )
    return '扩展词缀池符文效果与孔位声明不一致。'
  if (
    !serleSourceMatches(
      state.runeSourceLines,
      augments.flatMap((a) => a.lines),
    ) ||
    !astridSourceMatches(
      state.runeSourceLines,
      augments.flatMap((a) => a.lines),
    )
  )
    return '容量符文效果与孔位声明不一致。'
  const base = catalog.bases.find((entry) => entry.id === state.baseId)
  if (base && isSupportedSceptreBase(base))
    return sceptreSourceMatches(
      state.runeSourceLines,
      augments.flatMap((a) => a.lines),
    )
      ? null
      : '权杖镶嵌效果与孔位声明不一致：请核对完整作用对象、条件、数值和重复行。'
  const weapon = base && weaponSocketKind(base)
  if (weapon) {
    if (
      !specialMartialSourceMatches(
        state.runeSourceLines,
        augments.flatMap((a) => a.lines),
      )
    )
      return '专属符文的条件或费用行与孔位声明不完整对应，请核对数值与重复行。'
    const expected = parseWeaponRuneEffectTotals(state.runeSourceLines, weapon.category)
    const actual = sumWeaponRuneEffects(augments, weapon.category)
    if (!expected || !actual) return '原文或目录包含尚未支持的符文效果，不能核对。'
    return JSON.stringify(expected) === JSON.stringify(actual)
      ? null
      : `符文效果与孔位声明不一致：请核对伤害两端、百分数与基础属性；原文 ${state.runeSourceLines.join('；')}；所选 ${augments.flatMap((augment) => augment.lines).join('；') || '无'}。`
  }
  const expected = parseRuneEffectTotals(state.runeSourceLines)
  const actual = sumRuneEffects(augments)
  if (expected === null || actual === null) return '原文或目录包含尚未支持的符文效果，不能核对。'
  if (
    !conditionalRuneSourceMatches(
      state.runeSourceLines,
      augments.flatMap((a) => a.lines),
    )
  )
    return '条件符文效果与孔位声明不一致：请核对完整触发周期、持续时间、比例及重复行。'
  if (JSON.stringify(expected) === JSON.stringify(actual)) return null
  const describe = (totals: RuneEffectTotals) =>
    (Object.keys(totals) as RuneEffectKey[])
      .filter((key) => totals[key] > 0)
      .map(
        (key) =>
          `${RUNE_EFFECT_LABELS[key]} ${totals[key]}${['Ward', 'Life', 'Mana', 'StunThreshold', 'Strength', 'Dexterity', 'Intelligence', 'PhysicalThornsMin', 'PhysicalThornsMax', 'LightningThornsMin', 'LightningThornsMax'].includes(key) ? '' : '%'}`,
      )
      .join('、') || '无'
  return `符文效果与孔位声明不一致：原文 ${describe(expected)}；所选符文 ${describe(actual)}。`
}

/** 来源只做结构校验；译法与起点孔位的一致性在导入和项目恢复时验证。 */
export function runeSourceStateError(state: CraftState): string | null {
  if (state.runeSourceLines === undefined) return null
  if (
    !Array.isArray(state.runeSourceLines) ||
    state.runeSourceLines.length === 0 ||
    !state.runeSourceLines.every((line) => typeof line === 'string') ||
    !supportedSource(state.runeSourceLines) ||
    !state.sourceText ||
    state.sockets === undefined
  )
    return '符文来源必须包含有效英文效果、来源原文及已核对孔位。'
  const parsed = parseItem(state.sourceText)
  const count = parsed.ok
    ? parsed.item.blocks
        .filter((block) => block.kind === 'runes')
        .reduce((sum, block) => sum + block.lines.length, 0)
    : 0
  return count === state.runeSourceLines.length ? null : '符文来源与原文独立符文行数量不一致。'
}
