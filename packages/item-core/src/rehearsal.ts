import { craftAffixSpace, usesJewelCapacity } from './affixCapacity'
import { readStatAnnotations, UNSCALABLE_SUFFIX } from './annotations'
import {
  beltBaseError,
  isBeltCapacityBase,
  resolveCraftImplicitPatterns,
  UNKNOWN_CHARM_RANGE,
} from './beltImplicits'
import { pendingBoneOmenError } from './boneCandidates'
import {
  boneBaseError,
  clonePendingDesecration,
  isPendingDesecration,
  PENDING_DESECRATION_MESSAGE,
  type PendingDesecration,
} from './boneRules'
import {
  type CatalogBase,
  type CatalogMod,
  type CraftCatalog,
  hasCraftModEligibility,
  hasExistingModEligibility,
  inspectModPool,
} from './catalog'
import { matchCatalogLineOrder, matchesCatalogLines, readCatalogLineValues } from './catalogMatch'
import { catalystStateError } from './catalystQuality'
import { corruptionStateError } from './corruptionEnchantments'
import { CORRUPTED_CRAFT_MESSAGE } from './corruptionRules'
import { desecrationSourceHash } from './desecration'
import { isEssenceMappedMod } from './essences'
import { matchesGrantedSkillImplicitLines, readBaseGrantedSkills } from './grantedSkills'
import { jewelEffectModKind } from './jewelEffectRules'
import { craftAffixLimit, isBasicJewel, jewelSourceHash } from './jewels'
import {
  isLiquidEmotionMappedMod,
  jewelCapacityModKind,
  liquidEmotionSourceHash,
} from './liquidEmotions'
import { craftModsConflict } from './modConflicts'
import { inspectNumericLines, renderNumericLines } from './numeric'
import { CRAFT_OMEN_RULES, type CraftOmen, craftOmenError } from './omens'
import { runeSourceStateError } from './runeImport'
import { hasSpecialSocketRules, socketStateError } from './sockets'

export type CraftRarity = 'normal' | 'magic' | 'rare'
export type BasicCraftCurrency =
  | 'transmutation'
  | 'augmentation'
  | 'regal'
  | 'alchemy'
  | 'exalted'
  | 'chaos'
  | 'annulment'
  | 'divine'

export type CraftCurrency =
  | BasicCraftCurrency
  | 'greater_transmutation'
  | 'perfect_transmutation'
  | 'greater_augmentation'
  | 'perfect_augmentation'
  | 'greater_regal'
  | 'perfect_regal'
  | 'greater_exalted'
  | 'perfect_exalted'
  | 'greater_chaos'
  | 'perfect_chaos'

export type CraftCurrencyTier = 'basic' | 'greater' | 'perfect'
export type RemovalCraftCurrency = 'chaos' | 'greater_chaos' | 'perfect_chaos' | 'annulment'

export const CRAFT_CURRENCY_RULES: Readonly<
  Record<CraftCurrency, { base: BasicCraftCurrency; tier: CraftCurrencyTier; minModLevel: number }>
> = {
  transmutation: { base: 'transmutation', tier: 'basic', minModLevel: 0 },
  augmentation: { base: 'augmentation', tier: 'basic', minModLevel: 0 },
  regal: { base: 'regal', tier: 'basic', minModLevel: 0 },
  alchemy: { base: 'alchemy', tier: 'basic', minModLevel: 0 },
  exalted: { base: 'exalted', tier: 'basic', minModLevel: 0 },
  chaos: { base: 'chaos', tier: 'basic', minModLevel: 0 },
  annulment: { base: 'annulment', tier: 'basic', minModLevel: 0 },
  divine: { base: 'divine', tier: 'basic', minModLevel: 0 },
  greater_transmutation: { base: 'transmutation', tier: 'greater', minModLevel: 44 },
  perfect_transmutation: { base: 'transmutation', tier: 'perfect', minModLevel: 70 },
  greater_augmentation: { base: 'augmentation', tier: 'greater', minModLevel: 44 },
  perfect_augmentation: { base: 'augmentation', tier: 'perfect', minModLevel: 70 },
  greater_regal: { base: 'regal', tier: 'greater', minModLevel: 35 },
  perfect_regal: { base: 'regal', tier: 'perfect', minModLevel: 50 },
  greater_exalted: { base: 'exalted', tier: 'greater', minModLevel: 35 },
  perfect_exalted: { base: 'exalted', tier: 'perfect', minModLevel: 50 },
  greater_chaos: { base: 'chaos', tier: 'greater', minModLevel: 35 },
  perfect_chaos: { base: 'chaos', tier: 'perfect', minModLevel: 50 },
}

export interface CraftAffix {
  fractured?: true
  crafted?: true
  desecrated?: true
  modId: string
  lines: string[]
}

