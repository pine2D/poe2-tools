import {
  type CraftCatalog,
  type CraftState,
  inspectPerfectFluxCraft,
  type PerfectFluxCraftOperation,
  preparePerfectFluxCraft,
} from '@poe2-tools/item-core'
import { type Ref, useMemo, useState } from 'react'

interface Props {
  catalog: CraftCatalog
  state: CraftState
  disabled: boolean
  configuration?: { previousMaxLevel: number }
  entryRef?: Ref<HTMLElement>
  translateLine?: (line: string) => string | null
  onPreview: (operation: PerfectFluxCraftOperation) => void
}

/** 未知最高级由用户声明；草稿只对完整当前装备和入口配置有效。 */
export function PerfectFluxPanel({
  catalog,
  state,
  disabled,
  configuration,
  entryRef,
  translateLine,
  onPreview,
}: Props) {
  const configuredLevel = configuration?.previousMaxLevel
  const context = useMemo(
    () => ({ catalog, state, disabled, configuredLevel }),
    [catalog, state, disabled, configuredLevel],
  )
  const [draft, setDraft] = useState<{ context: typeof context; value: string } | null>(null)
  const inspected = inspectPerfectFluxCraft(catalog, state)
  const value = draft?.context === context ? draft.value : ''
  const knownLevel = inspected.ok ? inspected.value.previousMaxLevel : null
  const previousMaxLevel = configuredLevel ?? knownLevel ?? (value === '' ? null : Number(value))
  const prepared =
    previousMaxLevel === null ? null : preparePerfectFluxCraft(catalog, state, previousMaxLevel)
  return (
    <details className="essence-catalog essence-craft" open={configuration ? true : undefined}>
      <summary ref={entryRef}>完美溶剂制作</summary>
      <p>消耗 1 颗完美溶剂，将装备固有技能的最高等级升至 20；角色当前使用等级未计算。</p>
      {inspected.ok ? (
        <>
          <p>
            导入／起点观察：<code>{inspected.value.observedLine}</code>
          </p>
          {configuredLevel !== undefined || knownLevel !== null ? (
            <p>
              操作前装备技能最高等级：{previousMaxLevel}（
              {configuredLevel !== undefined ? '指引声明' : '原文已确认'}）
            </p>
          ) : (
            <label>
              操作前装备技能最高等级
              <input
                aria-label="操作前装备技能最高等级"
                type="number"
                min={inspected.value.minimumPreviousMaxLevel}
                max={19}
                step={1}
                value={value}
                disabled={disabled}
                onChange={(event) => setDraft({ context, value: event.target.value })}
              />
              <span>
                原文未确认最高等级，请主动声明 {inspected.value.minimumPreviousMaxLevel}
                –19；不能将显示等级自动当作最高等级。
              </span>
            </label>
          )}
          <p>
            装备技能结果：
            {translateLine?.(`Grants Skill: Level 20 ${inspected.value.skillName}`) ??
              inspected.value.skillName}{' '}
            · 最高等级 20。
          </p>
          {prepared && !prepared.ok ? <p role="alert">{prepared.error}</p> : null}
          <button
            type="button"
            disabled={disabled || !prepared?.ok}
            onClick={() => {
              if (!disabled && prepared?.ok)
                onPreview({
                  kind: 'perfect-flux',
                  previousMaxLevel: prepared.value.previousMaxLevel,
                })
            }}
          >
            预览完美溶剂结果
          </button>
        </>
      ) : (
        <p>{inspected.error}</p>
      )}
    </details>
  )
}
