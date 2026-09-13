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
} from '@poe2-tools/item-core'
import { useEffect, useMemo, useState } from 'react'
import './strategy.css'
import { CraftStrategyActionEditor, strategyActionLabel } from './CraftStrategyActionEditor'

const CONDITION_LABELS = {
  always: '任何状态',
  rarity: '稀有度',
  'targets-met': '制作目标',
  'open-prefix': '前缀空位至少',
  'open-suffix': '后缀空位至少',
  'affix-count': '词缀组数至少',
  'desecration-stage': '亵渎阶段',
} as const
function defaultCondition(kind: CraftStrategyCondition['kind']): CraftStrategyCondition {
  if (kind === 'desecration-stage') return { kind, value: 'unrevealed' }
  if (kind === 'always') return { kind }
  if (kind === 'rarity') return { kind, value: 'rare' }
  if (kind === 'targets-met') return { kind, value: false }
  return { kind, min: 1 }
}
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
  catalog: CraftCatalog
  translations?: Record<string, string>
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
  catalog,
  translations = {},
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
    () => (strategy ? evaluateCraftStrategy(catalog, state, strategy, appliedSteps, goals) : null),
    [catalog, state, strategy, appliedSteps, goals],
  )
  const decision = evaluated?.ok ? evaluated.value : null
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
      <p>从上到下匹配第一条规则，同条条件需全部满足。每次应用、撤销或恢复后重新判断。</p>
      {!strategy ? (
        <button type="button" onClick={() => onChange(example())}>
          启用条件指引示例
        </button>
      ) : (
        <>
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
          <div className="strategy-decision" role="status">
            {evaluated && !evaluated.ok ? evaluated.error : null}
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
                  开始后选择具体结果；应用成功才计入历史和材料。精华及骨骼施加使用规则配置；揭示继续已有状态，回响在结果选择中声明。
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
            {strategy.rules.map((rule, index) => {
              const number = index + 1
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
                    <div className="strategy-condition" key={condition.kind}>
                      <label>
                        条件 {ci + 1}
                        <select
                          aria-label={`规则 ${number} 条件 ${ci + 1}`}
                          value={condition.kind}
                          onChange={(event) =>
                            updateCondition(
                              ci,
                              defaultCondition(
                                event.target.value as CraftStrategyCondition['kind'],
                              ),
                            )
                          }
                        >
                          {(Object.keys(CONDITION_LABELS) as CraftStrategyCondition['kind'][])
                            .filter(
                              (kind) =>
                                kind === condition.kind ||
                                !rule.conditions.some((entry) => entry.kind === kind),
                            )
                            .map((kind) => (
                              <option key={kind} value={kind}>
                                {CONDITION_LABELS[kind]}
                              </option>
                            ))}
                        </select>
                      </label>
                      {condition.kind === 'rarity' ? (
                        <label>
                          稀有度
                          <select
                            aria-label={`规则 ${number} 稀有度`}
                            value={condition.value}
                            onChange={(event) =>
                              updateCondition(ci, {
                                kind: 'rarity',
                                value: event.target.value as CraftState['rarity'],
                              })
                            }
                          >
                            <option value="normal">普通</option>
                            <option value="magic">魔法</option>
                            <option value="rare">稀有</option>
                          </select>
                        </label>
                      ) : null}
                      {condition.kind === 'targets-met' ? (
                        <label>
                          目标状态
                          <select
                            aria-label={`规则 ${number} 目标状态`}
                            value={String(condition.value)}
                            onChange={(event) =>
                              updateCondition(ci, {
                                kind: 'targets-met',
                                value: event.target.value === 'true',
                              })
                            }
                          >
                            <option value="true">已达成全部设定条件</option>
                            <option value="false">尚未达成（含未设置目标）</option>
                          </select>
                        </label>
                      ) : null}
                      {condition.kind === 'desecration-stage' ? (
                        <label>
                          亵渎阶段
                          <select
                            aria-label={`规则 ${number} 亵渎阶段`}
                            value={condition.value}
                            onChange={(event) =>
                              updateCondition(ci, {
                                kind: 'desecration-stage',
                                value: event.target.value as 'none' | 'unrevealed' | 'offered',
                              })
                            }
                          >
                            <option value="none">无待揭示</option>
                            <option value="unrevealed">尚未固定三项</option>
                            <option value="offered">已固定候选（含回响第二组）</option>
                          </select>
                        </label>
                      ) : null}
                      {condition.kind === 'affix-count' ? (
                        <label>
                          组数
                          <select
                            aria-label={`规则 ${number} 最少词缀组数`}
                            value={condition.min}
                            onChange={(event) =>
                              updateCondition(ci, {
                                kind: 'affix-count',
                                min: Number(event.target.value),
                              })
                            }
                          >
                            {[0, 1, 2, 3, 4, 5, 6].map((n) => (
                              <option key={n} value={n}>
                                {n}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                      {condition.kind === 'open-prefix' || condition.kind === 'open-suffix' ? (
                        <label>
                          数量
                          <select
                            aria-label={`规则 ${number} 条件 ${ci + 1} 空位数量`}
                            value={condition.min}
                            onChange={(event) =>
                              updateCondition(ci, {
                                kind: condition.kind,
                                min: Number(event.target.value),
                              })
                            }
                          >
                            {[1, 2, 3].map((n) => (
                              <option key={n} value={n}>
                                {n}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
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
                    disabled={rule.conditions.length >= 4}
                    onClick={() => {
                      const next = (
                        [
                          'rarity',
                          'targets-met',
                          'open-prefix',
                          'open-suffix',
                          'affix-count',
                          'desecration-stage',
                          'always',
                        ] as const
                      ).find((kind) => !rule.conditions.some((entry) => entry.kind === kind))
                      if (next)
                        replaceRule(index, {
                          ...rule,
                          conditions: [...rule.conditions, defaultCondition(next)],
                        })
                    }}
                  >
                    添加同时满足的条件
                  </button>
                  <div className="strategy-toolbar">
                    <CraftStrategyActionEditor
                      number={number}
                      action={rule.action}
                      catalog={catalog}
                      state={state}
                      translations={translations}
                      omenLabel={omenLabel}
                      onChange={(action) => replaceRule(index, { ...rule, action })}
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
                    { conditions: [{ kind: 'always' }], action: { kind: 'stop' } },
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