export interface CraftState {
  corruption?: import('./corruptionEnchantments').CraftCorruption
  corrupted?: true
  catalyst?: import('./catalystQuality').CatalystQuality
  pendingDesecration?: PendingDesecration
  baseId: string
  itemLevel: number
  rarity: CraftRarity
  affixes: CraftAffix[]
  sourceText: string | null
  implicitLines?: string[]
  sockets?: (string | null)[]
  /** 起点已核对英文符文效果；当前效果只从 sockets 派生。 */
  runeSourceLines?: string[]
  /** 缺省表示来源未知；整数 0–30 表示已明确核对的品质。 */
  quality?: number
}

export type CraftResult<T> = { ok: true; value: T } | { ok: false; error: string }

export interface CraftOperation {
  omen?: CraftOmen
  currency: CraftCurrency
  modIds: string[]
  removeModId?: string
  rolls?: { modId: string; values: number[] }[]
  implicitValues?: number[]
}

const SUPPORTED_TYPES = new Set([
  'Amulet',
  'Belt',
  'Body Armour',
  'Boots',
  'Bow',
  'Buckler',
  'Claw',
  'Crossbow',
  'Dagger',
  'Flail',
  'Focus',
  'Gloves',
  'Helmet',
  'One Hand Axe',
  'One Hand Mace',
  'One Hand Sword',
  'Quiver',
  'Ring',
  'Sceptre',
  'Shield',
  'Spear',
  'Staff',
  'Two Hand Axe',
  'Two Hand Mace',
  'Two Hand Sword',
  'Wand',
])

export const CRAFT_CURRENCY_LABELS: Readonly<Record<CraftCurrency, string>> = {
  transmutation: '蜕变石',
  augmentation: '增幅石',
  regal: '富豪石',
  alchemy: '点金石',
  exalted: '崇高石',
  chaos: '混沌石',
  annulment: '剥离石',
  divine: '神圣石',
  greater_transmutation: '高级蜕变石',
  perfect_transmutation: '完美蜕变石',
  greater_augmentation: '高级增幅石',
  perfect_augmentation: '完美增幅石',
  greater_regal: '高级富豪石',
  perfect_regal: '完美富豪石',
  greater_exalted: '高级崇高石',
  perfect_exalted: '完美崇高石',
  greater_chaos: '高级混沌石',
  perfect_chaos: '完美混沌石',
}

function currencyRule(currency: CraftCurrency) {
  return Object.hasOwn(CRAFT_CURRENCY_RULES, currency) ? CRAFT_CURRENCY_RULES[currency] : null
}

function currencyLevelError(state: CraftState, currency: CraftCurrency): string | null {
  const rule = currencyRule(currency)
  if (rule === null) return '不支持的通货。'
  return state.itemLevel < rule.minModLevel
    ? `${CRAFT_CURRENCY_LABELS[currency]}要求物品等级至少 ${rule.minModLevel}，当前为 ${state.itemLevel}。`
    : null
}

function failure<T>(error: string): CraftResult<T> {
  return { ok: false, error }
}

function cloneState(state: CraftState): CraftState {
  return {
    ...state,
    ...(state.corruption === undefined
      ? {}
      : { corruption: { ...state.corruption, lines: [...state.corruption.lines] } }),
    ...(state.catalyst === undefined ? {} : { catalyst: { ...state.catalyst } }),
    ...(state.pendingDesecration === undefined
      ? {}
      : { pendingDesecration: clonePendingDesecration(state.pendingDesecration) }),
    affixes: state.affixes.map((affix) => ({ ...affix, lines: [...affix.lines] })),
    ...(state.implicitLines === undefined ? {} : { implicitLines: [...state.implicitLines] }),
    ...(state.sockets === undefined ? {} : { sockets: [...state.sockets] }),
    ...(state.runeSourceLines === undefined ? {} : { runeSourceLines: [...state.runeSourceLines] }),
  }
}

function findBase(catalog: CraftCatalog, id: string): CatalogBase | null {
  return catalog.bases.find((base) => base.id === id) ?? null
}

function baseError(base: CatalogBase): string | null {
  if (base.type === 'Jewel' && !isBasicJewel(base)) return '范围或特殊珠宝暂不支持制作演练。'
  if (base.hidden) return '隐藏基底暂不支持制作演练。'
  if (base.variantList !== undefined) return '带内部变体的基底暂不支持制作演练。'
  if (base.runeforged) return '符文锻造基底暂不支持制作演练。'
  const beltError = beltBaseError(base)
  if (beltError) return beltError
  if (
    (base.charmLimit !== undefined && !isBeltCapacityBase(base)) ||
    base.flask !== undefined ||
    base.charm !== undefined ||
    base.grantedSkillsHaveNoReservation !== undefined
  )
    return '带特殊容量或跨类别规则的基底暂不支持制作演练。'
  if (
    base.implicit !== null &&
    /(?:[+-]\d+\s+(?:Prefix|Suffix) Modifier allowed|Can roll .+ Modifiers)/i.test(base.implicit)
  )
    return '该基底的固有属性会改变词缀容量或类别规则，暂不支持制作演练。'
  if (!SUPPORTED_TYPES.has(base.type) && !isBasicJewel(base)) return '该基底类别暂不支持制作演练。'
  return null
}

