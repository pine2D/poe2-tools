import type {
  CraftCatalog,
  CraftState,
  CraftTargetDefinition,
  DefinitionCraftStrategyLeafCondition,
} from '@poe2-tools/item-core'
import { CRAFT_PROPERTY_LABELS, type CraftProperty } from '@poe2-tools/item-core'
import { StrategyPropertyCondition } from './StrategyPropertyCondition'
import { StrategyQualityCondition } from './StrategyQualityCondition'
import { StrategyTargetCondition } from './StrategyTargetCondition'

export const CONDITION_LABELS = {
  quality: '品质类型与范围',
  'item-property': '装备面板范围',
  always: '任何状态',
  rarity: '稀有度',
  'targets-met': '制作目标',
  'selected-targets': '指定目标组',
  'open-prefix': '前缀空位至少',
  'open-suffix': '后缀空位至少',
  'affix-count': '词缀组数至少',
  'desecration-stage': '亵渎阶段',
  'socket-count': '已有孔数范围',
  'open-sockets': '空孔数范围',
} as const
export function defaultCondition(
  kind: DefinitionCraftStrategyLeafCondition['kind'],
  targetIds: readonly string[] = [],
): DefinitionCraftStrategyLeafCondition | null {
  if (kind === 'quality') return { kind, source: 'ordinary', min: 0 }
  if (kind === 'item-property') return { kind, property: 'physicalDps', min: 0 }
  if (kind === 'selected-targets')
    return targetIds[0] ? { kind, targetIds: [targetIds[0]], min: 1, value: true } : null
  if (kind === 'socket-count' || kind === 'open-sockets') return { kind, min: 1, max: 3 }
  if (kind === 'desecration-stage') return { kind, value: 'unrevealed' }
  if (kind === 'always') return { kind }
  if (kind === 'rarity') return { kind, value: 'rare' }
  if (kind === 'targets-met') return { kind, value: false }
  return { kind, min: 1 }
}

interface Props {
  condition: DefinitionCraftStrategyLeafCondition
  prefix: string
  valuePrefix: string
  targets: readonly CraftTargetDefinition[]
  orphanedTargets: readonly CraftTargetDefinition[]
  catalog: CraftCatalog
  state: CraftState
  translateLine?: (line: string) => string | null
  canChange: (condition: DefinitionCraftStrategyLeafCondition | null) => boolean
  onChange: (condition: DefinitionCraftStrategyLeafCondition) => void
}
export function StrategyConditionEditor({
  condition,
  prefix,
  valuePrefix,
  targets,
  orphanedTargets,
  catalog,
  state,
  translateLine,
  canChange,
  onChange,
}: Props) {
  const nextCondition = (kind: DefinitionCraftStrategyLeafCondition['kind']) => {
    if (kind !== 'item-property')
      return defaultCondition(
        kind,
        targets.map((target) => target.targetId),
      )
    if (condition.kind === 'item-property') return condition
    return (
      (Object.keys(CRAFT_PROPERTY_LABELS) as CraftProperty[])
        .map((property) => ({ kind: 'item-property' as const, property, min: 0 }))
        .find(canChange) ?? null
    )
  }
  return (
    <div className="strategy-condition">
      <label>
        {prefix}
        <select
          aria-label={prefix}
          value={condition.kind}
          onChange={(event) => {
            const value = nextCondition(
              event.target.value as DefinitionCraftStrategyLeafCondition['kind'],
            )
            if (value) onChange(value)
          }}
        >
          {(Object.keys(CONDITION_LABELS) as DefinitionCraftStrategyLeafCondition['kind'][]).map(
            (kind) => (
              <option key={kind} value={kind} disabled={!canChange(nextCondition(kind))}>
                {CONDITION_LABELS[kind]}
              </option>
            ),
          )}
        </select>
      </label>
      {condition.kind === 'item-property' ? (
        <StrategyPropertyCondition
          key={JSON.stringify(condition)}
          condition={condition}
          prefix={prefix}
          catalog={catalog}
          state={state}
          canChange={canChange}
          onChange={onChange}
        />
      ) : null}
      {condition.kind === 'quality' ? (
        <StrategyQualityCondition
          key={JSON.stringify(condition)}
          condition={condition}
          prefix={prefix}
          state={state}
          canChange={canChange}
          onChange={onChange}
        />
      ) : null}
      {condition.kind === 'selected-targets' ? (
        <StrategyTargetCondition
          prefix={prefix}
          condition={condition}
          targets={targets}
          orphanedTargets={orphanedTargets}
          catalog={catalog}
          {...(translateLine ? { translateLine } : {})}
          onChange={(value) => onChange(value)}
        />
      ) : null}
      {condition.kind === 'rarity' ? (
        <label>
          稀有度
          <select
            aria-label={`${valuePrefix} 稀有度`}
            value={condition.value}
            onChange={(event) =>
              onChange({
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
            aria-label={`${valuePrefix} 目标状态`}
            value={String(condition.value)}
            onChange={(event) =>
              onChange({
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
            aria-label={`${valuePrefix} 亵渎阶段`}
            value={condition.value}
            onChange={(event) =>
              onChange({
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
            aria-label={`${valuePrefix} 最少词缀组数`}
            value={condition.min}
            onChange={(event) =>
              onChange({
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
      {condition.kind === 'socket-count' || condition.kind === 'open-sockets' ? (
        <>
          <label>
            孔数下限
            <select
              aria-label={`${prefix} 孔数下限`}
              value={condition.min}
              onChange={(event) =>
                onChange({
                  ...condition,
                  min: Number(event.target.value),
                  max: Math.max(condition.max, Number(event.target.value)),
                })
              }
            >
              {[0, 1, 2, 3].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label>
            孔数上限
            <select
              aria-label={`${prefix} 孔数上限`}
              value={condition.max}
              onChange={(event) =>
                onChange({
                  ...condition,
                  max: Number(event.target.value),
                  min: Math.min(condition.min, Number(event.target.value)),
                })
              }
            >
              {[0, 1, 2, 3].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <p>包含上下限；孔位未知时不匹配，已确认零孔按 0 计算。</p>
        </>
      ) : null}
      {condition.kind === 'open-prefix' || condition.kind === 'open-suffix' ? (
        <label>
          数量
          <select
            aria-label={`${prefix} 空位数量`}
            value={condition.min}
            onChange={(event) =>
              onChange({
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
    </div>
  )
}
