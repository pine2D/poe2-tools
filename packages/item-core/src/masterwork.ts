import type { CatalogAugment, CraftCatalog } from './catalog'
import { isPlainProjectJSON } from './craftProjectJSON'
import { type CraftResult, type CraftState, createCraftState } from './rehearsal'
import { socketCandidates, socketEffects } from './sockets'

export interface MasterworkCraftOperation {
  kind: 'masterwork'
  socketIndex: number
  fromAugmentId: string
  toAugmentId: string
}
export interface PreparedMasterworkCraft {
  operation: MasterworkCraftOperation
  from: CatalogAugment
  to: CatalogAugment
}
const FAMILIES = [
  'Desert',
  'Glacial',
  'Storm',
  'Iron',
  'Body',
  'Mind',
  'Rebirth',
  'Inspiration',
  'Stone',
  'Vision',
  'Robust',
  'Adept',
  'Resolve',
  'Ward',
  'Charging',
  'Tempered',
]
const upgrades = new Map(
  FAMILIES.flatMap((family) => {
    const tiers = ['Lesser ', '', 'Greater ', ...(family === 'Tempered' ? [] : ['Perfect '])].map(
      (prefix) => `${prefix}${family} Rune`,
    )
    return tiers.slice(0, -1).map((name, index) => [name, tiers[index + 1] as string] as const)
  }),
)
/** 固定家族的相邻档关系；是否有该类别结果仍由镶嵌候选核对。 */
export function masterworkUpgradeName(name: string): string | null {
  return upgrades.get(name) ?? null
}
const SOURCE_HASH = 'd3dac48143209d7d9a02a8c03bd86f21604a0961a8ced49290d6a1d243f8223a'
const fail = (error: string): CraftResult<never> => ({ ok: false, error })

export function isMasterworkCraftOperation(value: unknown): value is MasterworkCraftOperation {
  try {
    if (!isPlainProjectJSON(value)) return false
  } catch {
    return false
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const entry = value as Record<string, unknown>
  return (
    Object.keys(entry).length === 4 &&
    entry.kind === 'masterwork' &&
    typeof entry.socketIndex === 'number' &&
    Number.isSafeInteger(entry.socketIndex) &&
    entry.socketIndex >= 0 &&
    typeof entry.fromAugmentId === 'string' &&
    entry.fromAugmentId.length > 0 &&
    typeof entry.toAugmentId === 'string' &&
    entry.toAugmentId.length > 0
  )
}

/** 仅授权已核对家族的相邻档；不把名称相似当作通用升级规则。 */
export function prepareMasterworkCraft(
  catalog: CraftCatalog,
  state: CraftState,
  socketIndex: number,
): CraftResult<PreparedMasterworkCraft> {
  const checked = createCraftState(catalog, state)
  if (!checked.ok) return checked
  if (Object.hasOwn(state, 'destroyed')) return fail('装备已经摧毁，不能升级符文。')
  if (state.corrupted) return fail('腐化装备上的符文升级交互尚未核实。')
  if (Object.hasOwn(state, 'pendingDesecration')) return fail('待揭示亵渎装备暂不能升级符文。')
  if (
    !Number.isSafeInteger(socketIndex) ||
    socketIndex < 0 ||
    socketIndex >= (state.sockets?.length ?? 0)
  )
    return fail('必须选择一个已核对的现有孔位。')
  if (
    !catalog._meta.sources.some(
      (source) => source.path === 'src/Data/ModRunes.lua' && source.sha256 === SOURCE_HASH,
    )
  )
    return fail('缺少已核对的符文来源，不能升级。')
  const from = socketEffects(catalog, checked.value).find(
    (entry) => entry.socketIndex === socketIndex,
  )?.augment
  const toName = from ? masterworkUpgradeName(from.name) : null
  if (!from || !toName || from.type !== 'Rune')
    return fail('此孔没有可升级的已核对阶级符文，或已达到该家族最高档。')
  const materialCategory = ['wand', 'staff'].includes(from.category) ? 'caster' : from.category
  const material = catalog.augments?.find(
    (entry) => entry.name === 'Masterwork Rune' && entry.category === materialCategory,
  )
  if (
    material?.type !== 'Rune' ||
    material.localMod !== false ||
    material.lines.length !== 1 ||
    material.lines[0] !== 'Upgrades a socketed Rune'
  )
    return fail('缺少对应类别的 Masterwork Rune 材料声明。')
  const to = socketCandidates(catalog, checked.value).find(
    (entry) => entry.category === from.category && entry.name === toName && entry.type === 'Rune',
  )
  if (!to) return fail('当前装备没有已支持的下一档符文结果。')
  return {
    ok: true,
    value: {
      from,
      to,
      operation: { kind: 'masterwork', socketIndex, fromAugmentId: from.id, toAugmentId: to.id },
    },
  }
}

/** 保留装备观察与实例，仅替换指定孔的材料身份；前后身份必须仍对应当前配方。 */
export function applyMasterworkCraft(
  catalog: CraftCatalog,
  state: CraftState,
  operation: MasterworkCraftOperation,
): CraftResult<CraftState> {
  if (!isMasterworkCraftOperation(operation)) return fail('符文升级步骤字段无效。')
  const prepared = prepareMasterworkCraft(catalog, state, operation.socketIndex)
  if (!prepared.ok) return prepared
  if (
    operation.fromAugmentId !== prepared.value.from.id ||
    operation.toAugmentId !== prepared.value.to.id
  )
    return fail('孔内原符文或升级目标已变化，请重新预览。')
  const sockets = [...(state.sockets ?? [])]
  sockets[operation.socketIndex] = prepared.value.to.id
  return createCraftState(catalog, { ...state, sockets })
}