function limits(base: CatalogBase, rarity: CraftRarity): { prefix: number; suffix: number } {
  const limit = craftAffixLimit(base, rarity)
  return { prefix: limit, suffix: limit }
}

function eligible(base: CatalogBase, mod: CatalogMod, addedTags: readonly string[]): boolean {
  return hasCraftModEligibility(base, mod, addedTags)
}

function sameExactLines(expected: readonly string[], actual: readonly string[]): boolean {
  if (expected.length !== actual.length) return false
  const remaining = [...actual]
  return expected.every((line) => {
    const index = remaining.indexOf(line)
    if (index < 0) return false
    remaining.splice(index, 1)
    return true
  })
}

export function createCraftState(
  catalog: CraftCatalog,
  input: CraftState,
): CraftResult<CraftState> {
  const base = findBase(catalog, input.baseId)
  if (Object.hasOwn(input, 'corrupted') && input.corrupted !== true)
    return failure('腐化状态只能是明确的 true 或缺省。')
  if (input.corrupted && (base?.type === 'Jewel' || Object.hasOwn(input, 'pendingDesecration')))
    return failure('腐化珠宝及腐化待揭示亵渎状态尚未支持。')
  if (base === null) return failure(`基底 ${input.baseId} 不在制作目录中。`)
  const unsupported = baseError(base)
  if (unsupported !== null) return failure(unsupported)
  if (isBasicJewel(base)) {
    if (jewelSourceHash(catalog) === null) return failure('缺少可信的珠宝词缀来源指纹。')
    if (input.quality !== undefined)
      return failure('珠宝催化剂品质及效果尚未支持，不能作为普通品质处理。')
  }
  if (!Number.isInteger(input.itemLevel) || input.itemLevel < 1 || input.itemLevel > 100)
    return failure('物品等级必须是 1–100 的整数。')
  if (!['normal', 'magic', 'rare'].includes(input.rarity)) return failure('装备稀有度无效。')
  if (input.sourceText !== null && typeof input.sourceText !== 'string')
    return failure('来源文本必须是字符串或 null。')
  if (
    input.quality !== undefined &&
    (!Number.isInteger(input.quality) || input.quality < 0 || input.quality > 30)
  )
    return failure('品质必须是 0–30 的整数。')
  const runeSourceError = runeSourceStateError(input)
  if (runeSourceError !== null) return failure(runeSourceError)
  if (!Array.isArray(input.affixes)) return failure('词缀列表无效。')
  if (
    isBasicJewel(base) &&
    input.rarity !== 'rare' &&
    input.affixes.some((affix) => affix?.crafted)
  )
    return failure('液态情感工艺词缀只支持稀有普通珠宝。')
  if (isBasicJewel(base) && input.affixes.some((affix) => affix?.desecrated))
    return failure('珠宝亵渎来源的特殊制作尚未支持。')
  const implicit = resolveCraftImplicitPatterns(base, input)
  if (!implicit.ok) return implicit
  if (
    !isBeltCapacityBase(base) &&
    input.implicitLines !== undefined &&
    (!Array.isArray(input.implicitLines) ||
      !input.implicitLines.every((line) => typeof line === 'string') ||
      !matchesGrantedSkillImplicitLines(base.implicit?.split('\n') ?? [], input.implicitLines))
  )
    return failure('固有属性与所选基底不一致。')

  if (Object.hasOwn(input, 'pendingDesecration')) {
    if (!isPendingDesecration(input.pendingDesecration)) return failure('待揭示亵渎字段无效。')
    if (
      input.rarity !== 'rare' ||
      input.affixes.some((affix) => affix?.desecrated) ||
      desecrationSourceHash(catalog) === null
    )
      return failure('待揭示亵渎需要可信来源的稀有装备，且不能与已揭示亵渎共存。')
    const boneError = boneBaseError(base, input.itemLevel, input.pendingDesecration.boneId)
    if (boneError) return failure(boneError)
  }
  const resolved: { affix: CraftAffix; mod: CatalogMod }[] = []
  if (input.affixes.filter((affix) => affix?.crafted === true).length > 1)
    return failure('装备最多允许一组工艺词缀。')
  const fracturedCount = input.affixes.filter((affix) => affix?.fractured === true).length
  if (fracturedCount > 1 || (fracturedCount > 0 && input.rarity !== 'rare'))
    return failure('目前只支持稀有装备的一组破裂词缀；破裂魔法装备仅供对比。')
  const desecratedCount = input.affixes.filter((affix) => affix?.desecrated === true).length
  if (desecratedCount > 1) return failure('装备最多允许一组亵渎词缀。')
  if (desecratedCount && (input.rarity !== 'rare' || desecrationSourceHash(catalog) === null))
    return failure('亵渎词缀需要稀有装备与可信的亵渎目录来源指纹。')
  for (const affix of input.affixes) {
    if (
      affix === null ||
      typeof affix !== 'object' ||
      Array.isArray(affix) ||
      !Object.keys(affix).every((key) =>
        ['modId', 'lines', 'crafted', 'desecrated', 'fractured'].includes(key),
      ) ||
      (Object.hasOwn(affix, 'crafted') && affix.crafted !== true) ||
      (Object.hasOwn(affix, 'desecrated') && affix.desecrated !== true) ||
      (Object.hasOwn(affix, 'fractured') && affix.fractured !== true) ||
      (affix.fractured === true && affix.desecrated === true) ||
      (affix.crafted === true && affix.desecrated === true)
    )
      return failure('词缀字段或工艺/亵渎状态无效。')
    const mod = catalog.modifiers.find((entry) => entry.id === affix.modId)
    if (mod === undefined) return failure(`词缀 ${affix.modId} 不在制作目录中。`)
    if (mod.desecratedOnly && !affix.desecrated) return failure('亵渎专属词缀必须保留亵渎来源。')
    if (!Array.isArray(affix.lines) || !affix.lines.every((line) => typeof line === 'string'))
      return failure(`词缀 ${affix.modId} 的属性行与制作目录不一致。`)
    if (
      !(
        isBasicJewel(base) &&
        affix.crafted &&
        jewelCapacityModKind(mod) !== null &&
        isLiquidEmotionMappedMod(catalog, base, mod.id)
      ) &&
      mod.lines.some((line) =>
        /(?:[+-]\d+\s+(?:Prefix|Suffix) Modifier allowed|Can roll .+ Modifiers)/i.test(line),
      )
    )
      return failure(`词缀 ${affix.modId} 包含未支持的容量或跨类别规则。`)
    if (
      mod.lines.some((line) => /modifier magnitudes|effect of (?:prefix|suffix)/i.test(line)) &&
      !(
        isBasicJewel(base) &&
        affix.crafted &&
        jewelEffectModKind(mod) !== null &&
        isLiquidEmotionMappedMod(catalog, base, mod.id)
      )
    )
      return failure('此装备另有尚未核对的词缀增效规则。')
    if (!sameExactLines(mod.lines, affix.lines) && !matchesCatalogLines(mod.lines, affix.lines))
      return failure(`词缀 ${affix.modId} 的属性行与制作目录不一致。`)
    if (
      affix.fractured &&
      readCatalogLineValues(mod.lines, affix.lines)
        ?.flat()
        .some((value) => value === null)
    )
      return failure('破裂词缀必须保留已知实际数值，不能锁定未知范围。')
    resolved.push({ affix, mod })
  }

  const catalystError = catalystStateError(catalog, input)
  if (catalystError) return failure(catalystError)
  const accepted: CatalogMod[] = []
  let prefixes = input.pendingDesecration?.kind === 'prefix' ? 1 : 0
  let suffixes = input.pendingDesecration?.kind === 'suffix' ? 1 : 0
  for (const { affix, mod } of resolved) {
    if (accepted.some((existing) => craftModsConflict(existing, mod)))
      return failure(
        accepted.some((existing) => existing.group === mod.group)
          ? `词缀组 ${mod.group} 重复。`
          : `词缀组 ${mod.group} 与已有技能等级冲突。`,
      )
    // eligibility 描述生成当时的资格；已有词缀不受后来 addsTags 的负向标签追溯影响。
    const validSource =
      isBasicJewel(base) && affix.crafted
        ? isLiquidEmotionMappedMod(catalog, base, mod.id)
        : (affix.desecrated ? eligible(base, mod, []) : hasExistingModEligibility(base, mod)) ||
          (affix.crafted === true && isEssenceMappedMod(catalog, base, mod.id))
    if (!validSource) return failure(`词缀 ${affix.modId} 对该基底无效。`)
    accepted.push(mod)
    if (mod.kind === 'prefix') prefixes += 1
    else suffixes += 1
  }

  const historicalJewel = isBasicJewel(base) && input.rarity === 'rare'
  if (usesJewelCapacity(catalog, input) && liquidEmotionSourceHash(catalog) === null)
    return failure('超过固有 2/2 容量或含增容工艺的珠宝需要可信液态情感来源指纹。')
  const capacity = historicalJewel ? { prefix: 3, suffix: 3 } : limits(base, input.rarity)
  if (historicalJewel && prefixes + suffixes > 5)
    return failure('普通稀有珠宝已有词缀最多每侧 3 组、总计 5 组。')
  if (prefixes > capacity.prefix || suffixes > capacity.suffix) {
    if (input.rarity === 'normal') return failure('普通装备不能带有显式词缀。')
    if (input.rarity === 'magic') return failure('魔法装备最多有 1 条前缀和 1 条后缀。')
    return failure(`稀有装备最多有 ${capacity.prefix} 条前缀和 ${capacity.suffix} 条后缀。`)
  }
  const corruptionError = corruptionStateError(catalog, input)
  if (corruptionError) return failure(corruptionError)
  if (input.corrupted && hasSpecialSocketRules(catalog, input))
    return failure('带特殊孔位规则的腐化装备尚未支持。')
  const socketError = socketStateError(catalog, input)
  if (socketError !== null) return failure(socketError)
  const pendingError = pendingBoneOmenError(
    catalog,
    input,
    (next) => createCraftState(catalog, next).ok,
  )
  if (pendingError) return failure(pendingError)
  return { ok: true, value: cloneState(input) }
}

