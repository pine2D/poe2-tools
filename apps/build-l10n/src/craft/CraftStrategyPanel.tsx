import {
  type CraftCatalog,
  type CraftOmen,
  type CraftState,
  type CraftStrategy,
  type CraftStrategyCondition,
  type CraftStrategyGoals,
  type CraftStrategyRule,
  type CraftStrategyWorkAction,
  evaluateCraftStrategy,
  readCraftStrategy,
} from '@poe2-tools/item-core'
import { useEffect, useMemo, useState } from 'react'
import './strategy.css'
import { CraftStrategyActionEditor, strategyActionLabel } from './CraftStrategyActionEditor'
import { defaultCondition } from './StrategyConditionEditor'
import { StrategyConditionTree } from './StrategyConditionTree'
import { StrategyFlowEditor, StrategyRuleStages } from './StrategyFlowEditor'

function example(): CraftStrategy {
  return {
    maxSteps: 50,
    rules: [
      { conditions: [{ kind: 'targets-met', value: true }], action: { kind: 'stop' } },
      {
        conditions: [{ kind: 'rarity', value: 'normal' }],
        action: { kind: 'currency', currency: 'transmutation' },
      },
      {
        conditions: [{ kind: 'rarity', value: 'magic' }],
        action: { kind: 'currency', currency: 'regal' },
      },
      {
        conditions: [{ kind: 'rarity', value: 'rare' }],
        action: { kind: 'currency', currency: 'chaos' },
      },
    ],
  }
}

interface Props {
  stageId?: string
  startStep?: number
  stageError?: string
  onRestart?: () => void
  catalog: CraftCatalog
  translations?: Record<string, string>
  translateLine?: (line: string) => string | null
  state: CraftState
  strategy: CraftStrategy | undefined
  goals: CraftStrategyGoals
  appliedSteps: number
  pending: boolean
  omenLabel: (id: CraftOmen) => string
  onChange: (strategy: CraftStrategy | undefined) => void
  onStart: (action: CraftStrategyWorkAction) => void
}

