import type { CraftCatalog } from './catalog'
import { matchesCatalogLines } from './catalogMatch'
import { CATALYSTS, type CatalystQuality, readCatalystQuality } from './catalystQuality'
import type { InspectedMod } from './export'
import { parseItem } from './parse'
import type { CraftResult, CraftState } from './rehearsal'
import { resolveStat, type StatTemplate } from './resolve'
import type { ItemDocument } from './types'

const RANGE = /\([+-]?\d+(?:\.\d+)?[-–—][+-]?\d+(?:\.\d+)?\)/g

/** 仅接收完整高级基础值，不对交易复制或其他增效文本盲目逆算。 */
export function importCatalystQuality(
  catalog: CraftCatalog,
  item: ItemDocument,
  state: CraftState,
  inspected: readonly InspectedMod[],
  entries: readonly StatTemplate[],
  declaredId?: string,
): CraftResult<CatalystQuality | undefined> {
  const fail = (error: string): CraftResult<CatalystQuality | undefined> => ({ ok: false, error })
  const source = readCatalystQuality(item)
  if (!source.ok) return source
  if (source.value === undefined) {
    if (declaredId !== undefined) return fail('没有催化品质原文，不能附加导入类型声明。')
    if (item.mods.some((mod) => /%/.test(mod.header.raw.replace(/["“][^"”]*["”]/g, ''))))
      return fail('原文含尚未核对的属性头增效，暂时只能对比。')
    return { ok: true, value: undefined }
  }
  const original = parseItem(item.rawText)
  if (
    !original.ok ||
    JSON.stringify(original.item) !== JSON.stringify(item) ||
    inspected.length !== item.mods.length ||
    inspected.some(
      ({ mod, stats }, index) =>
        JSON.stringify(mod) !== JSON.stringify(item.mods[index]) ||
        stats.length !== mod.stats.length ||
        stats.some(
          ({ source }, statIndex) =>
            JSON.stringify(source) !== JSON.stringify(mod.stats[statIndex]),
        ),
    )
  )
    return fail('催化品质与属性检查结果不符合来源原文。')
  if (source.value.id !== null && declaredId !== undefined && declaredId !== source.value.id)
    return fail('核对的催化类型与原文已识别类型不一致。')
  const id = declaredId ?? source.value.id
  const definition = CATALYSTS.find((entry) => entry.id === id)
  if (!definition) return fail('催化品质类型尚未识别，请先核对类型与高级文本基础值。')
  const base = catalog.bases.find((entry) => entry.id === state.baseId)
  if (!base) return fail('催化品质基底不存在。')
  let explicitIndex = 0
  for (const { mod, stats } of inspected) {
    for (const { source, resolution } of stats) {
      if (
        resolution.english !== null &&
        resolution.english !== source.raw &&
        !resolveStat(source.raw, entries).candidates.some(
          (candidate) => candidate.english === resolution.english,
        )
      )
        return fail('催化属性翻译或数值缺少原文词典依据。')
    }
    const affix = mod.kind === 'implicit' ? undefined : state.affixes[explicitIndex++]
    const catalogMod = affix
      ? catalog.modifiers.find((entry) => entry.id === affix.modId)
      : undefined
    const patterns =
      mod.kind === 'implicit' ? (base.implicit?.split('\n') ?? []) : catalogMod?.lines
    const lines = stats.map(({ source, resolution }) => resolution.english ?? source.raw)
    const matchedPatterns =
      mod.kind === 'implicit'
        ? lines.flatMap((line) =>
            (patterns ?? []).filter((pattern) => matchesCatalogLines([pattern], [line])),
          )
        : patterns
    if (
      !matchedPatterns ||
      matchedPatterns.length !== lines.length ||
      matchedPatterns.reduce((n, line) => n + [...line.matchAll(RANGE)].length, 0) !==
        lines.reduce((n, line) => n + [...line.matchAll(RANGE)].length, 0)
    )
      return fail('催化装备需要完整高级基础范围，不能把交易显示值当成基础数值。')
    const header = mod.header.raw.replace(/["“][^"”]*["”]/g, '')
    const remainder = header.replace(/[—–]\s*\d+%\s+(?:Increased|Reduced)\s*}\s*$/i, '}')
    if (/%/.test(remainder)) return fail('属性头包含尚未核对的额外增效。')
    if (mod.magnitude !== undefined) {
      const tags =
        catalogMod?.tags ??
        matchedPatterns.flatMap((pattern) => {
          const position = (base.implicit?.split('\n') ?? []).indexOf(pattern)
          return base.implicitTags[position] ?? []
        })
      const matched = tags.some((tag) => (definition.tags as readonly string[]).includes(tag))
      if (mod.magnitude !== (matched ? source.value.quality : 0))
        return fail('属性头增效与催化品质不一致，可能另有尚未支持的增效。')
    }
  }
  return {
    ok: true,
    value: {
      id: definition.id,
      quality: source.value.quality,
      ...(declaredId === undefined ? {} : { declared: true }),
    },
  }
}
