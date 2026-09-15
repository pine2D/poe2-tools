import {
  craftAffixIdentityError,
  enableCraftAffixIdentity,
  type IdentifiedCraftState,
} from './affixIdentity'
import type { CraftCatalog } from './catalog'
import { type CraftProject, MAX_CRAFT_PROJECT_BYTES, parseCraftProject } from './craftProject'
import type { CraftStep } from './craftSteps'
import type { ItemDictionary } from './export'
import {
  projectStateWithoutIdentity,
  upgradeProjectOperationIdentity,
} from './projectOperationIdentity'
import type { CraftResult, CraftState } from './rehearsal'

export const IDENTITY_CRAFT_RULES_VERSION = 'basic-2026-09-12-v73'

export interface IdentityCraftProject extends Omit<CraftProject, 'rulesVersion' | 'initialState'> {
  rulesVersion: typeof IDENTITY_CRAFT_RULES_VERSION
  initialState: IdentifiedCraftState
}

export interface RestoredIdentityCraftProject {
  project: IdentityCraftProject
  states: IdentifiedCraftState[]
}

function hasCompleteIdentity(state: CraftState): state is IdentifiedCraftState {
  return state.nextAffixId !== undefined && craftAffixIdentityError(state) === null
}

/** 原始旧项目先完整验证，再显式迁移实例；此入口不替代新格式的严格恢复。 */
export function upgradeCraftProjectIdentity(
  text: string,
  catalog: CraftCatalog,
  dictionary: ItemDictionary = {},
): CraftResult<RestoredIdentityCraftProject> {
  const legacy = parseCraftProject(text, catalog, dictionary)
  if (!legacy.ok) return legacy
  const initial = enableCraftAffixIdentity(catalog, legacy.value.project.initialState)
  if (!initial.ok) return initial
  const states = [initial.value]
  const operations: CraftStep[] = []
  let current = initial.value
  for (const [index, operation] of legacy.value.project.operations.entries()) {
    const next = upgradeProjectOperationIdentity(catalog, current, operation)
    if (!next.ok) return { ok: false, error: `第 ${index + 1} 步不能迁移实例：${next.error}` }
    const after = next.value.afterState
    // 状态已由真实操作构造；这里只核对身份，也保留不可再次制作的摧毁终止快照。
    if (!hasCompleteIdentity(after))
      return { ok: false, error: `第 ${index + 1} 步迁移后实例身份不完整或无效。` }
    if (
      JSON.stringify(projectStateWithoutIdentity(after)) !==
      JSON.stringify(legacy.value.states[index + 1])
    )
      return { ok: false, error: `第 ${index + 1} 步迁移前后的装备状态不一致。` }
    operations.push(next.value.operation)
    current = after
    states.push(current)
  }
  const project: IdentityCraftProject = {
    ...legacy.value.project,
    rulesVersion: IDENTITY_CRAFT_RULES_VERSION,
    initialState: initial.value,
    operations,
  }
  const serialized = JSON.stringify(project)
  if (
    serialized.length > MAX_CRAFT_PROJECT_BYTES ||
    new TextEncoder().encode(serialized).byteLength > MAX_CRAFT_PROJECT_BYTES
  )
    return { ok: false, error: '实例升级后的项目超过 2 MB 限制。' }
  return {
    ok: true,
    value: {
      project,
      states,
    },
  }
}