export function craftCandidates(
  catalog: CraftCatalog,
  state: CraftState,
  currency?: CraftCurrency,
  omen?: CraftOmen,
): CatalogMod[] {
  if (state.corrupted) return []
  if (Object.hasOwn(state, 'pendingDesecration')) return []
  if (craftOmenError(omen, currency) !== null) return []
  const omenRule = omen === undefined ? undefined : CRAFT_OMEN_RULES[omen]
  if (currency !== undefined && currencyLevelError(state, currency) !== null) return []
  const checked = createCraftState(catalog, state)
  if (!checked.ok) return []
  const base = findBase(catalog, state.baseId)
  if (base === null) return []
  const byId = new Map(catalog.modifiers.map((mod) => [mod.id, mod]))
  const existing = state.affixes.flatMap((affix) => {
    const mod = byId.get(affix.modId)
    return mod === undefined ? [] : [mod]
  })
  const occupiedGroups = existing.map((mod) => mod.group)
  const addedTags = existing.flatMap((mod) => mod.addsTags)
  const space = craftAffixSpace(catalog, state)
  const candidates = inspectModPool(
    base,
    catalog.modifiers,
    state.itemLevel,
    occupiedGroups,
    addedTags,
  )
    .filter(({ mod, reasons }) => {
      if (reasons.length > 0 || existing.some((entry) => craftModsConflict(entry, mod)))
        return false
      if (omenRule?.effect === 'add' && omenRule.kind !== null && mod.kind !== omenRule.kind)
        return false
      return space[mod.kind] > 0
    })
    .map(({ mod }) => mod)
  const minimum = currency === undefined ? 0 : (currencyRule(currency)?.minModLevel ?? 0)
  if (minimum === 0) return candidates
  // 最低等级不能排除整个词缀族；仅用当前物等、资格与空位允许的档位计算回退。
  const highest = new Map<string, number>()
  const family = (mod: CatalogMod) => JSON.stringify([mod.kind, mod.group])
  for (const mod of candidates) {
    const key = family(mod)
    highest.set(key, Math.max(highest.get(key) ?? 0, mod.level))
  }
  return candidates.filter((mod) => mod.level >= minimum || mod.level === highest.get(family(mod)))
}

