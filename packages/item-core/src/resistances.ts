import { isSovereignAffix } from './alloyEffects'
import { readStatAnnotations } from './annotations'
import type { CraftCatalog } from './catalog'
import { readCatalogLineValues } from './catalogMatch'
import { CATALYSTS } from './catalystQuality'
import { corruptionEntries } from './corruptionEnchantments'
import { jewelEffectModKind } from './jewelEffectRules'
import { explicitModEffect } from './jewelEffects'
import { readNumericValues } from './numeric'
import { type CraftResult, type CraftState, createCraftState } from './rehearsal'
import { isHorrorSocketAffix } from './socketAmplification'
import { socketEffects } from './sockets'
import { scaleStatLineByEffect, statScalabilitySourceHash } from './statScalability'
import { weaponSocketKind } from './weaponRuneEffects'

export const RESISTANCE_LABELS = {
  fireResistance: '火焰抗性（%）',
  coldResistance: '冰霜抗性（%）',
  lightningResistance: '闪电抗性（%）',
  chaosResistance: '混沌抗性（%）',
  elementalResistance: '元素抗性合计（%）',
} as const
export type ResistanceProperty = keyof typeof RESISTANCE_LABELS
type Element = 'Fire' | 'Cold' | 'Lightning' | 'Chaos'
const ELEMENTS: Element[] = ['Fire', 'Cold', 'Lightning', 'Chaos']
const unknown = (error: string): CraftResult<number> => ({ ok: false, error })

