import { inspectCraftAlloys } from './alloys'
import { RUNE_SUFFIX, readHeaderStates, stripModifierStateAnnotations } from './annotations'
import {
  canonicalBeltSlot,
  isBeltCapacityBase,
  resolveCraftImplicitPatterns,
} from './beltImplicits'
import { type CraftCatalog, hasGenesisModEligibility } from './catalog'
import { matchCatalogMods } from './catalogMatch'
import { importCatalystQuality } from './catalystImport'
import { importCorruption, knownCorruptionHeader } from './corruptionEnchantments'
import { essenceSourceHash, inspectEssences, supportedEssenceId } from './essences'
import { type ItemInspection, knownExplicitHeader } from './export'
import { fluxEligibleModIds } from './fluxes'
import { matchesGrantedSkillImplicitLines, resolveGrantedSkill } from './grantedSkills'
import { influenceRuneTags, supportsInfluenceDesecration } from './influenceRunes'
import { normalizeJewelFixedImportLine } from './jewelEffectImport'
import { usesJewelEffect } from './jewelEffects'
import { importedJewelRadiusError, JEWEL_RADIUS_HEADER } from './jewelRadius'
import { isRadiusJewel } from './jewels'
import { inspectLiquidEmotions } from './liquidEmotions'
import { hasSpecialModifierSource } from './modifierSource'
import { CHARM_SLOTS_PROPERTY, CHARM_SLOTS_PROPERTY_HEADER, parseItem } from './parse'
import { readItemQuality } from './quality'
import { type CraftResult, type CraftState, createCraftState } from './rehearsal'
import { resolveStat, type StatTemplate } from './resolve'
import { readRuneSourceLines, runeSocketContributionError } from './runeImport'
import { socketCapacity } from './sockets'
import type { ItemDocument } from './types'

/** 只确认原文明确给出的孔数，S 不代表空孔，缺行也不代表零孔。 */
export function importSocketCount(item: ItemDocument): CraftResult<number | null> {
  const lines = item.blocks
    .filter((block) => block.kind === 'sockets')
    .flatMap((block) => block.lines)
  if (lines.length === 0) return { ok: true, value: null }
  if (lines.length !== 1) return { ok: false, error: '原文包含重复插槽行，先核对孔位信息。' }
  const match = lines[0]?.raw.trim().match(/^(?:插槽|插槽連線|Sockets)\s*[:：]\s*(S(?:\s+S)*)$/)
  if (!match?.[1]) return { ok: false, error: '原文插槽行包含未知或缺失标记，暂不能核对孔位。' }
  return { ok: true, value: match[1].split(/\s+/).length }
}

/** 只有整件输入处于已知范围，才允许进入普通通货演练。 */
export function importCraftState(
  catalog: CraftCatalog,
  baseId: string,
  item: ItemDocument,
  inspection: Pick<ItemInspection, 'base' | 'mods' | 'comparisonOnly'> &
    Partial<Pick<ItemInspection, 'runes' | 'skills'>>,
  importedSockets?: readonly (string | null)[],
  importedQuality?: number,
  skillEntries?: readonly StatTemplate[],
  declaredCatalystId?: string,
): CraftResult<CraftState> {
  return readCraftImport(
    false,
    catalog,
    baseId,
    item,
    inspection,
    importedSockets,
    importedQuality,
    skillEntries,
    declaredCatalystId,
  )
}

export function importIdentifiedCraftState(
  catalog: CraftCatalog,
  baseId: string,
  item: ItemDocument,
  inspection: Pick<ItemInspection, 'base' | 'mods' | 'comparisonOnly'> &
    Partial<Pick<ItemInspection, 'runes' | 'skills'>>,
  importedSockets?: readonly (string | null)[],
  importedQuality?: number,
  skillEntries?: readonly StatTemplate[],
  declaredCatalystId?: string,
): CraftResult<CraftState> {
  return readCraftImport(
    true,
    catalog,
    baseId,
    item,
    inspection,
    importedSockets,
    importedQuality,
    skillEntries,
    declaredCatalystId,
  )
}