export function addCraftAffix(
  catalog: CraftCatalog,
  state: CraftState,
  modId: string,
  currency?: CraftCurrency,
  omen?: CraftOmen,
): CraftResult<CraftState> {
  if (state.corrupted) return failure(CORRUPTED_CRAFT_MESSAGE)
  if (Object.hasOwn(state, 'pendingDesecration')) return failure(PENDING_DESECRATION_MESSAGE)
  const omenError = craftOmenError(omen, currency)
  if (omenError !== null) return failure(omenError)
  const checked = createCraftState(catalog, state)
  if (!checked.ok) return checked
  const mod = craftCandidates(catalog, checked.value, currency, omen).find(
    (candidate) => candidate.id === modId,
  )
  if (mod === undefined) return failure(`词缀 ${modId} 当前不可添加。`)
  return createCraftState(catalog, {
    ...checked.value,
    affixes: [...checked.value.affixes, { modId: mod.id, lines: [...mod.lines] }],
  })
}

export function removableCraftAffixes(
  catalog: CraftCatalog,
  state: CraftState,
  currency: RemovalCraftCurrency,
  omen?: CraftOmen,
): CraftResult<CraftAffix[]> {
  if (state.corrupted) return failure(CORRUPTED_CRAFT_MESSAGE)
  if (Object.hasOwn(state, 'pendingDesecration')) return failure(PENDING_DESECRATION_MESSAGE)
  const omenError = craftOmenError(omen, currency)
  if (omenError !== null) return failure(omenError)
  const checked = createCraftState(catalog, state)
  if (!checked.ok) return checked
  const rule = currencyRule(currency)
  if (rule === null || (rule.base !== 'chaos' && rule.base !== 'annulment'))
    return failure('不支持的移除通货。')
  const levelError = currencyLevelError(checked.value, currency)
  if (levelError !== null) return failure(levelError)
  if (rule.base === 'chaos' && checked.value.rarity !== 'rare')
    return failure(`${CRAFT_CURRENCY_LABELS[currency]}只能用于稀有装备。`)
  if (!['magic', 'rare'].includes(checked.value.rarity))
    return failure('剥离石只能用于魔法或稀有装备。')
  if (checked.value.affixes.length === 0) return failure('当前装备没有可移除的词缀。')
  let removable = checked.value.affixes.filter(
    (affix) =>
      !affix.fractured &&
      (omen !== 'light' || affix.desecrated === true) &&
      (omen === undefined ||
        CRAFT_OMEN_RULES[omen].kind === null ||
        catalog.modifiers.find((mod) => mod.id === affix.modId)?.kind ===
          CRAFT_OMEN_RULES[omen].kind),
  )
  if (omen === 'light' && removable.length === 0)
    return failure('当前装备没有可移除的已揭示亵渎词缀。')
  if (removable.length === 0) return failure('当前装备或预兆指定侧没有未锁定的可移除词缀。')
  if (omen === 'whittling') {
    const levels = new Map(catalog.modifiers.map((mod) => [mod.id, mod.level]))
    const minimum = Math.min(...removable.map((affix) => levels.get(affix.modId) ?? Infinity))
    removable = removable.filter((affix) => levels.get(affix.modId) === minimum)
  }
  return { ok: true, value: removable.map((affix) => ({ ...affix, lines: [...affix.lines] })) }
}

