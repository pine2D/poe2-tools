import type { CraftCatalog } from './catalog'
import { type CraftMaterialCost, collectCraftCosts } from './craftCosts'
import { equivalentProjectJSON } from './craftProjectJSON'
import type { RestoredTargetCraftProject } from './craftProjectTargets'
import { matchesTargetInterval } from './effectiveTargetValues'
import type { ItemDictionary } from './export'
import { analyzeCraftImplicitTargets, type CraftImplicitTargetValues } from './implicitTargets'
import { CRAFT_PROPERTY_LABELS } from './itemProperties'
import { evaluateCraftPanelGoals } from './panelGoals'
import {
  type AffixDifference,
  checkProjectOrigins,
  compareProjectAffixes,
  type ProjectEquipment,
  projectEquipment,
} from './projectEquipment'
import type { CraftResult, CraftState } from './rehearsal'
import { assignCraftTargets, type CraftTargetAssignmentCandidate } from './targetAssignment'
import { findTargetCapacityContext } from './targetCapacityContext'
import { type CraftTargetDefinitions, validateTargetDefinitions } from './targetDefinitions'
import { evaluateTargetDefinitions, inspectCraftTargetInstances } from './targetProgress'
import type { CraftTargetBound } from './targets'
import { loadTargetWorkbenchProject } from './targetWorkbenchProject'

type GoalStatus = '已达成' | '尚未达成' | '待核对'
interface GoalRow {
  label: string
  status: GoalStatus
  detail: string
}
interface ComparisonGoals {
  status: GoalStatus | '未设置目标' | '装备已摧毁'
  detail: string
  rows: GoalRow[]
}

export interface ComparedProject {
  cursor: number
  steps: number
  equipment: ProjectEquipment
  materials: CraftMaterialCost[]
  goals: ComparisonGoals
}
export interface CraftProjectComparison {
  left: ComparedProject
  right: ComparedProject
  sameEquipment: boolean
  affixDifferences: AffixDifference[]
}

function interval(min?: number, max?: number): string {
  if (min === undefined) return `≤ ${max}`
  if (max === undefined) return `≥ ${min}`
  return min === max ? `= ${min}` : `${min}–${max}`
}
function boundsText(bounds: CraftTargetBound[]) {
  return bounds.map((b) => `第 ${b.index + 1} 个数值 ${interval(b.min, b.max)}`).join('，')
}

function projectGoals(
  catalog: CraftCatalog,
  state: CraftState,
  restored: RestoredTargetCraftProject,
): ComparisonGoals {
  if (state.destroyed)
    return { status: '装备已摧毁', rows: [], detail: '此步已没有可供核对目标的装备。' }
  const { targetDefinitions: defs, targetImplicitValues: implicit = [] } = restored.project
  if (!defs.targets.length && !implicit.length && !defs.panelGoals?.length)
    return { status: '未设置目标', detail: '', rows: [] }
  const capacity = findTargetCapacityContext(catalog, restored.states, defs) ?? state
  const checked = validateTargetDefinitions(catalog, state, defs, capacity)
  const explicit = explicitGoals(catalog, state, defs)
  const otherRows = implicitGoalRows(catalog, state, implicit)
  for (const { goal, actual, matched } of evaluateCraftPanelGoals(
    catalog,
    state,
    defs.panelGoals ?? [],
  ).statuses) {
    const label =
      goal.kind === 'item-property'
        ? CRAFT_PROPERTY_LABELS[goal.property]
        : goal.terms.map((t) => `${CRAFT_PROPERTY_LABELS[t.property]} × ${t.weight}`).join(' + ')
    otherRows.push({
      label: `${label} ${interval(goal.min, goal.max)}`,
      status: !actual.ok ? '待核对' : matched ? '已达成' : '尚未达成',
      detail: actual.ok ? `当前 ${actual.value}` : actual.error,
    })
  }
  const detail = [
    explicit.detail,
    checked.ok ? '' : checked.error,
    state.pendingDesecration ? '亵渎词缀尚待揭示。' : '',
  ]
    .filter(Boolean)
    .join(' ')
  const statuses = [checked.ok ? explicit.status : '待核对', ...otherRows.map((row) => row.status)]
  const status =
    state.pendingDesecration || statuses.includes('尚未达成')
      ? '尚未达成'
      : statuses.includes('待核对')
        ? '待核对'
        : '已达成'
  return { status, detail, rows: [...explicit.rows, ...otherRows] }
}

