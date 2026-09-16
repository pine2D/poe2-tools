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
]
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

/** 仅授权已核对家族的高级到完美关系；不把名称相似当作通用升级规则。 */
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
  const family = FAMILIES.find((name) => from?.name === `Greater ${name} Rune`)
  if (!from || !family || from.type !== 'Rune')
    return fail('当前仅支持已核对家族的高级符文升级为完美符文。')
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
    (entry) =>
      entry.category === from.category &&
      entry.name === `Perfect ${family} Rune` &&
      entry.type === 'Rune',
  )
  if (!to) return fail('当前装备没有已支持的完美档符文结果。')
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