export function prepareCraftOperation(
  catalog: CraftCatalog,
  state: CraftState,
  currency: CraftCurrency,
  removeModId?: string,
  omen?: CraftOmen,
): CraftResult<{ state: CraftState; count: number }> {
  if (state.corrupted) return failure(CORRUPTED_CRAFT_MESSAGE)
  if (Object.hasOwn(state, 'pendingDesecration')) return failure(PENDING_DESECRATION_MESSAGE)
  const omenError = craftOmenError(omen, currency)
  if (omenError !== null) return failure(omenError)
  const checked = createCraftState(catalog, state)
  if (!checked.ok) return checked
  const current = checked.value
  const rule = currencyRule(currency)
  if (rule === null) return failure('不支持的通货。')
  const levelError = currencyLevelError(current, currency)
  if (levelError !== null) return failure(levelError)
  const baseCurrency = rule.base
  let draft: CraftState
  let count: number
  if (baseCurrency === 'chaos' || baseCurrency === 'annulment') {
    const removable = removableCraftAffixes(
      catalog,
      current,
      currency as RemovalCraftCurrency,
      omen,
    )
    if (!removable.ok) return removable
    if (removeModId === undefined)
      return failure(`${CRAFT_CURRENCY_LABELS[currency]}必须指定一个当前词缀。`)
    if (!removable.value.some((affix) => affix.modId === removeModId))
      return failure(
        omen === undefined
          ? `要移除的词缀 ${removeModId} 不在当前装备上。`
          : '要移除的词缀不在预兆指定侧。',
      )
    draft = {
      ...current,
      affixes: current.affixes
        .filter((affix) => affix.modId !== removeModId)
        .map((affix) => ({ ...affix, lines: [...affix.lines] })),
    }
    count = baseCurrency === 'chaos' ? 1 : 0
  } else if (removeModId !== undefined) {
    return failure(`${CRAFT_CURRENCY_LABELS[currency]}不接受移除词缀参数。`)
  } else if (baseCurrency === 'divine') {
    const base = findBase(catalog, current.baseId)
    if (base && readBaseGrantedSkills(base).length > 0)
      return failure('装备授予技能的等级范围是否参与神圣石重掷尚待真机验收。')
    if (!base) return failure('基底不存在。')
    const implicit = resolveCraftImplicitPatterns(base, current)
    if (!implicit.ok) return implicit
    if (implicit.value.charm && !implicit.value.charm.fixed && implicit.value.charm.range === null)
      return failure(UNKNOWN_CHARM_RANGE)
    const patterns = [
      ...implicit.value.patterns,
      ...current.affixes
        .filter((affix) => omen !== 'blessed' && !affix.fractured)
        .flatMap((affix) => catalog.modifiers.find((mod) => mod.id === affix.modId)?.lines ?? []),
    ]
    const ranges = inspectNumericLines(patterns)
    if (!ranges.ok) return ranges
    if (!ranges.value.some((range) => range.min < range.max))
      return failure('当前装备没有可重掷的数值范围。')
    draft = current
    count = 0
  } else if (baseCurrency === 'transmutation') {
    if (current.rarity !== 'normal')
      return failure(`${CRAFT_CURRENCY_LABELS[currency]}只能用于普通装备。`)
    draft = { ...current, rarity: 'magic' }
    count = 1
  } else if (baseCurrency === 'augmentation') {
    if (current.rarity !== 'magic')
      return failure(`${CRAFT_CURRENCY_LABELS[currency]}只能用于魔法装备。`)
    draft = current
    count = 1
  } else if (baseCurrency === 'regal') {
    if (current.rarity !== 'magic')
      return failure(`${CRAFT_CURRENCY_LABELS[currency]}只能用于魔法装备。`)
    draft = { ...current, rarity: 'rare' }
    count = 1
  } else if (baseCurrency === 'alchemy') {
    if (current.rarity === 'rare') return failure('点金石只能用于普通或魔法装备。')
    draft = { ...current, rarity: 'rare', affixes: [] }
    count = 4
  } else if (baseCurrency === 'exalted') {
    if (current.rarity !== 'rare')
      return failure(`${CRAFT_CURRENCY_LABELS[currency]}只能用于稀有装备。`)
    draft = current
    if (omen === 'catalysing_exaltation') {
      const base = findBase(catalog, current.baseId)
      if (!base || !['Ring', 'Amulet'].includes(base.type))
        return failure('催化崇高预兆当前只支持戒指和项链；珠宝交互尚未核实。')
      if (!current.catalyst || current.catalyst.quality <= 0)
        return failure('催化崇高预兆需要已核对且大于零的催化品质；零品质触发与消费尚未核实。')
      // 草稿消费品质，输入保持不变；后续候选不按催化标签过滤。
      draft = { ...current, catalyst: { ...current.catalyst, quality: 0 } }
    }
    count = omen === undefined ? 1 : (CRAFT_OMEN_RULES[omen].addCount ?? 1)
    if (count === 2) {
      const space = craftAffixSpace(catalog, current)
      const side = omen === undefined ? null : CRAFT_OMEN_RULES[omen].kind
      const free = side === null ? space.total : space[side]
      if (free < 2)
        return failure('强效崇高配置需要至少两个对应侧合法空位；不足时的预兆消费行为尚未核实。')
    }
  } else {
    return failure('不支持的通货。')
  }

  if (count > 0 && craftCandidates(catalog, draft, currency, omen).length === 0) {
    const full = craftAffixSpace(catalog, draft).total === 0
    if (full && draft.rarity === 'rare') return failure('稀有装备词缀已满。')
    if (full && draft.rarity === 'magic') return failure('魔法装备词缀已满。')
    if (rule.minModLevel > 0)
      return failure(
        `${CRAFT_CURRENCY_LABELS[currency]}当前没有可添加的合法词缀（最低词缀等级 ${rule.minModLevel}；已按每族当前可用最高档检查例外）。`,
      )
    return failure('当前状态没有可添加的合法词缀。')
  }
  return { ok: true, value: { state: cloneState(draft), count } }
}

