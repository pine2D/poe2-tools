import type { CraftCatalog } from './catalog'
import { type CraftAffix, type CraftResult, type CraftState, createCraftState } from './rehearsal'

export interface CraftAffixSelector {
  modId: string
  affixId?: string
}

export interface IdentifiedCraftAffix extends CraftAffix {
  affixId: string
}
export interface IdentifiedCraftState extends CraftState {
  nextAffixId: number
  affixes: IdentifiedCraftAffix[]
}

function affixNumber(id: unknown): number | null {
  if (typeof id !== 'string' || !/^a[1-9]\d*$/.test(id)) return null
  const number = Number(id.slice(1))
  return Number.isSafeInteger(number) && id === `a${number}` ? number : null
}

/** 身份只描述实例，不改变目录、词缀组或容量的合法性。 */
export function craftAffixIdentityError(state: CraftState): string | null {
  if (!Array.isArray(state.affixes)) return '词缀列表无效。'
  const identified = Object.hasOwn(state, 'nextAffixId')
  if (identified && (!Number.isSafeInteger(state.nextAffixId) || (state.nextAffixId ?? 0) < 1))
    return '词缀实例游标必须是正安全整数。'
  const seen = new Set<string>()
  for (const affix of state.affixes) {
    if (affix === null || typeof affix !== 'object' || Array.isArray(affix))
      return '词缀实例字段无效。'
    if (Object.hasOwn(affix, 'affixId') !== identified)
      return '词缀实例身份必须全部启用或全部缺省，且保留分配游标。'
    if (!identified) continue
    const number = affixNumber(affix.affixId)
    if (number === null || number >= (state.nextAffixId ?? 0))
      return '词缀实例 ID 无效或不小于分配游标。'
    const id = affix.affixId as string
    if (seen.has(id)) return '词缀实例 ID 重复。'
    seen.add(id)
  }
  return null
}

export function enableCraftAffixIdentity(
  catalog: CraftCatalog,
  state: CraftState,
): CraftResult<IdentifiedCraftState> {
  const checked = createCraftState(catalog, state)
  if (!checked.ok) return checked
  if (Object.hasOwn(checked.value, 'nextAffixId'))
    return { ok: true, value: checked.value as IdentifiedCraftState }
  return {
    ok: true,
    value: {
      ...checked.value,
      nextAffixId: checked.value.affixes.length + 1,
      affixes: checked.value.affixes.map((affix, index) => ({
        ...affix,
        affixId: `a${index + 1}`,
      })),
    },
  }
}

export function resolveCraftAffix(
  state: CraftState,
  selector: CraftAffixSelector,
): CraftResult<{ index: number; affix: CraftAffix }> {
  const error = craftAffixIdentityError(state)
  if (error) return { ok: false, error }
  if (selector === null || typeof selector !== 'object' || typeof selector.modId !== 'string')
    return { ok: false, error: '词缀选择必须包含类型 ID。' }
  const byId = Object.hasOwn(selector, 'affixId')
  if (byId && affixNumber(selector.affixId) === null)
    return { ok: false, error: '词缀实例选择 ID 无效。' }
  const matches = state.affixes.flatMap((affix, index) =>
    (byId ? affix.affixId === selector.affixId : affix.modId === selector.modId)
      ? [{ index, affix }]
      : [],
  )
  if (matches.length !== 1)
    return {
      ok: false,
      error:
        matches.length === 0 ? '所选词缀实例不存在。' : '词缀类型匹配多个实例，必须指定实例 ID。',
    }
  const match = matches[0]
  if (!match || match.affix.modId !== selector.modId)
    return { ok: false, error: '词缀实例 ID 与类型 ID 不一致。' }
  return { ok: true, value: match }
}

/** 新实例只从当前快照分配；legacy 模式不产生任何身份字段。 */
export function appendCraftAffix(
  state: CraftState,
  affix: Omit<CraftAffix, 'affixId'>,
): CraftResult<CraftState> {
  const error = craftAffixIdentityError(state)
  if (error) return { ok: false, error }
  const cursor = state.nextAffixId
  if (cursor !== undefined && cursor >= Number.MAX_SAFE_INTEGER)
    return { ok: false, error: '词缀实例游标已耗尽，不能安全分配新实例。' }
  return {
    ok: true,
    value: {
      ...state,
      ...(cursor === undefined ? {} : { nextAffixId: cursor + 1 }),
      affixes: [
        ...state.affixes,
        {
          ...affix,
          lines: [...affix.lines],
          ...(cursor === undefined ? {} : { affixId: `a${cursor}` }),
        },
      ],
    },
  }
}