function readCraftImport(
  native: boolean,
  catalog: CraftCatalog,
  baseId: string,
  item: ItemDocument,
  inspection: Pick<ItemInspection, 'base' | 'mods' | 'comparisonOnly'> &
    Partial<Pick<ItemInspection, 'runes' | 'skills'>>,
  importedSockets?: readonly (string | null)[],
  importedQuality?: number,
  skillEntries?: readonly StatTemplate[],
  declaredCatalystId?: string,
): CraftResult<CraftState> {
  const fail = (error: string): CraftResult<CraftState> => ({ ok: false, error })
  if (inspection.comparisonOnly || item.rarity === 'unique')
    return fail('咒符和传奇装备仅供对比，不开放制作。')
  if (hasSpecialModifierSource(item)) {
    const original = parseItem(item.rawText)
    if (!original.ok || JSON.stringify(original.item) !== JSON.stringify(item))
      return fail('特殊词缀状态与来源原文不一致，不能省略或修改状态字段。')
    if (
      original.item.mods.some((mod) =>
        mod.states?.some((state) => !['crafted', 'desecrated', 'fractured'].includes(state)),
      ) ||
      original.item.mods.filter((mod) => mod.states?.includes('desecrated')).length > 1 ||
      original.item.mods.filter((mod) => mod.states?.includes('fractured')).length > 1 ||
      (original.item.fractured &&
        !original.item.mods.some((mod) => mod.states?.includes('fractured'))) ||
      original.item.mods.some(
        (mod) =>
          ((mod.states?.length ?? 0) > 1 &&
            !(
              mod.states?.length === 2 &&
              mod.states.includes('crafted') &&
              mod.states.includes('fractured')
            )) ||
          (mod.kind === 'implicit' && (mod.states?.length ?? 0) > 0),
      )
    )
      return fail('特殊词缀来源无效；破裂必须定位一组显式属性，且不能与亵渎同组。')
    if (
      inspection.mods.length !== item.mods.length ||
      inspection.mods.some(
        ({ mod }, index) => JSON.stringify(mod) !== JSON.stringify(item.mods[index]),
      )
    )
      return fail('词缀检查结果与来源原文不一致。')
  }
  const originalFlags = parseItem(item.rawText)
  if (
    !originalFlags.ok ||
    originalFlags.item.corrupted !== item.corrupted ||
    originalFlags.item.twiceCorrupted !== item.twiceCorrupted ||
    originalFlags.item.mirrored !== item.mirrored ||
    originalFlags.item.unidentified !== item.unidentified
  )
    return fail('装备状态与来源原文不一致。')
  if (originalFlags.item.corrupted && JSON.stringify(originalFlags.item) !== JSON.stringify(item))
    return fail('腐化装备字段与来源原文不一致，不能省略强化属性或其他状态。')
  if (item.corrupted) {
    if (
      inspection.mods.length !== item.mods.length ||
      inspection.mods.some(
        ({ mod, stats }, index) =>
          JSON.stringify(mod) !== JSON.stringify(item.mods[index]) ||
          stats.length !== mod.stats.length ||
          stats.some(
            ({ source }, line) => JSON.stringify(source) !== JSON.stringify(mod.stats[line]),
          ),
      )
    )
      return fail('腐化词缀检查结果与来源原文不一致。')
    for (const { stats } of inspection.mods) {
      for (const { source, resolution } of stats) {
        const english = resolution.english ?? source.raw
        if (
          english !== source.raw &&
          !resolveStat(source.raw, skillEntries ?? []).candidates.some(
            (candidate) => candidate.english === english,
          )
        )
          return fail('腐化词缀翻译缺少词典依据，或数字范围与原文不一致。')
      }
    }
  }
  if (native) {
    if (
      JSON.stringify(originalFlags.item) !== JSON.stringify(item) ||
      inspection.mods.length !== item.mods.length ||
      inspection.mods.some(
        ({ mod, stats }, i) =>
          JSON.stringify(mod) !== JSON.stringify(item.mods[i]) ||
          stats.length !== mod.stats.length ||
          stats.some(({ source }, j) => JSON.stringify(source) !== JSON.stringify(mod.stats[j])),
      )
    )
      return fail('实例导入必须与完整来源原文一致。')
    for (const { stats } of inspection.mods)
      for (const { source, resolution } of stats) {
        const english = resolution.english ?? source.raw
        if (
          english !== source.raw &&
          !resolveStat(source.raw, skillEntries ?? []).candidates.some(
            (candidate) => candidate.english === english,
          )
        )
          return fail('实例导入翻译或数字范围缺少原文词典依据。')
      }
  }
  if (item.mirrored || item.unidentified) return fail('本阶段仅支持已鉴定、未镜像的装备。')
  if (item.itemLevel === null || item.diagnostics.length > 0)
    return fail('原文仍有缺失或结构诊断，先核对完整高级装备文本。')
  if (item.blocks.some((block) => block.kind === 'unknown'))
    return fail('原文包含未知区块，暂时只能对比。')
  const differentFixedValue = item.mods.some((mod) =>
    mod.stats.some((stat) =>
      stat.rolls.some((roll) => roll.baseValue !== undefined && roll.baseValue !== roll.value),
    ),
  )
  if (
    importedQuality !== undefined &&
    (!Number.isInteger(importedQuality) || importedQuality < 0 || importedQuality > 30)
  )
    return fail('导入品质声明必须是 0–30 的整数。')
  const sourceQuality = readItemQuality(item)
  if (!sourceQuality.ok) return sourceQuality
  if (
    sourceQuality.value !== undefined &&
    importedQuality !== undefined &&
    sourceQuality.value !== importedQuality
  )
    return fail('导入品质声明与原文品质不一致。')
  const quality = sourceQuality.value ?? importedQuality
  const runeLines = readRuneSourceLines(item, inspection.runes)
  if (!runeLines.ok) return runeLines
  if (runeLines.value !== undefined && importedSockets === undefined)
    return fail('原文含符文效果，必须完整声明孔位及孔内符文。')
  const socketCount = importSocketCount(item)
  if (!socketCount.ok) return socketCount
  if (socketCount.value !== null && importedSockets === undefined)
    return fail('原文的 S 标记不能确定孔内是否已有镶嵌物，孔位状态尚未核对，暂时只能对比。')
  if (importedSockets !== undefined) {
    if (!Array.isArray(importedSockets)) return fail('孔位声明必须是数组。')
    if (socketCount.value !== null && socketCount.value !== importedSockets.length)
      return fail('已核对孔数与原文插槽数量不一致。')
    const sourceHash = catalog._meta.sources.find(
      (source) => source.path === 'src/Data/ModRunes.lua',
    )?.sha256
    if (
      typeof sourceHash !== 'string' ||
      !/^[a-f0-9]{64}$/.test(sourceHash) ||
      !catalog.augments?.length
    )
      return fail('孔位核对需要完整的镶嵌物目录及来源指纹。')
  }
  const base = catalog.bases.find((entry) => entry.id === baseId)
  if (!base || inspection.base.english !== base.name) return fail('当前装备与所选基底不一致。')
  if (isBeltCapacityBase(base)) {
    const original = parseItem(item.rawText)
    if (
      !original.ok ||
      JSON.stringify(original.item) !== JSON.stringify(item) ||
      inspection.mods.length !== item.mods.length ||
      inspection.mods.some(
        ({ mod, stats }, index) =>
          JSON.stringify(mod) !== JSON.stringify(item.mods[index]) ||
          stats.length !== mod.stats.length ||
          stats.some(
            ({ source }, statIndex) =>
              JSON.stringify(source) !== JSON.stringify(mod.stats[statIndex]),
          ),
      )
    )
      return fail('腰带原文及词缀检查结构不一致。')
    for (const { mod, stats } of inspection.mods) {
      if (mod.kind !== 'implicit') continue
      for (const { source, resolution } of stats) {
        const english = resolution.english ?? source.raw
        if (!/Charm Slots?/.test(english) && !/Charm Slots?|咒符栏|護符欄位/.test(source.raw))
          continue
        const expected = canonicalBeltSlot(english)
        if (item.locale === 'en' || /^Has /.test(source.raw)) {
          if (expected !== canonicalBeltSlot(source.raw))
            return fail('咒符栏数字或范围与原文不一致。')
        } else if (
          !resolveStat(source.raw, skillEntries ?? []).candidates.some(
            (candidate) => canonicalBeltSlot(candidate.english) === expected,
          )
        )
          return fail('咒符栏翻译缺少词典依据，或数字范围与原文不一致。')
      }
    }
  }
  if (
    inspection.mods.some(
      ({ mod }) =>
        !['prefix', 'suffix', 'implicit', 'enchant'].includes(mod.kind) ||
        (mod.kind === 'enchant' && !knownCorruptionHeader(mod.header.raw)) ||
        (mod.kind !== 'implicit' &&
          mod.kind !== 'enchant' &&
          (!(
            knownExplicitHeader(
              mod.header.raw.replace(/^(\s*\{\s*)(?:crafted|desecrated|fractured)\s+/i, '$1'),
            ) ||
            (mod.states?.includes('crafted') &&
              /^\s*\{\s*(?:前缀(?:属性|词缀)|后缀(?:属性|词缀)|前綴(?:屬性|詞綴)|後綴(?:屬性|詞綴)|(?:Prefix|Suffix) Modifier)\s*(?:[—–]\s*[^{}\r\n]+)?\s*\}\s*$/i.test(
                mod.header.raw,
              ))
          ) ||
            /fractured|crafted|desecrated|破裂|分裂|工艺|工藝|亵渎|褻瀆/i.test(
              mod.header.raw
                .replace(/^(\s*\{\s*)(?:crafted|desecrated|fractured)\s+/i, '$1')
                .replace(/["“][^"”]+["”]/g, ''),
            ))),
    )
  )
    return fail('存在特殊词缀或尚未支持的词缀标记，暂时只能对比。')

  const ordinaryImplicitLines = inspection.mods
    .filter(({ mod }) => mod.kind === 'implicit')
    .flatMap(({ stats }) =>
      stats.map(({ source, resolution }) => {
        const line = resolution.english ?? source.raw
        return isBeltCapacityBase(base) ? canonicalBeltSlot(line) : line
      }),
    )
  const sourceSkills = item.blocks
    .filter((block) => block.kind === 'skill')
    .flatMap((block) => block.lines)
  const skills = inspection.skills ?? []
  if (
    skills.length !== sourceSkills.length ||
    skills.some(
      ({ source }, index) =>
        source.line !== sourceSkills[index]?.line || source.raw !== sourceSkills[index]?.raw,
    )
  )
    return fail('授予技能检查结果与来源原文不一致。')
  // 来源形态与数值必须重新解析；中文静态名称必须有传入词典的映射证据。
  {
    const original = parseItem(item.rawText)
    if (
      !original.ok ||
      original.item.locale !== item.locale ||
      JSON.stringify(
        original.item.blocks
          .filter((block) => block.kind === 'skill')
          .flatMap((block) => block.lines),
      ) !== JSON.stringify(sourceSkills)
    )
      return fail('授予技能区块与来源原文不一致。')
  }
  if (
    skills.some((skill) => {
      const parsed = resolveGrantedSkill(skill.source.raw, skillEntries ?? [], item.locale)
      const english = skill.resolution.english
      if (
        parsed.unlevelled !== skill.unlevelled ||
        parsed.displayedLevel !== skill.displayedLevel ||
        parsed.maxLevel !== skill.maxLevel ||
        english === null ||
        !skill.resolution.candidates.some((candidate) => candidate.english === english)
      )
        return true
      const translated = resolveGrantedSkill(english, [], 'en')
      if (
        translated.resolution.english !== english ||
        translated.unlevelled !== parsed.unlevelled ||
        translated.displayedLevel !== parsed.displayedLevel ||
        translated.maxLevel !== parsed.maxLevel
      )
        return true
      if (
        skillEntries !== undefined ||
        parsed.unlevelled ||
        item.locale === 'en' ||
        skill.source.raw.trim().startsWith('Grants Skill:')
      ) {
        if (!parsed.resolution.candidates.some((candidate) => candidate.english === english))
          return true
        if (
          skillEntries !== undefined &&
          JSON.stringify(parsed.resolution.candidates) !==
            JSON.stringify(skill.resolution.candidates)
        )
          return true
      }
      return parsed.unlevelled !== true && parsed.displayedLevel === null
    })
  )
    return fail('授予技能未知、歧义或格式无效，暂时只能对比。')
  const skillLines = skills.map((skill) => skill.resolution.english as string)
  if (
    new Set(skillLines.map((line) => line.replace(/ \(Max Level \d+\)$/, ''))).size !==
    skillLines.length
  )
    return fail('原文包含重复授予技能，暂时只能对比。')
  const implicitLines = [...ordinaryImplicitLines, ...skillLines]
  const implicit = resolveCraftImplicitPatterns(base, {
    itemLevel: item.itemLevel,
    sourceText: item.rawText,
    implicitLines,
  })
  if (!implicit.ok || !matchesGrantedSkillImplicitLines(implicit.value.patterns, implicitLines))
    return fail('固有属性尚未与所选基底完整对应，暂时只能对比。')
  if (implicit.value.charm) {
    const panels = item.blocks
      .filter((block) => block.kind === 'properties')
      .flatMap((block) => block.lines)
      .filter((line) => CHARM_SLOTS_PROPERTY_HEADER.test(line.raw.trim()))
    if (
      panels.length > 1 ||
      (panels.length === 1 &&
        Number((panels[0]?.raw ?? '').trim().match(CHARM_SLOTS_PROPERTY)?.[1]) !==
          implicit.value.charm.value)
    )
      return fail('咒符栏面板与固有属性不一致，或存在重复面板。')
  }

  const explicit = inspection.mods.filter(
    ({ mod }) => mod.kind === 'prefix' || mod.kind === 'suffix',
  )
  const mappedIds = new Set(
    essenceSourceHash(catalog) === null
      ? []
      : inspectEssences(catalog, base)
          .filter((entry) => supportedEssenceId(entry.essence.id) && entry.mod !== null)
          .map((entry) => entry.modId),
  )
  for (const entry of inspectLiquidEmotions(catalog, base))
    if (entry.reason === null) for (const mod of entry.outcomes) mappedIds.add(mod.id)
  for (const entry of inspectCraftAlloys(catalog, base)) if (entry.mod) mappedIds.add(entry.mod.id)
  const fluxEligible = native ? fluxEligibleModIds(catalog, base) : null
  const influence = influenceRuneTags(catalog, {
    baseId,
    ...(importedSockets === undefined ? {} : { sockets: [...importedSockets] }),
  })
  if (!influence.ok) return influence
  if (influence.value.length > 0) {
    if (JSON.stringify(originalFlags.item) !== JSON.stringify(item))
      return fail('扩展词缀池来源必须与完整装备原文一致。')
    for (const rune of inspection.runes ?? []) {
      const raw = rune.source.raw.replace(RUNE_SUFFIX, '').trim()
      const english = rune.resolution.english ?? raw
      if (
        english !== raw &&
        !resolveStat(raw, skillEntries ?? []).candidates.some(
          (candidate) => candidate.english === english,
        )
      )
        return fail('扩展词缀池符文翻译缺少原文词典依据。')
    }
  }
  const matches = explicit.map((source, sourceIndex) => {
    // 工艺组只使用精华、液态和合金的精确映射；临时匹配视图不改变原目录生成资格。
    let modifiers: CraftCatalog['modifiers'] = source.mod.states?.includes('crafted')
      ? catalog.modifiers.map((mod) =>
          mappedIds.has(mod.id)
            ? (() => {
                const { craftedOnly: _craftedOnly, ...matchable } = mod
                return {
                  ...matchable,
                  eligibility: [{ tag: base.tags[0] ?? 'default', value: 1 as const }],
                }
              })()
            : mod,
        )
      : catalog.modifiers
    if (native && !source.mod.states?.includes('crafted'))
      modifiers = modifiers.map((mod) => {
        if (
          !fluxEligible?.[
            source.mod.states?.includes('desecrated') ? 'desecrated' : 'ordinary'
          ].has(mod.id)
        )
          return mod
        const { craftedOnly: _craftedOnly, ...matchable } = mod
        return {
          ...matchable,
          eligibility: [{ tag: base.tags[0] ?? 'default', value: 1 as const }],
        }
      })
    const matchingSource = differentFixedValue
      ? {
          ...source,
          stats: source.stats.map((stat) => ({
            ...stat,
            resolution: {
              ...stat.resolution,
              english: normalizeJewelFixedImportLine(stat.resolution.english ?? stat.source.raw),
            },
          })),
        }
      : source
    const match = matchCatalogMods(
      base,
      modifiers,
      [matchingSource],
      source.mod.states?.includes('crafted') ||
        (source.mod.states?.includes('desecrated') &&
          !supportsInfluenceDesecration(influence.value))
        ? []
        : influence.value,
    )[0]
    if (!match) throw new Error('词缀匹配结果缺失')
    return { ...match, sourceIndex }
  })
  // 特殊生成身份与范围语义不能仅凭可变的检查结果；重新绑定原文与词典候选。
  if (
    isRadiusJewel(base) ||
    matches.some((match) => match.candidates.some((mod) => hasGenesisModEligibility(base, mod)))
  ) {
    const scope = isRadiusJewel(base) ? '范围珠宝' : 'Genesis 词缀'
    const original = parseItem(item.rawText)
    if (
      !original.ok ||
      JSON.stringify(original.item) !== JSON.stringify(item) ||
      inspection.mods.length !== item.mods.length ||
      inspection.mods.some(
        ({ mod, stats }, index) =>
          JSON.stringify(mod) !== JSON.stringify(item.mods[index]) ||
          stats.length !== mod.stats.length ||
          stats.some(
            ({ source }, statIndex) =>
              JSON.stringify(source) !== JSON.stringify(mod.stats[statIndex]),
          ),
      )
    )
      return fail(`${scope}检查结果与来源原文不一致。`)
    for (const { stats } of explicit) {
      for (const { source, resolution } of stats) {
        const english = resolution.english ?? source.raw
        if (english === source.raw) continue
        if (
          !resolveStat(source.raw, skillEntries ?? []).candidates.some(
            (candidate) => candidate.english === english,
          )
        )
          return fail(`${scope}翻译缺少词典依据，或数字范围与原文不一致。`)
      }
    }
  }
  if (item.mods.some((mod) => mod.states?.includes('fractured'))) {
    if (item.rarity !== 'rare') return fail('目前只支持稀有装备的破裂来源；魔法破裂装备仅供对比。')
    for (const { mod, stats } of inspection.mods) {
      if (
        stats.length !== mod.stats.length ||
        stats.some(
          ({ source }, index) => JSON.stringify(source) !== JSON.stringify(mod.stats[index]),
        )
      )
        return fail('破裂属性行检查结果与原文不一致。')
      const headerFractured = readHeaderStates(mod.header.raw).includes('fractured')
      if (
        mod.states?.includes('fractured') &&
        !headerFractured &&
        mod.stats.some((stat) => !stat.states?.includes('fractured'))
      )
        return fail('破裂组必须完整标记所有属性行。')
      for (const { source, resolution } of stats) {
        if ((source.raw.match(/\(fractured\)/gi)?.length ?? 0) > 1)
          return fail('同一属性行包含重复破裂来源。')
        const english = stripModifierStateAnnotations(resolution.english ?? source.raw)
        if (english === stripModifierStateAnnotations(source.raw)) continue
        if (
          !resolveStat(source.raw, skillEntries ?? []).candidates.some(
            (candidate) => stripModifierStateAnnotations(candidate.english) === english,
          )
        )
          return fail('破裂词缀翻译或实际数值缺少原文词典依据。')
      }
    }
  }
  const affixes: CraftState['affixes'] = []
  for (const match of matches) {
    const candidate = match.candidates[0]
    const source = explicit[match.sourceIndex]
    if (match.status !== 'matched' || !candidate || !source)
      return fail('仍有词缀未唯一对应目录，暂时只能对比。')
    if (
      source.mod.name === null &&
      !catalog.modifiers.some((mod) => mod.id === candidate.id && mod.craftedOnly)
    )
      return fail('无词缀名称的显式头仅支持已核实的工艺专属属性。')
    affixes.push({
      ...(native ? { affixId: `a${affixes.length + 1}` } : {}),
      modId: candidate.id,
      lines: source.stats.map(({ source, resolution }) =>
        stripModifierStateAnnotations(
          differentFixedValue
            ? normalizeJewelFixedImportLine(resolution.english ?? source.raw)
            : (resolution.english ?? source.raw),
        ),
      ),
      ...(source.mod.states?.includes('crafted') ? { crafted: true as const } : {}),
      ...(source.mod.states?.includes('desecrated') ? { desecrated: true as const } : {}),
      ...(source.mod.states?.includes('fractured') ? { fractured: true as const } : {}),
    })
  }
  const state: CraftState = {
    ...(native ? { nextAffixId: affixes.length + 1 } : {}),
    ...(item.corrupted ? { corrupted: true } : {}),
    ...(item.twiceCorrupted ? { twiceCorrupted: true } : {}),
    baseId,
    itemLevel: item.itemLevel,
    rarity: item.rarity,
    affixes,
    sourceText: item.rawText,
    ...(runeLines.value === undefined ? {} : { runeSourceLines: runeLines.value }),
    ...(implicitLines.length === 0 ? {} : { implicitLines }),
    ...(importedSockets === undefined ? {} : { sockets: [...importedSockets] }),
    ...(quality === undefined ? {} : { quality }),
  }
  if (differentFixedValue && !usesJewelEffect(catalog, state))
    return fail('当前值与固定基础值不同，增效来源及基础数值尚未还原；原文保留用于对比。')
  const corruption = importCorruption(
    catalog,
    state,
    inspection.mods.filter(({ mod }) => mod.kind === 'enchant'),
  )
  if (!corruption.ok) return corruption
  Object.assign(state, corruption.value)
  const catalyst = importCatalystQuality(
    catalog,
    item,
    state,
    inspection.mods,
    skillEntries ?? [],
    declaredCatalystId,
  )
  if (!catalyst.ok) return catalyst
  if (catalyst.value !== undefined) state.catalyst = catalyst.value
  // 零孔同样需要已支持类别与普通孔位规则，不能走空列表的宽松校验。
  if (importedSockets !== undefined && socketCapacity(catalog, state) === 0)
    return fail('该基底或特殊孔位规则暂不支持孔位核对演练。')
  const checked = createCraftState(catalog, state)
  if (!checked.ok) return checked
  const radiusBase = catalog.bases.find((base) => base.id === baseId)
  if (
    (radiusBase && isRadiusJewel(radiusBase)) ||
    item.rawText.split(/\r?\n/).some((line) => JEWEL_RADIUS_HEADER.test(line.trim()))
  ) {
    if (JSON.stringify(originalFlags.item) !== JSON.stringify(item))
      return fail('范围珠宝字段与来源原文不一致。')
    const radiusError = importedJewelRadiusError(catalog, checked.value, originalFlags.item)
    if (radiusError) return fail(radiusError)
  }
  const contributionError = runeSocketContributionError(catalog, checked.value)
  return contributionError === null ? checked : fail(contributionError)
}
