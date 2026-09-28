import {
  CRAFT_PROPERTY_LABELS,
  type CraftCatalog,
  type CraftPanelGoal,
  type CraftProperty,
  type CraftState,
  craftPanelGoalConflict,
  evaluateCraftPanelGoals,
  readCraftPanelGoals,
  readCraftProperty,
} from '@poe2-tools/item-core'
import './panel-goals.css'
import { StrategyPropertyCondition } from './StrategyPropertyCondition'
import { StrategyWeightedPropertyCondition } from './StrategyWeightedPropertyCondition'

interface Props {
  catalog: CraftCatalog
  state: CraftState
  goals: readonly CraftPanelGoal[]
  busy: boolean
  onChange: (goals: CraftPanelGoal[]) => void
}

export function PanelGoalsEditor({ catalog, state, goals, busy, onChange }: Props) {
  const progress = evaluateCraftPanelGoals(catalog, state, goals)
  const conflict = craftPanelGoalConflict(goals)
  const properties = Object.keys(CRAFT_PROPERTY_LABELS) as CraftProperty[]
  const defaultProperty =
    properties.find((property) => readCraftProperty(catalog, state, property).ok) ?? 'Armour'
  const replace = (index: number, goal: CraftPanelGoal) =>
    goals.map((entry, i) => (i === index ? goal : entry))
  const apply = (next: CraftPanelGoal[]) => {
    const checked = readCraftPanelGoals(next)
    if (!busy && checked.ok) onChange(checked.value)
  }
  return (
    <section aria-label="面板目标" className="panel-goals">
      <h4>面板目标</h4>
      <p>
        设定本件装备的数值条件，与词缀、固有和破裂目标同时满足。可以只设置面板目标，再生成多步示例路线；未知值需先核对，不能当成零。
      </p>
      <fieldset disabled={busy}>
        <legend>编辑面板条件</legend>
        {conflict ? <p role="alert">{conflict}</p> : null}
        <div className="panel-goal-actions">
          <button
            type="button"
            disabled={goals.length >= 8}
            onClick={() =>
              apply([...goals, { kind: 'item-property', property: defaultProperty, min: 0 }])
            }
          >
            添加面板目标
          </button>
          <button
            type="button"
            disabled={goals.length >= 8}
            onClick={() =>
              apply([
                ...goals,
                {
                  kind: 'weighted-properties',
                  terms: [{ property: defaultProperty, weight: 1 }],
                  min: 0,
                },
              ])
            }
          >
            添加加权面板目标
          </button>
        </div>
        {!goals.length ? <p>尚未设置面板目标。</p> : null}
        {progress.statuses.map((status, index) => {
          const prefix = `面板目标 ${index + 1}`
          const props = {
            prefix,
            catalog,
            state,
            canChange: (goal: CraftPanelGoal) => readCraftPanelGoals(replace(index, goal)).ok,
            onChange: (goal: CraftPanelGoal) => apply(replace(index, goal)),
          }
          // 条件或序号改变时重建编辑器，避免保留已删除条件的未应用输入。
          return (
            <article key={`${prefix}:${JSON.stringify(status.goal)}`} aria-label={prefix}>
              <header>
                <strong>{prefix}</strong>
                <span>
                  {status.actual.ok ? (status.matched ? '已达成' : '尚未达成') : '待核对'}
                </span>
              </header>
              {status.goal.kind === 'item-property' ? (
                <StrategyPropertyCondition {...props} condition={status.goal} />
              ) : (
                <StrategyWeightedPropertyCondition {...props} condition={status.goal} />
              )}
              <button
                type="button"
                aria-label={`移除${prefix}`}
                onClick={() => apply(goals.filter((_, i) => i !== index))}
              >
                移除条件
              </button>
            </article>
          )
        })}
      </fieldset>
    </section>
  )
}
