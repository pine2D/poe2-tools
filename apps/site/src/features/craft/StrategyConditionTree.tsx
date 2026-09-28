import type {
  CraftCatalog,
  CraftState,
  CraftTargetDefinition,
  DefinitionCraftStrategyCondition,
} from '@poe2-tools/item-core'
import { StrategyConditionEditor } from './StrategyConditionEditor'

interface Props {
  condition: DefinitionCraftStrategyCondition
  prefix: string
  valuePrefix: string
  catalog: CraftCatalog
  state: CraftState
  targets: readonly CraftTargetDefinition[]
  orphanedTargets: readonly CraftTargetDefinition[]
  translateLine?: (line: string) => string | null
  canChange: (condition: DefinitionCraftStrategyCondition | null) => boolean
  onChange: (condition: DefinitionCraftStrategyCondition) => void
}
/** 路径只用于编辑定位；每个候选变更都由完整规则验证，不保存 UI 状态。 */
export function StrategyConditionTree(props: Props) {
  const { condition, prefix, valuePrefix, canChange, onChange } = props
  const group = condition.kind === 'all' || condition.kind === 'any' || condition.kind === 'not'
  const children =
    condition.kind === 'not'
      ? [condition.condition]
      : condition.kind === 'all' || condition.kind === 'any'
        ? condition.conditions
        : []
  const withChildren = (
    next: DefinitionCraftStrategyCondition[],
  ): DefinitionCraftStrategyCondition =>
    condition.kind === 'not'
      ? { kind: 'not', condition: next[0] ?? { kind: 'always' } }
      : { kind: condition.kind === 'any' ? 'any' : 'all', conditions: next }
  const change = (next: DefinitionCraftStrategyCondition) => {
    if (canChange(next)) onChange(next)
  }
  const added = withChildren([...children, { kind: 'rarity', value: 'rare' }])
  return (
    <div className="strategy-condition-tree">
      {group ? (
        <fieldset className="strategy-condition-group">
          <legend>
            {prefix}：
            {condition.kind === 'not'
              ? '不满足'
              : condition.kind === 'any'
                ? '任一满足'
                : '全部满足'}
          </legend>
          {condition.kind !== 'not' ? (
            <label>
              组合方式
              <select
                aria-label={`${prefix} 组合方式`}
                value={condition.kind}
                onChange={(event) =>
                  change({ kind: event.target.value as 'all' | 'any', conditions: children })
                }
              >
                <option value="all">全部满足</option>
                <option value="any">任一满足</option>
              </select>
            </label>
          ) : (
            <p>下面条件不满足时才匹配；未知不会因取反变为满足。</p>
          )}
          {children.map((child, index) => {
            const replace = (next: DefinitionCraftStrategyCondition) =>
              withChildren(children.map((c, i) => (i === index ? next : c)))
            return (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: 路径定位的受控条件，没有局部组件状态。
                key={index}
              >
                <StrategyConditionTree
                  {...props}
                  condition={child}
                  prefix={`${prefix}.${index + 1}`}
                  valuePrefix={`${prefix}.${index + 1}`}
                  canChange={(next) => next !== null && canChange(replace(next))}
                  onChange={(next) => change(replace(next))}
                />
                {condition.kind !== 'not' ? (
                  <button
                    type="button"
                    aria-label={`删除${prefix}.${index + 1}`}
                    disabled={children.length === 1}
                    onClick={() => change(withChildren(children.filter((_, i) => i !== index)))}
                  >
                    删除子条件
                  </button>
                ) : null}
              </div>
            )
          })}
          {condition.kind !== 'not' ? (
            <button
              type="button"
              aria-label={`添加子条件到${prefix}`}
              disabled={!canChange(added)}
              onClick={() => change(added)}
            >
              添加子条件
            </button>
          ) : null}
          {children.length === 1 ? (
            <button
              type="button"
              aria-label={`解包${prefix}`}
              disabled={!canChange(children[0] ?? null)}
              onClick={() => {
                if (children[0]) change(children[0])
              }}
            >
              解包，保留子条件
            </button>
          ) : null}
        </fieldset>
      ) : (
        <StrategyConditionEditor
          state={props.state}
          condition={condition}
          prefix={prefix}
          valuePrefix={valuePrefix}
          targets={props.targets}
          orphanedTargets={props.orphanedTargets}
          catalog={props.catalog}
          {...(props.translateLine ? { translateLine: props.translateLine } : {})}
          canChange={canChange}
          onChange={change}
        />
      )}
      <div className="strategy-toolbar">
        {(['all', 'any', 'not'] as const).map((kind) => {
          const next: DefinitionCraftStrategyCondition =
            kind === 'not' ? { kind, condition } : { kind, conditions: [condition] }
          const label = kind === 'not' ? '取反' : kind === 'all' ? '包为全部满足' : '包为任一满足'
          return (
            <button
              key={kind}
              type="button"
              aria-label={`将${prefix} ${label}`}
              disabled={!canChange(next)}
              onClick={() => change(next)}
            >
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
