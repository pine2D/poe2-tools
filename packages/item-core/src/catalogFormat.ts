import type { CraftCatalog } from './catalog'
import { DESECRATION_FAMILIES, DESECRATION_SOURCE } from './desecration'
import { JEWEL_SOURCE } from './jewels'
import { LIQUID_EMOTION_SOURCE, liquidEmotionSourceHash } from './liquidEmotions'
import { splitStatScalars, statScalabilitySourceHash } from './statScalability'

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
}
function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}
function numbers(value: unknown): boolean {
  return record(value) && Object.values(value).every(finite)
}

function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function hasOwn(value: unknown, key: PropertyKey): boolean {
  return record(value) && Object.hasOwn(value, key)
}

function validEssences(value: unknown, meta: Record<string, unknown>): boolean {
  if (value === undefined) return true
  if (!Array.isArray(value) || value.length === 0 || value.length > 1000) return false
  const ids = new Set<string>()
  for (const essence of value) {
    if (
      !record(essence) ||
      !Object.keys(essence).every((key) =>
        ['id', 'name', 'type', 'tierLevel', 'mods'].includes(key),
      ) ||
      !nonempty(essence.id) ||
      !/^Metadata\/Items\/Currency\/[A-Za-z0-9_]+$/.test(essence.id) ||
      ids.has(essence.id) ||
      !nonempty(essence.name) ||
      !nonempty(essence.type) ||
      !finite(essence.tierLevel) ||
      !Number.isSafeInteger(essence.tierLevel) ||
      essence.tierLevel < 0 ||
      !record(essence.mods) ||
      Object.keys(essence.mods).length > 100 ||
      !Object.entries(essence.mods).every(([category, id]) => nonempty(category) && nonempty(id))
    )
      return false
    ids.add(essence.id)
  }
  if (!Array.isArray(meta.sources)) return false
  const sources = meta.sources.filter(
    (source) => record(source) && source.path === 'src/Data/Essence.lua',
  )
  const source = sources[0]
  return (
    sources.length === 1 &&
    record(source) &&
    source.url ===
      `https://raw.githubusercontent.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/${meta.sourceCommit}/src/Data/Essence.lua` &&
    typeof source.sha256 === 'string' &&
    /^[a-f0-9]{64}$/.test(source.sha256)
  )
}

const liquidEmotionCategories = ['Ruby', 'Sapphire', 'Emerald', 'Diamond'] as const

function validLiquidEmotions(value: unknown, meta: Record<string, unknown>): boolean {
  const sources = Array.isArray(meta.sources)
    ? meta.sources.filter((source) => record(source) && source.path === LIQUID_EMOTION_SOURCE.path)
    : []
  if (value === undefined) return sources.length === 0
  if (!Array.isArray(value) || value.length === 0 || value.length > 1000) return false
  const ids = new Set<string>()
  for (const emotion of value) {
    if (
      !record(emotion) ||
      !Object.keys(emotion).every((key) =>
        ['id', 'name', 'radiusJewel', 'tierLevel', 'mods'].includes(key),
      ) ||
      !nonempty(emotion.id) ||
      !/^Metadata\/Items\/Currency\/[A-Za-z0-9_]+$/.test(emotion.id) ||
      ids.has(emotion.id) ||
      !nonempty(emotion.name) ||
      typeof emotion.radiusJewel !== 'boolean' ||
      !finite(emotion.tierLevel) ||
      !Number.isSafeInteger(emotion.tierLevel) ||
      emotion.tierLevel < 0 ||
      !record(emotion.mods) ||
      Object.keys(emotion.mods).length !== liquidEmotionCategories.length ||
      liquidEmotionCategories.some((category) => !hasOwn(emotion.mods, category)) ||
      Object.keys(emotion.mods).some(
        (category) => !(liquidEmotionCategories as readonly string[]).includes(category),
      ) ||
      !Object.values(emotion.mods).every(
        (effect) =>
          record(effect) &&
          Object.keys(effect).every((key) => key === 'prefix' || key === 'suffix') &&
          Object.values(effect).every(nonempty),
      )
    )
      return false
    ids.add(emotion.id)
  }
  return liquidEmotionSourceHash({ _meta: meta } as unknown as CraftCatalog) !== null
}

const nameSourceHosts = {
  en: 'www.pathofexile.com',
  'zh-CN': 'poe.game.qq.com',
  'zh-TW': 'pathofexile.tw',
} as const