export function CraftStrategyPanel({
  stageId,
  startStep = 0,
  stageError,
  onRestart,
  catalog,
  translations = {},
  translateLine,
  state,
  strategy,
  goals,
  appliedSteps,
  pending,
  omenLabel,
  onChange,
  onStart,
}: Props) {
  const [limit, setLimit] = useState(String(strategy?.maxSteps ?? 50))
  const [message, setMessage] = useState('')
  useEffect(() => {
    setLimit(String(strategy?.maxSteps ?? 50))
    setMessage('')
  }, [strategy?.maxSteps])
  const evaluated = useMemo(
    () =>
      strategy
        ? evaluateCraftStrategy(catalog, state, strategy, appliedSteps, goals, stageId)
        : null,
    [catalog, state, strategy, appliedSteps, goals, stageId],
  )
  const decision = !stageError && evaluated?.ok ? evaluated.value : null
  const replaceRule = (index: number, rule: CraftStrategyRule) => {
    if (strategy)
      onChange({
        ...strategy,
        rules: strategy.rules.map((entry, i) => (i === index ? rule : entry)),
      })
  }
  const move = (index: number, offset: number) => {
    if (!strategy) return
    const rules = [...strategy.rules]
    const current = rules[index]
    const other = rules[index + offset]
    if (!current || !other) return
    rules[index] = other
    rules[index + offset] = current
    onChange({ ...strategy, rules })
  }
  return (
    <section className="craft-strategy" aria-label="条件制作指引">
      <h3>条件制作指引</h3>
      <p>
        从上到下匹配第一条规则，同条顶层条件需全部满足，可在条件内嵌套全部、任一或取反。每次应用、撤销或恢复后重新判断。
      </p>
      {!strategy ? (
        <button type="button" onClick={() => onChange(example())}>
          启用条件指引示例
        </button>
      ) : (
        <>
          {onRestart ? (
            <StrategyFlowEditor
              strategy={strategy}
              stageId={stageId}
              startStep={startStep}
              onChange={onChange}
              onRestart={onRestart}
            />
          ) : null}
          <p>
            示例：目标达成时停止，普通用蜕变、魔法用富豪、稀有用混沌。可编辑；示例不代表最优策略。步骤结果仍由你指定。
          </p>
          <div className="strategy-toolbar">
            <label>
              指引步骤上限
              <input
                aria-label="指引步骤上限"
                type="number"
                min={1}
                max={1000}
                step={1}
                value={limit}
                onChange={(event) => setLimit(event.target.value)}
              />
            </label>
            <button
              type="button"
              onClick={() => {
                const value = Number(limit)
                if (!Number.isInteger(value) || value < 1 || value > 1000) {
                  setMessage('步骤上限请输入 1–1000 的整数。')
                  return
                }
                setMessage('')
                onChange({ ...strategy, maxSteps: value })
              }}
            >
              更新步骤上限
            </button>
            <button type="button" onClick={() => onChange(undefined)}>
              关闭条件指引
            </button>
          </div>
          <p>
            当前历史已应用 {appliedSteps} 步，上限 {strategy.maxSteps}{' '}
            步，包含启用指引前的操作。草稿和已撤销步骤不计入。
          </p>
          {message ? <p role="alert">{message}</p> : null}
          {decision?.route?.length ? (
            <section aria-label="本次判断路径">
              <p>本次判断路径（不消耗材料）</p>
              <ol>
                {decision.route.map((hop) => (
                  <li key={hop.ruleIndex}>
                    规则 {hop.ruleIndex + 1}：
                    {strategy.flow?.stages.find((stage) => stage.id === hop.from)?.name ?? hop.from}{' '}
                    → {strategy.flow?.stages.find((stage) => stage.id === hop.to)?.name ?? hop.to}
                    {hop.blockedReason ? <p>无法执行：{hop.blockedReason}</p> : null}
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
          <div className="strategy-decision" role="status">
            {stageError ?? (evaluated && !evaluated.ok ? evaluated.error : null)}
            {decision?.kind === 'action' ? (
              <>
                <p>
                  命中规则 {decision.ruleIndex + 1}：
                  {strategyActionLabel(decision.action, catalog, translations, omenLabel)}
                </p>
                <button type="button" disabled={pending} onClick={() => onStart(decision.action)}>
                  开始指引步骤
                </button>
                <p>
                  开始后核对具体结果；应用成功才计入历史和材料。精华、骨骼与符文使用规则配置；揭示继续已有状态，回响在结果选择中声明。
                </p>
              </>
            ) : null}
            {decision?.kind === 'stop' ? (
              <p>
                {decision.reason === 'step-limit'
                  ? '已达步骤上限，条件指引停止。'
                  : `命中规则 ${decision.ruleIndex + 1}：停止。`}
              </p>
            ) : null}
            {decision?.kind === 'unmatched' ? <p>没有规则匹配当前装备。</p> : null}
            {decision?.kind === 'blocked' ? (
              <p>
                {decision.ruleIndex === undefined
                  ? '指引暂不可用'
                  : `规则 ${decision.ruleIndex + 1} 无法开始`}
                ：{decision.message}
              </p>
            ) : null}
            {pending ? <p>有未应用步骤，请先应用、取消，或编辑规则重新判断。</p> : null}
          </div>
          <details>
            <summary>编辑条件规则（{strategy.rules.length} 条）</summary>
            <p>每条规则最多 32 个条件节点、4 层嵌套，每组最多 4 项。未知孔位取反后仍不算满足。</p>
            {strategy.rules.map((rule, index) => {
              const number = index + 1
              const validConditions = (conditions: CraftStrategyCondition[]) =>
                readCraftStrategy({
                  ...strategy,
                  rules: strategy.rules.map((entry, ri) =>
                    ri === index ? { ...rule, conditions } : entry,
                  ),
                }).ok
              const next = (
                [
                  'rarity',
                  'targets-met',
                  'selected-targets',
                  'open-prefix',
                  'open-suffix',
                  'affix-count',
                  'desecration-stage',
                  'socket-count',
                  'open-sockets',
                  'always',
                ] as const
              ).find(
                (kind) =>
                  !rule.conditions.some((entry) => entry.kind === kind) &&
                  (kind !== 'selected-targets' || Boolean(goals.targetModIds?.length)),
              )
              const nextCondition = next ? defaultCondition(next, goals.targetModIds) : null

              const updateCondition = (ci: number, condition: CraftStrategyCondition) =>
                replaceRule(index, {
                  ...rule,
                  conditions: rule.conditions.map((entry, i) => (i === ci ? condition : entry)),
                })
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: 规则按位置展示，字段全部受控且没有独立组件状态。
                <fieldset key={index}>
                  <legend>规则 {number}</legend>
                  {rule.conditions.map((condition, ci) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: 条件按路径定位且完全受控，没有局部状态。
                    <div key={ci}>
                      <StrategyConditionTree
                        condition={condition}
                        prefix={`规则 ${number} 条件 ${ci + 1}`}
                        valuePrefix={`规则 ${number}`}
                        catalog={catalog}
                        targetModIds={goals.targetModIds ?? []}
                        {...(translateLine ? { translateLine } : {})}
                        canChange={(candidate) =>
                          candidate !== null &&
                          validConditions(rule.conditions.map((c, i) => (i === ci ? candidate : c)))
                        }
                        onChange={(candidate) => updateCondition(ci, candidate)}
                      />
                      <button
                        type="button"
                        aria-label={`删除规则 ${number} 条件 ${ci + 1}`}
                        disabled={rule.conditions.length === 1}
                        onClick={() =>
                          replaceRule(index, {
                            ...rule,
                            conditions: rule.conditions.filter((_, i) => i !== ci),
                          })
                        }
                      >
                        删除条件
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    aria-label={`添加条件到规则 ${number}`}
                    disabled={
                      !nextCondition || !validConditions([...rule.conditions, nextCondition])
                    }
                    onClick={() => {
                      if (nextCondition && validConditions([...rule.conditions, nextCondition]))
                        replaceRule(index, {
                          ...rule,
                          conditions: [...rule.conditions, nextCondition],
                        })
                    }}
                  >
                    添加同时满足的条件
                  </button>
                  <StrategyRuleStages
                    strategy={strategy}
                    rule={rule}
                    number={number}
                    onChange={(value) => replaceRule(index, value)}
                  />
                  <div className="strategy-toolbar">
                    <CraftStrategyActionEditor
                      allowJump={Boolean(strategy.flow)}
                      number={number}
                      action={rule.action}
                      catalog={catalog}
                      state={state}
                      translations={translations}
                      omenLabel={omenLabel}
                      onChange={(action) => {
                        const { nextStageId, onBlockedStageId, ...rest } = rule
                        replaceRule(index, {
                          ...rest,
                          action,
                          ...(action.kind !== 'stop' && action.kind !== 'jump' && onBlockedStageId
                            ? { onBlockedStageId }
                            : {}),
                          ...(action.kind === 'jump'
                            ? {
                                nextStageId:
                                  nextStageId ?? rule.stageId ?? strategy.flow?.entryStageId ?? '',
                              }
                            : action.kind !== 'stop' && nextStageId
                              ? { nextStageId }
                              : {}),
                        })
                      }}
                    />
                    <button
                      type="button"
                      aria-label={`上移规则 ${number}`}
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    >
                      上移
                    </button>
                    <button
                      type="button"
                      aria-label={`下移规则 ${number}`}
                      disabled={index === strategy.rules.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      下移
                    </button>
                    <button
                      type="button"
                      aria-label={`删除规则 ${number}`}
                      disabled={strategy.rules.length === 1}
                      onClick={() =>
                        onChange({
                          ...strategy,
                          rules: strategy.rules.filter((_, i) => i !== index),
                        })
                      }
                    >
                      删除规则
                    </button>
                  </div>
                </fieldset>
              )
            })}
            <button
              type="button"
              disabled={strategy.rules.length >= 12}
              onClick={() =>
                onChange({
                  ...strategy,
                  rules: [
                    ...strategy.rules,
                    {
                      ...(strategy.flow ? { stageId: strategy.flow.entryStageId } : {}),
                      conditions: [{ kind: 'always' }],
                      action: { kind: 'stop' },
                    },
                  ],
                })
              }
            >
              添加规则
            </button>
          </details>
        </>
      )}
    </section>
  )
}