export function applyCraftOperation(
  catalog: CraftCatalog,
  state: CraftState,
  operation: CraftOperation,
): CraftResult<CraftState> {
  if (
    operation === null ||
    typeof operation !== 'object' ||
    Array.isArray(operation) ||
    !Object.keys(operation).every((key) =>
      ['currency', 'modIds', 'removeModId', 'rolls', 'implicitValues', 'omen'].includes(key),
    )
  )
    return failure('通货步骤字段无效。')
  if (Object.hasOwn(operation, 'omen') && operation.omen === undefined)
    return failure('预兆字段无效。')
  if (!Array.isArray(operation.modIds) || !operation.modIds.every((id) => typeof id === 'string'))
    return failure('操作词缀 ID 列表无效。')
  if (
    operation.currency === 'annulment' &&
    (operation.rolls !== undefined || operation.implicitValues !== undefined)
  )
    return failure('剥离石不接受数值参数。')
  if (operation.currency !== 'divine' && operation.implicitValues !== undefined)
    return failure('只有神圣石接受固有属性数值。')
  if (
    operation.rolls !== undefined &&
    (!Array.isArray(operation.rolls) ||
      operation.rolls.length > 6 ||
      !operation.rolls.every(
        (roll) =>
          roll !== null &&
          typeof roll === 'object' &&
          typeof roll.modId === 'string' &&
          validValues(roll.values),
      ))
  )
    return failure('词缀数值参数无效。')
  if (operation.implicitValues !== undefined && !validValues(operation.implicitValues))
    return failure('固有属性数值参数无效。')
  const prepared = prepareCraftOperation(
    catalog,
    state,
    operation.currency,
    operation.removeModId,
    operation.omen,
  )
  if (!prepared.ok) return prepared
  if (operation.modIds.length !== prepared.value.count)
    return failure(
      `${CRAFT_CURRENCY_LABELS[operation.currency]}必须指定 ${prepared.value.count} 条词缀。`,
    )
  let next = prepared.value.state
  for (const modId of operation.modIds) {
    const added = addCraftAffix(catalog, next, modId, operation.currency, operation.omen)
    if (!added.ok) return added
    next = added.value
  }
  if (
    operation.rolls !== undefined ||
    operation.currency === 'divine' ||
    (operation.omen !== undefined && CRAFT_OMEN_RULES[operation.omen].addCount === 2)
  ) {
    const ids =
      operation.currency === 'divine'
        ? next.affixes
            .filter((affix) => operation.omen !== 'blessed' && !affix.fractured)
            .map((affix) => affix.modId)
        : operation.modIds
    const required = new Set<string>()
    for (const id of ids) {
      const mod = catalog.modifiers.find((entry) => entry.id === id)
      if (mod === undefined) return failure(`词缀 ${id} 不在制作目录中。`)
      const ranges = inspectNumericLines(mod.lines)
      if (!ranges.ok) return ranges
      if (ranges.value.length > 0) required.add(id)
    }
    const rolls = operation.rolls ?? []
    if (
      rolls.length !== required.size ||
      new Set(rolls.map((roll) => roll.modId)).size !== rolls.length ||
      rolls.some((roll) => !required.has(roll.modId))
    )
      return failure('数值参数必须完整且唯一覆盖本次所有可重掷词缀，不能包含其他词缀。')
    for (const roll of rolls) {
      const mod = catalog.modifiers.find((entry) => entry.id === roll.modId)
      const affix = next.affixes.find((entry) => entry.modId === roll.modId)
      if (mod === undefined || affix === undefined) return failure('数值对应词缀缺失。')
      const rendered = renderPreservingConstants(mod.lines, affix.lines, roll.values)
      if (!rendered.ok) return rendered
      affix.lines = rendered.value
    }
  }
  if (operation.currency === 'divine') {
    const base = findBase(catalog, next.baseId)
    if (!base) return failure('基底不存在。')
    const implicit = resolveCraftImplicitPatterns(base, next)
    if (!implicit.ok) return implicit
    if (implicit.value.charm && !implicit.value.charm.fixed && implicit.value.charm.range === null)
      return failure(UNKNOWN_CHARM_RANGE)
    const patterns = implicit.value.patterns
    const ranges = inspectNumericLines(patterns)
    if (!ranges.ok) return ranges
    const values = operation.implicitValues ?? []
    const rendered = renderPreservingConstants(patterns, next.implicitLines ?? patterns, values)
    if (!rendered.ok) return rendered
    if (ranges.value.length > 0) next.implicitLines = rendered.value
  }
  return createCraftState(catalog, next)
}