function validNames(names: unknown, sources: unknown): boolean {
  if (names === undefined && sources === undefined) return true
  if (
    !record(names) ||
    Object.keys(names).length !== 2 ||
    !['zh-CN', 'zh-TW'].every((locale) => {
      const table = names[locale]
      return (
        record(table) &&
        Object.keys(table).length <= 10000 &&
        Object.entries(table).every(
          ([key, text]) =>
            key.trim().length > 0 && typeof text === 'string' && text.trim().length > 0,
        )
      )
    }) ||
    !Array.isArray(sources) ||
    sources.length !== 3
  )
    return false
  const locales = new Set<string>()
  for (const source of sources) {
    if (
      !record(source) ||
      typeof source.locale !== 'string' ||
      !Object.hasOwn(nameSourceHosts, source.locale) ||
      locales.has(source.locale) ||
      source.url !==
        `https://${nameSourceHosts[source.locale as keyof typeof nameSourceHosts]}/api/trade2/data/static` ||
      typeof source.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(source.sha256) ||
      typeof source.fetchedAt !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T/.test(source.fetchedAt) ||
      !Number.isFinite(Date.parse(source.fetchedAt)) ||
      source.gameVersion !== null
    )
      return false
    locales.add(source.locale)
  }
  return true
}

const augmentBooleanFields = [
  'isSocketBound',
  'canSocketInChakraSlots',
  'canSocketInUniqueItems',
  'canSocketInJewellery',
  'canSocketInCorruptedSanctified',
]
const augmentFields = new Set([
  'id',
  'name',
  'category',
  'type',
  'localMod',
  'lines',
  'statOrder',
  'tradeHashes',
  'levelReq',
  'limit',
  'limitId',
  'bonded',
  ...augmentBooleanFields,
])

function effect(value: Record<string, unknown>, allowEmpty = false): boolean {
  return (
    strings(value.lines) &&
    (allowEmpty || value.lines.length > 0) &&
    Array.isArray(value.statOrder) &&
    value.statOrder.every(finite) &&
    value.lines.length === value.statOrder.length
  )
}

function augment(value: unknown): value is Record<string, unknown> & { id: string } {
  return (
    record(value) &&
    Object.keys(value).every((key) => augmentFields.has(key)) &&
    typeof value.name === 'string' &&
    value.name.length > 0 &&
    typeof value.category === 'string' &&
    value.category.length > 0 &&
    value.id === `pob2:augment:${JSON.stringify([value.name, value.category])}` &&
    typeof value.type === 'string' &&
    ['Rune', 'SoulCore', 'Idol', 'AbyssalEye', 'CongealedMist'].includes(value.type) &&
    typeof value.localMod === 'boolean' &&
    effect(value, true) &&
    record(value.tradeHashes) &&
    Object.entries(value.tradeHashes).every(
      ([hash, lines]) => /^\d+$/.test(hash) && strings(lines),
    ) &&
    finite(value.levelReq) &&
    Number.isInteger(value.levelReq) &&
    value.levelReq >= 0 &&
    (value.limit === undefined ||
      (finite(value.limit) && Number.isInteger(value.limit) && value.limit > 0)) &&
    (value.limitId === undefined ||
      (typeof value.limitId === 'string' && value.limitId.length > 0)) &&
    augmentBooleanFields.every(
      (key) => value[key] === undefined || typeof value[key] === 'boolean',
    ) &&
    (value.bonded === undefined ||
      (record(value.bonded) &&
        Object.keys(value.bonded).every((key) => key === 'lines' || key === 'statOrder') &&
        effect(value.bonded)))
  )
}

