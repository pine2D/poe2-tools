import {
  applyFracture,
  type CraftCatalog,
  type CraftState,
  type CraftTargetDefinitions,
  definitionTargetIdsForMods,
  evaluateTargetDefinitions,
  type FractureCraftOperation,
  prepareFracture,
} from '@poe2-tools/item-core'
import { useMemo } from 'react'
import { ModStateBadges } from './ModStateBadges'

interface FracturePanelProps {
  catalog: CraftCatalog
  definitions: CraftTargetDefinitions
  state: CraftState
  label: string
  disabled: boolean
  translateLine?: (line: string) => string | null
  onPreview: (operation: FractureCraftOperation) => void
}

/** 仅展示当前合法候选，选择结果交给父组件的共同草稿与历史。 */
export function FracturePanel({
  catalog,
  definitions,
  state,
  label,
  disabled,
  translateLine,
  onPreview,
}: FracturePanelProps) {
  const prepared = useMemo(() => prepareFracture(catalog, state), [catalog, state])
  return (
    <section className="rehearsal-fracture" aria-label="破裂制作">
      <h3>{label} · 破裂制作</h3>
      <p>破裂会锁定一组词缀及其数值，后续神圣和普通移除跳过该组；已有工艺状态继续保留。</p>
      {!prepared.ok ? (
        <p role="status">{prepared.error}</p>
      ) : (
        <>
          <p>
            游戏随机锁定一组，当前有 {prepared.value.candidates.length}{' '}
            组候选。下面只指定演练结果，不代表游戏可指定，也不提供真实成功率。
          </p>
          {state.pendingDesecration ? (
            <p>未揭示亵渎计入四词缀门槛，但不能被破裂；已固定候选继续保留。</p>
          ) : null}
          <div className="rehearsal-fracture-candidates">
            {prepared.value.candidates.map((affix) => {
              const mod = catalog.modifiers.find((entry) => entry.id === affix.modId)
              const targetId = definitionTargetIdsForMods(definitions, [affix.modId])[0]
              const operation: FractureCraftOperation = {
                kind: 'fracture',
                modId: affix.modId,
                ...(affix.affixId === undefined ? {} : { affixId: affix.affixId }),
              }
              const result = applyFracture(catalog, state, operation)
              const unresolved = !result.ok
              const matched =
                targetId !== undefined &&
                result.ok &&
                evaluateTargetDefinitions(catalog, result.value, {
                  ...definitions,
                  fracturedTargetId: targetId,
                }).matches.some((match) => match.targetId === targetId)
              return (
                <article className="rehearsal-affix" key={affix.affixId ?? affix.modId}>
                  <header>
                    <strong>{mod?.name ?? affix.modId}</strong>
                    <span>{mod?.kind === 'prefix' ? '前缀' : '后缀'}</span>
                  </header>
                  <ModStateBadges states={affix.crafted ? ['crafted'] : []} />
                  {targetId !== undefined && targetId === definitions.fracturedTargetId ? (
                    <p>此组属于当前要求破裂的目标。</p>
                  ) : null}
                  {affix.lines.map((line) => (
                    <div key={line}>
                      {translateLine?.(line) ? <span>{translateLine(line)}</span> : null}
                      <code>{line}</code>
                    </div>
                  ))}
                  {targetId ? (
                    <p>
                      {matched
                        ? '此组身份与数值条件已满足，可演练锁定。'
                        : '此组目标数值尚未达成，破裂后不能再用神圣调整。'}
                    </p>
                  ) : null}
                  {unresolved ? <p>实际数值未知，先核对数值后再演练锁定。</p> : null}
                  <button
                    type="button"
                    disabled={disabled || unresolved}
                    aria-label={`预览破裂 ${affix.modId}`}
                    onClick={() => onPreview(operation)}
                  >
                    预览锁定此组
                  </button>
                </article>
              )
            })}
          </div>
        </>
      )}
    </section>
  )
}