function validValues(values: unknown): values is number[] {
  return (
    Array.isArray(values) &&
    values.length <= 32 &&
    values.every((value) => typeof value === 'number' && Number.isFinite(value))
  )
}

/** 常量行沿用已核对原文，保留高级描述尾注及原有排版。 */
function renderPreservingConstants(
  patterns: readonly string[],
  actual: readonly string[],
  values: readonly number[],
): CraftResult<string[]> {
  const rendered = renderNumericLines(patterns, values)
  if (!rendered.ok) return rendered
  const ranges = inspectNumericLines(patterns)
  if (!ranges.ok) return ranges
  const variableLines = new Set(ranges.value.map((range) => range.lineIndex))
  const hasUnscalable = actual.some((line) => readStatAnnotations(line).unscalable)
  const order = hasUnscalable ? matchCatalogLineOrder(patterns, actual, variableLines) : null
  if (hasUnscalable && order === null) return failure('不可缩放属性行存在歧义，不能安全重掷。')
  const remaining = [...actual]
  return {
    ok: true,
    value: rendered.value.map((line, index) => {
      if (variableLines.has(index)) {
        const source = actual[order?.[index] ?? -1] ?? ''
        return readStatAnnotations(source).unscalable
          ? line + (source.match(UNSCALABLE_SUFFIX)?.[0] ?? ' (unscalable)')
          : line
      }
      const sourceIndex = remaining.findIndex((candidate) =>
        matchesCatalogLines([line], [candidate]),
      )
      return sourceIndex < 0 ? line : (remaining.splice(sourceIndex, 1)[0] ?? line)
    }),
  }
}