/** 只统计本件无条件抗性贡献；不推导角色抗性、抗性上限或穿透。 */
export function estimateResistances(
  catalog: CraftCatalog,
  state: CraftState,
): Record<ResistanceProperty, CraftResult<number>> {
  const totals: Record<Element, CraftResult<number>> = {
    Fire: { ok: true, value: 0 },
    Cold: { ok: true, value: 0 },
    Lightning: { ok: true, value: 0 },
    Chaos: { ok: true, value: 0 },
  }
  const invalidate = (elements: Element[], reason: string) => {
    for (const element of elements) totals[element] = unknown(reason)
  }
  const finish = () => {
    const values = [totals.Fire, totals.Cold, totals.Lightning]
    return {
      fireResistance: totals.Fire,
      coldResistance: totals.Cold,
      lightningResistance: totals.Lightning,
      chaosResistance: totals.Chaos,
      elementalResistance: values.every((entry) => entry.ok)
        ? {
            ok: true as const,
            value: values.reduce((sum, entry) => sum + (entry.ok ? entry.value : 0), 0),
          }
        : unknown('至少一项元素抗性未知，不能计算合计。'),
    }
  }
  const checked = createCraftState(catalog, state)
  const base = catalog.bases.find((entry) => entry.id === state.baseId)
  if (!checked.ok || !base || state.pendingDesecration) {
    invalidate(ELEMENTS, !checked.ok ? checked.error : '请先完成亵渎揭示。')
    return finish()
  }
  const socketable =
    weaponSocketKind(base) ||
    ['Body Armour', 'Helmet', 'Gloves', 'Boots', 'Focus', 'Shield', 'Buckler'].includes(base.type)
  if (socketable && state.sockets === undefined) {
    invalidate(ELEMENTS, '孔位未核对，无法计入可能已有的符文抗性。')
    return finish()
  }
  const ordinaryLines = [
    ...(base.implicit?.split('\n') ?? []),
    ...corruptionEntries(state).flatMap((entry) => entry.lines),
    ...state.affixes
      .filter(
        (affix) =>
          !isHorrorSocketAffix(catalog, state, affix) &&
          !isSovereignAffix(catalog, state, affix, 'socket') &&
          !isSovereignAffix(catalog, state, affix, 'resistance') &&
          !catalog.modifiers.some(
            (mod) => mod.id === affix.modId && jewelEffectModKind(mod) !== null,
          ),
      )
      .flatMap((affix) => affix.lines),
  ]
  if (
    ordinaryLines.some((line) =>
      /modifier magnitudes|effect of (?:prefix|suffix|socketed)|socketed.*effect/i.test(line),
    ) ||
    (!state.catalyst && /^(?:Quality|品质|品質)\s*[(（]/im.test(state.sourceText ?? ''))
  ) {
    invalidate(ELEMENTS, '存在尚未核对的品质或属性增效规则。')
    return finish()
  }
  const catalyst = CATALYSTS.find((entry) => entry.id === state.catalyst?.id)
  const addLine = (
    raw: string,
    patterns: readonly string[],
    tags: readonly (readonly string[])[],
    applyQuality: boolean,
    effect: CraftResult<number> = { ok: true, value: 0 },
  ) => {
    const annotation = readStatAnnotations(raw)
    const text = annotation.text
    if (!/resistance/i.test(text)) return
    const match = text.match(
      /^\+(.+)% to (all Elemental|all|Fire|Cold|Lightning|Chaos|Fire and Cold|Fire and Lightning|Cold and Lightning|Fire and Chaos|Cold and Chaos|Lightning and Chaos) Resistances?$/,
    )
    if (!match) {
      // 明确排除上限、穿透、友军与有条件贡献；其他写法保持未知。
      if (
        /^\+.+% to (?:Maximum (?:Fire|Cold|Lightning|Chaos) Resistance|all Maximum Elemental Resistances|all maximum Resistances)$/.test(
          text,
        ) ||
        /^(?:Allies in your Presence|Minions) have \+.+% to (?:all Elemental Resistances|Chaos Resistance)$/.test(
          text,
        ) ||
        /^(?:Damage(?: with Weapons)?|Attacks with this Weapon) Penetrates? .+% (?:Fire|Cold|Lightning|Chaos|Elemental) Resistances?(?: during any Flask Effect)?$/.test(
          text,
        ) ||
        /^\+.+% to Chaos Resistance (?:per Poison on you|during any Flask Effect)$/.test(text) ||
        /^\+1% to all Resistances for each Corrupted Item Equipped$/.test(text)
      )
        return
      invalidate(ELEMENTS, `未支持的抗性规则：${text}`)
      return
    }
    const elements: Element[] =
      match[2] === 'all Elemental'
        ? ELEMENTS.slice(0, 3)
        : match[2] === 'all'
          ? ELEMENTS
          : ELEMENTS.filter((element) => match[2]?.split(' and ').includes(element))
    const positions = patterns.flatMap((pattern, index) =>
      readCatalogLineValues([pattern], [raw]) === null ? [] : [index],
    )
    const index = positions.length === 1 ? positions[0] : undefined
    const pattern = index === undefined ? undefined : patterns[index]
    if (pattern === undefined || index === undefined) {
      invalidate(elements, '抗性属性行不能唯一对应目录。')
      return
    }
    let actual = text
    if (!effect.ok && !annotation.unscalable) {
      invalidate(elements, effect.error)
      return
    }
    const sideEffect = effect.ok ? effect.value : 0
    const totalEffect =
      sideEffect +
      (applyQuality &&
      tags[index]?.some((tag) => catalyst?.tags.some((candidate) => candidate === tag))
        ? (state.catalyst?.quality ?? 0)
        : 0)
    if (
      applyQuality &&
      state.catalyst &&
      state.catalyst.quality > 0 &&
      !annotation.unscalable &&
      tags[index] === undefined
    ) {
      invalidate(elements, '抗性属性缺少标签资料，无法判断品质效果。')
      return
    }
    if (totalEffect > 0 && !annotation.unscalable) {
      const metadata = catalog.scalability?.[pattern]
      const scaled =
        metadata && statScalabilitySourceHash(catalog) !== null
          ? scaleStatLineByEffect(pattern, raw, metadata, totalEffect)
          : null
      if (!scaled?.ok) {
        invalidate(
          elements,
          scaled && !scaled.ok ? scaled.error : '抗性品质效果缺少可核验的缩放资料。',
        )
        return
      }
      actual = scaled.value
    } else {
      const values = readNumericValues([pattern], [raw])
      if (!values.ok || values.value.some((value) => value === null)) {
        invalidate(elements, '抗性实际掷值未知。')
        return
      }
    }
    const value = Number(actual.match(/^\+([0-9]+(?:\.[0-9]+)?)(?:\([^)]*\))?%/)?.[1])
    if (!Number.isFinite(value)) {
      invalidate(elements, '抗性实际数值无法核对。')
      return
    }
    for (const element of elements) {
      const previous = totals[element]
      if (previous.ok) totals[element] = { ok: true, value: previous.value + value }
    }
  }
  const patterns = base.implicit?.split('\n') ?? []
  for (const line of state.implicitLines ?? patterns)
    addLine(line, patterns, base.implicitTags, true)
  for (const affix of state.affixes) {
    const mod = catalog.modifiers.find((entry) => entry.id === affix.modId)
    if (mod && !isSovereignAffix(catalog, state, affix, 'resistance'))
      for (const line of affix.lines)
        addLine(
          line,
          mod.lines,
          mod.lines.map(() => mod.tags),
          true,
          explicitModEffect(catalog, state, mod),
        )
  }
  for (const entry of corruptionEntries(state)) {
    const corruption = catalog.corruptions?.find((mod) => mod.id === entry.modId)
    if (corruption)
      for (const line of entry.lines)
        addLine(
          line,
          corruption.lines,
          corruption.lines.map(() => corruption.tags),
          true,
        )
  }
  for (const { augment } of socketEffects(catalog, state))
    for (const line of augment.lines)
      addLine(
        line,
        augment.lines,
        augment.lines.map(() => []),
        false,
      )
  return finish()
}
