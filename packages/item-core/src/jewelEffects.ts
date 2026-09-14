import { sovereignResistanceEffect, usesSovereignResistance } from './alloyEffects'
import { readStatAnnotations } from './annotations'
import type { CatalogMod, CraftCatalog } from './catalog'
import { readCatalogLineValues } from './catalogMatch'
import { CATALYSTS } from './catalystQuality'
import { JEWEL_EFFECT_EMOTION_ID, jewelEffectModKind } from './jewelEffectRules'
import { inspectLiquidEmotions } from './liquidEmotions'
import { type CraftResult, type CraftState, createCraftState } from './rehearsal'
import { scaleStatLineByEffect, statScalabilitySourceHash } from './statScalability'

/** 来源或目录损坏时也须识别版本门禁，不因验证失败隐藏新能力。 */
export function usesJewelEffect(
  _catalog: CraftCatalog,
  state: Pick<CraftState, 'affixes'>,
): boolean {
  return state.affixes.some(
    (affix) =>
      affix.modId === 'CraftedJewelPrefixEffect' || affix.modId === 'CraftedJewelSuffixEffect',
  )
}

/** 不调用状态校验，供导入、候选与派生投影共用。 */
export function jewelEffectForKind(
  catalog: CraftCatalog,
  state: CraftState,
  kind: 'prefix' | 'suffix',
): CraftResult<number> {
  if (!usesJewelEffect(catalog, state)) return { ok: true, value: 0 }
  const base = catalog.bases.find((entry) => entry.id === state.baseId)
  const inspection =
    base &&
    inspectLiquidEmotions(catalog, base).find(
      (entry) => entry.emotion.id === JEWEL_EFFECT_EMOTION_ID,
    )
  if (!inspection || inspection.reason !== null)
    return { ok: false, error: inspection?.reason ?? '珠宝增效材料或来源缺失。' }
  const effects = state.affixes.filter(
    (affix) =>
      affix.modId === 'CraftedJewelPrefixEffect' || affix.modId === 'CraftedJewelSuffixEffect',
  )
  if (effects.length !== 1 || state.affixes.filter((affix) => affix.crafted).length !== 1)
    return { ok: false, error: '珠宝增效必须保留唯一工艺身份。' }
  const affix = effects[0]
  if (!affix) return { ok: false, error: '缺少珠宝增效工艺。' }
  const mod = inspection.outcomes.find((entry) => entry.id === affix.modId)
  if (!mod || affix.crafted !== true || affix.desecrated || jewelEffectModKind(mod) === null)
    return { ok: false, error: '珠宝增效工艺身份无效。' }
  const values = readCatalogLineValues(mod.lines, affix.lines)
  if (values === null) return { ok: false, error: '珠宝增效数值与目录不一致。' }
  // 同侧不受工艺影响，其实际掷值未知也不使同侧未知。
  if (mod.kind === kind) return { ok: true, value: 0 }
  const value = values.flat()[0]
  if (value === null || value === undefined) return { ok: false, error: '珠宝增效实际掷值未知。' }
  if (!Number.isInteger(value) || value < 40 || value > 60)
    return { ok: false, error: '珠宝增效必须是 40–60 的整数。' }
  return { ok: true, value }
}

/** 显式词缀共享投影：珠宝侧别与君王抗性互斥于唯一工艺。 */
export function explicitModEffect(
  catalog: CraftCatalog,
  state: CraftState,
  mod: CatalogMod,
): CraftResult<number> {
  const jewel = jewelEffectForKind(catalog, state, mod.kind)
  if (!jewel.ok) return jewel
  const sovereign = sovereignResistanceEffect(catalog, state, mod)
  return sovereign.ok ? { ok: true, value: jewel.value + sovereign.value } : sovereign
}

export function usesExplicitModEffect(
  catalog: CraftCatalog,
  state: Pick<CraftState, 'affixes'>,
): boolean {
  return usesJewelEffect(catalog, state) || usesSovereignResistance(state)
}

export interface CraftAffixEffectGroup {
  id: string
  kind: 'prefix' | 'suffix'
  percent: number | null
  lines: { before: string; after: string | null; reason: string }[]
}

/** 状态始终保存基础掷值；品质与反侧增效相加后只缩放一次。 */
export function estimateCraftAffixEffects(
  catalog: CraftCatalog,
  state: CraftState,
): CraftResult<{ groups: CraftAffixEffectGroup[] }> {
  const checked = createCraftState(catalog, state)
  if (!checked.ok) return checked
  const catalyst = CATALYSTS.find((entry) => entry.id === state.catalyst?.id)
  const groups: CraftAffixEffectGroup[] = []
  for (const affix of state.affixes) {
    const mod = catalog.modifiers.find((entry) => entry.id === affix.modId)
    if (!mod) return { ok: false, error: '词缀不在制作目录中。' }
    const effect = explicitModEffect(catalog, state, mod)
    const quality = mod.tags.some((tag) => catalyst?.tags.some((candidate) => candidate === tag))
      ? (state.catalyst?.quality ?? 0)
      : 0
    const percent = effect.ok ? effect.value + quality : null
    const lines = affix.lines.map((before) => {
      const unknown = (reason: string) => ({ before, after: null, reason })
      if (readStatAnnotations(before).unscalable)
        return { before, after: before, reason: '原文标记不可缩放，保持基础值。' }
      if (!effect.ok) return unknown(effect.error)
      if (percent === 0)
        return { before, after: before, reason: '此组未受词缀增效或催化品质影响。' }
      const patterns = mod.lines.filter(
        (pattern) => readCatalogLineValues([pattern], [before]) !== null,
      )
      const pattern = patterns.length === 1 ? patterns[0] : undefined
      if (pattern === undefined) return unknown('无法唯一对应目录属性行。')
      const metadata = catalog.scalability?.[pattern]
      if (!metadata || statScalabilitySourceHash(catalog) === null)
        return unknown('缺少可核验的属性缩放资料。')
      const scaled = scaleStatLineByEffect(pattern, before, metadata, effect.value + quality)
      return scaled.ok
        ? {
            before,
            after: scaled.value,
            reason: `词缀增效 ${effect.value}% + 命中催化品质 ${quality}%，按来源内部精度一次缩放；真机显示待验收。`,
          }
        : unknown(scaled.error)
    })
    groups.push({ id: mod.id, kind: mod.kind, percent, lines })
  }
  return { ok: true, value: { groups } }
}