function explicitGoals(
  catalog: CraftCatalog,
  state: CraftState,
  defs: CraftTargetDefinitions,
): { status: GoalStatus; detail: string; rows: GoalRow[] } {
  const progress = evaluateTargetDefinitions(catalog, state, { ...defs, panelGoals: [] })
  const possible: CraftTargetAssignmentCandidate[] = []
  const rows = defs.targets.map(({ targetId, modId }): GoalRow => {
    const alternatives =
      defs.alternatives.find((entry) => entry.targetId === targetId)?.modIds ?? []
    const fractured = targetId === defs.fracturedTargetId
    const match = progress.matches.find((entry) => entry.targetId === targetId)
    const possibleIndexes: number[] = []
    let unknown = false
    const conditions = [modId, ...alternatives].map((id) => {
      const mod = catalog.modifiers.find((entry) => entry.id === id)
      const goal = defs.values.find((entry) => entry.targetId === targetId && entry.modId === id)
      for (const instance of inspectCraftTargetInstances(catalog, state, id, goal, fractured)) {
        if (fractured && !instance.affix.fractured) continue
        if (instance.matched) possibleIndexes.push(instance.index)
        else if (
          goal?.bounds.every((bound) => {
            const actual = instance.actual?.[bound.index]
            return actual == null || matchesTargetInterval(actual, bound)
          })
        ) {
          possibleIndexes.push(instance.index)
          unknown = true
        }
      }
      const label = mod?.name ?? id
      const lines = mod?.lines.join(' / ')
      return [
        label,
        lines,
        goal
          ? `${goal.basis === 'effective' ? '有效值' : '基础值'}，${boundsText(goal.bounds)}`
          : '',
      ]
        .filter(Boolean)
        .join(' · ')
    })
    possible.push({ targetId, affixIndexes: possibleIndexes })
    return {
      label: conditions.join(' 或 '),
      status: match ? '已达成' : unknown ? '待核对' : '尚未达成',
      detail: fractured ? '要求破裂词缀' : '',
    }
  })
  const required = defs.minimumTargetCount ?? defs.targets.length
  const assignment = assignCraftTargets(possible, defs.fracturedTargetId)
  return {
    status: progress.satisfied
      ? '已达成'
      : assignment.requiredMatched && assignment.matches.length >= required
        ? '待核对'
        : '尚未达成',
    detail: defs.targets.length
      ? `显式词缀已匹配 ${progress.matches.length} 组，需要 ${required} 组。`
      : '',
    rows,
  }
}

function implicitGoalRows(
  catalog: CraftCatalog,
  state: CraftState,
  goals: CraftImplicitTargetValues[],
): GoalRow[] {
  const evaluated = analyzeCraftImplicitTargets(catalog, state, goals)
  const base = catalog.bases.find((entry) => entry.id === state.baseId)
  return goals.map((goal, i) => {
    const status = evaluated.ok ? evaluated.value[i] : undefined
    const label =
      goal.kind === 'granted-skill'
        ? '装备技能最高等级'
        : goal.kind === 'granted-skill-sockets'
          ? '技能辅助孔数'
          : (base?.implicit?.split('\n')[goal.lineIndex] ?? `固有属性第 ${goal.lineIndex + 1} 行`)
    return {
      label: `${label} · ${goal.basis === 'effective' ? '有效值，' : ''}${boundsText(goal.bounds)}`,
      status: !status
        ? '待核对'
        : status.matched
          ? '已达成'
          : status.numeric.some((n) => !n.matched && (n.actual !== null || n.actualRange))
            ? '尚未达成'
            : '待核对',
      detail: evaluated.ok
        ? (status?.numeric
            .map(
              (n) =>
                `当前${n.actualRange ? interval(n.actualRange.min, n.actualRange.max) : (n.actual ?? '未知')}`,
            )
            .join('，') ?? '')
        : evaluated.error,
    }
  })
}

function endpoint(
  catalog: CraftCatalog,
  restored: RestoredTargetCraftProject,
): CraftResult<ComparedProject> {
  const { cursor, operations } = restored.project
  const state = restored.states[cursor]
  if (!state) return { ok: false, error: '找不到收藏时的装备步骤。' }
  const materials = collectCraftCosts(catalog, operations.slice(0, cursor))
  if (!materials.ok) return materials
  const equipment = projectEquipment(catalog, state)
  if (!equipment.ok) return equipment
  return {
    ok: true,
    value: {
      cursor,
      steps: operations.length,
      materials: materials.value,
      equipment: equipment.value,
      goals: projectGoals(catalog, state, restored),
    },
  }
}

/** 从两份原始存档独立核对来源及全部操作；不接受外部快照、不恢复工作台。 */
export function compareCraftProjects(
  leftText: string,
  rightText: string,
  catalog: CraftCatalog,
  leftDictionary?: ItemDictionary,
  rightDictionary = leftDictionary,
): CraftResult<CraftProjectComparison> {
  const leftProject = loadTargetWorkbenchProject(leftText, catalog, leftDictionary)
  if (!leftProject.ok) return { ok: false, error: `第一份收藏无法读取。${leftProject.error}` }
  const rightProject = loadTargetWorkbenchProject(rightText, catalog, rightDictionary)
  if (!rightProject.ok) return { ok: false, error: `第二份收藏无法读取。${rightProject.error}` }
  const start = checkProjectOrigins(catalog, leftProject.value.project, rightProject.value.project)
  if (!start.ok) return start
  const left = endpoint(catalog, leftProject.value)
  if (!left.ok) return left
  const right = endpoint(catalog, rightProject.value)
  if (!right.ok) return right
  const first = left.value.equipment
  const second = right.value.equipment
  const destroyed = first.destroyed || second.destroyed
  return {
    ok: true,
    value: {
      left: left.value,
      right: right.value,
      sameEquipment: destroyed
        ? first.destroyed === second.destroyed
        : equivalentProjectJSON(first, second),
      affixDifferences: destroyed ? [] : compareProjectAffixes(first.affixes, second.affixes),
    },
  }
}