/** 静态文件也在边界校验，缓存版本不兼容时给出可恢复错误。 */
export function parseCraftCatalog(value: unknown): CraftCatalog {
  const invalid = (): never => {
    throw new Error('制作目录格式不兼容或数据已损坏')
  }
  if (!record(value) || !record(value._meta)) return invalid()
  const meta = value._meta
  if (!validEssences(value.essences, meta)) return invalid()
  if (!validLiquidEmotions(value.liquidEmotions, meta)) return invalid()
  if (!validNames(value.localizedNames, meta.nameSources)) return invalid()
  if (
    meta.schemaVersion !== 2 ||
    meta.tier !== 'primary' ||
    meta.weightStatus !== 'unknown' ||
    typeof meta.sourceCommit !== 'string' ||
    !/^[a-f0-9]{40}$/.test(meta.sourceCommit) ||
    !(meta.gameVersion === null || typeof meta.gameVersion === 'string') ||
    typeof meta.generatedAt !== 'string' ||
    !Array.isArray(meta.sources) ||
    !meta.sources.every(
      (source) =>
        record(source) &&
        typeof source.path === 'string' &&
        typeof source.url === 'string' &&
        typeof source.sha256 === 'string',
    ) ||
    !Array.isArray(meta.excludedBases) ||
    !meta.excludedBases.every(
      (base) => record(base) && typeof base.id === 'string' && typeof base.reason === 'string',
    )
  )
    return invalid()
  if (new Set(meta.sources.map((source) => source.path)).size !== meta.sources.length)
    return invalid()
  if (
    !Array.isArray(value.bases) ||
    value.bases.length > 10000 ||
    !Array.isArray(value.modifiers) ||
    value.modifiers.length > 50000
  )
    return invalid()
  const ids = new Set<string>()
  for (const base of value.bases) {
    if (
      !record(base) ||
      typeof base.id !== 'string' ||
      typeof base.name !== 'string' ||
      base.name.length === 0 ||
      (base.variant === undefined && base.id !== base.name) ||
      ids.has(base.id) ||
      typeof base.type !== 'string' ||
      !strings(base.tags) ||
      !numbers(base.requirements) ||
      !numbers(base.properties) ||
      !(base.implicit === null || typeof base.implicit === 'string') ||
      !Array.isArray(base.implicitTags) ||
      !base.implicitTags.every(strings) ||
      !(base.sourceQuality === null || finite(base.sourceQuality)) ||
      !(
        base.socketLimit === null ||
        (finite(base.socketLimit) && Number.isInteger(base.socketLimit) && base.socketLimit >= 0)
      ) ||
      typeof base.hidden !== 'boolean' ||
      typeof base.runeforged !== 'boolean' ||
      (base.subType !== undefined && typeof base.subType !== 'string') ||
      (base.variantList !== undefined && !strings(base.variantList)) ||
      (base.grantedSkillsHaveNoReservation !== undefined &&
        typeof base.grantedSkillsHaveNoReservation !== 'boolean') ||
      (base.charmLimit !== undefined && !finite(base.charmLimit)) ||
      (base.spirit !== undefined && !finite(base.spirit)) ||
      (base.flask !== undefined && !numbers(base.flask)) ||
      (base.charm !== undefined &&
        (!record(base.charm) ||
          !finite(base.charm.duration) ||
          !finite(base.charm.chargesUsed) ||
          !finite(base.charm.chargesMax) ||
          !strings(base.charm.buff)))
    )
      return invalid()
    if (base.variant !== undefined) {
      const variant = base.variant
      if (
        !record(variant) ||
        !/^pob2:base:v1:[a-f0-9]{64}$/.test(base.id) ||
        !Array.isArray(variant.declarations) ||
        variant.declarations.length === 0 ||
        !variant.declarations.every(
          (entry) =>
            record(entry) &&
            typeof entry.sourcePath === 'string' &&
            entry.sourcePath.length > 0 &&
            finite(entry.index) &&
            Number.isInteger(entry.index) &&
            entry.index >= 0 &&
            typeof entry.hidden === 'boolean',
        )
      )
        return invalid()
      const allHidden = variant.declarations.every((entry) => entry.hidden)
      const someHidden = variant.declarations.some((entry) => entry.hidden)
      const visibility = allHidden ? 'hidden' : someHidden ? 'mixed' : 'visible'
      if (variant.visibility !== visibility || base.hidden !== allHidden) return invalid()
      const locations = variant.declarations.map((entry) =>
        JSON.stringify([entry.sourcePath, entry.index]),
      )
      if (new Set(locations).size !== locations.length) return invalid()
    }
    ids.add(base.id)
  }
  ids.clear()
  for (const mod of value.modifiers) {
    if (
      !record(mod) ||
      !Object.keys(mod).every((key) =>
        [
          'id',
          'kind',
          'name',
          'group',
          'level',
          'lines',
          'statOrder',
          'tags',
          'addsTags',
          'tradeHashes',
          'eligibility',
          'desecratedOnly',
          'jewelOnly',
          'craftedOnly',
        ].includes(key),
      ) ||
      !nonempty(mod.id) ||
      (Object.hasOwn(mod, 'desecratedOnly') && mod.desecratedOnly !== true) ||
      (Object.hasOwn(mod, 'jewelOnly') && mod.jewelOnly !== true) ||
      (Object.hasOwn(mod, 'craftedOnly') && mod.craftedOnly !== true) ||
      (mod.craftedOnly === true && mod.jewelOnly !== true) ||
      (mod.jewelOnly === true && mod.desecratedOnly === true) ||
      ids.has(mod.id) ||
      !['prefix', 'suffix'].includes(String(mod.kind)) ||
      typeof mod.name !== 'string' ||
      typeof mod.group !== 'string' ||
      !finite(mod.level) ||
      !Number.isInteger(mod.level) ||
      mod.level < 1 ||
      !strings(mod.lines) ||
      mod.lines.length === 0 ||
      !Array.isArray(mod.statOrder) ||
      !mod.statOrder.every(finite) ||
      mod.lines.length !== mod.statOrder.length ||
      !strings(mod.tags) ||
      new Set(mod.tags).size !== mod.tags.length ||
      (mod.desecratedOnly === true &&
        (!mod.tags.includes('unveiled_mod') ||
          mod.tags.filter((tag) => (DESECRATION_FAMILIES as readonly string[]).includes(tag))
            .length !== 1)) ||
      !strings(mod.addsTags) ||
      !record(mod.tradeHashes) ||
      !Object.values(mod.tradeHashes).every(strings) ||
      !Array.isArray(mod.eligibility) ||
      !mod.eligibility.every(
        (rule) =>
          record(rule) && typeof rule.tag === 'string' && (rule.value === 0 || rule.value === 1),
      ) ||
      !mod.eligibility.some((rule) => rule.tag === 'default') ||
      new Set(mod.eligibility.map((rule) => rule.tag)).size !== mod.eligibility.length
    )
      return invalid()
    ids.add(mod.id)
  }
  const catalog = value as unknown as CraftCatalog
  for (const mod of catalog.modifiers.filter((entry) => entry.craftedOnly)) {
    const references = (catalog.liquidEmotions ?? [])
      .filter((emotion) => !emotion.radiusJewel)
      .flatMap((emotion) =>
        Object.values(emotion.mods).flatMap((effects) => Object.entries(effects)),
      )
      .filter(([, id]) => id === mod.id)
    if (
      liquidEmotionSourceHash(catalog) === null ||
      mod.eligibility.some((rule) => rule.value !== 0) ||
      references.length === 0 ||
      references.some(([kind]) => kind !== mod.kind)
    )
      return invalid()
  }
  const desecratedSources = meta.sources.filter((source) => source.path === DESECRATION_SOURCE.path)
  const jewelSources = meta.sources.filter((source) => source.path === JEWEL_SOURCE.path)
  if (
    jewelSources.length ||
    Object.hasOwn(meta, 'excludedJewelMods') ||
    value.modifiers.some((mod) => mod.jewelOnly)
  ) {
    const source = jewelSources[0]
    if (
      jewelSources.length !== 1 ||
      source.url !== JEWEL_SOURCE.url ||
      source.sha256 !== JEWEL_SOURCE.sha256 ||
      meta.sourceCommit !== JEWEL_SOURCE.commit ||
      !Array.isArray(meta.excludedJewelMods)
    )
      return invalid()
    for (const excluded of meta.excludedJewelMods) {
      if (
        !record(excluded) ||
        !Object.keys(excluded).every((key) => key === 'id' || key === 'reason') ||
        !nonempty(excluded.id) ||
        !nonempty(excluded.reason) ||
        ids.has(excluded.id)
      )
        return invalid()
      ids.add(excluded.id)
    }
  }
  if (
    desecratedSources.length ||
    Object.hasOwn(meta, 'excludedDesecratedMods') ||
    value.modifiers.some((mod) => mod.desecratedOnly === true)
  ) {
    const source = desecratedSources[0]
    if (
      desecratedSources.length !== 1 ||
      source.url !== DESECRATION_SOURCE.url ||
      source.sha256 !== DESECRATION_SOURCE.sha256 ||
      meta.sourceCommit !== DESECRATION_SOURCE.commit ||
      !Array.isArray(meta.excludedDesecratedMods)
    )
      return invalid()
    for (const excluded of meta.excludedDesecratedMods) {
      if (
        !record(excluded) ||
        !Object.keys(excluded).every((key) => key === 'id' || key === 'reason') ||
        !nonempty(excluded.id) ||
        !nonempty(excluded.reason) ||
        ids.has(excluded.id)
      )
        return invalid()
      ids.add(excluded.id)
    }
  }
  if (value.augments !== undefined) {
    if (!Array.isArray(value.augments) || value.augments.length > 10000) return invalid()
    ids.clear()
    for (const entry of value.augments) {
      if (!augment(entry) || ids.has(entry.id)) return invalid()
      ids.add(entry.id)
    }
  }
  if (value.scalability !== undefined) {
    if (
      !record(value.scalability) ||
      Object.keys(value.scalability).length > 20000 ||
      statScalabilitySourceHash(value as unknown as CraftCatalog) === null
    )
      return invalid()
    const catalog = value as unknown as CraftCatalog
    const patterns = new Set([
      ...catalog.modifiers.flatMap((mod) => mod.lines),
      ...catalog.bases.flatMap((base) => base.implicit?.split('\n') ?? []),
    ])
    for (const [line, scalars] of Object.entries(value.scalability)) {
      if (
        !patterns.has(line) ||
        !Array.isArray(scalars) ||
        scalars.length !== splitStatScalars(line).tokens.length ||
        scalars.some(
          (scalar) =>
            !record(scalar) ||
            Object.keys(scalar).some((key) => !['scalable', 'formats'].includes(key)) ||
            typeof scalar.scalable !== 'boolean' ||
            !strings(scalar.formats) ||
            scalar.formats.length > 8 ||
            scalar.formats.some((format) => format.length === 0 || format.length > 100),
        )
      )
        return invalid()
    }
  }
  return value as unknown as CraftCatalog
}
