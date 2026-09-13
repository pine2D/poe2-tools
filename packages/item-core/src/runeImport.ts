import { RUNE_SUFFIX } from './annotations'
import type { CraftCatalog } from './catalog'
import type { InspectedRune } from './export'
import { parseItem } from './parse'
import type { CraftResult, CraftState } from './rehearsal'
import { parseRuneEffectTotals, type RuneEffectTotals, sumRuneEffects } from './runeEffects'
import { effectiveSocketAugment } from './socketAmplification'
import type { ItemDocument } from './types'
import {
  parseWeaponRuneEffectTotals,
  sumWeaponRuneEffects,
  weaponSocketKind,
} from './weaponRuneEffects'

function supportedSource(lines: readonly string[]): boolean {
  return parseRuneEffectTotals(lines) !== null || parseWeaponRuneEffectTotals(lines) !== null
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
        error: '符文效果仍有歧义或不受支持，目前仅核对已支持的正整数普通符文效果。',
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
  const base = catalog.bases.find((entry) => entry.id === state.baseId)
  const weapon = base && weaponSocketKind(base)
  if (weapon) {
    const expected = parseWeaponRuneEffectTotals(state.runeSourceLines, weapon.category)
    const actual = sumWeaponRuneEffects(augments, weapon.category)
    if (!expected || !actual) return '原文或目录包含尚未支持的符文效果，不能核对。'
    return JSON.stringify(expected) === JSON.stringify(actual)
      ? null
      : '符文效果与孔位声明不一致：请分别核对附加伤害两端及各项百分数。'
  }
  const expected = parseRuneEffectTotals(state.runeSourceLines)
  const actual = sumRuneEffects(augments)
  if (expected === null || actual === null) return '原文或目录包含尚未支持的符文效果，不能核对。'
  if (JSON.stringify(expected) === JSON.stringify(actual)) return null
  const describe = (totals: RuneEffectTotals) =>
    `火焰 ${totals.Fire}%、冰霜 ${totals.Cold}%、闪电 ${totals.Lightning}%、防御提高 ${totals.Defences}%`
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
