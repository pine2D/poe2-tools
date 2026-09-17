import {
  type CraftCatalog,
  type CraftState,
  inspectSkillSocketsCraft,
  prepareSkillSocketsCraft,
  SKILL_SOCKET_TIERS,
  type SkillSocketsCraftOperation,
  type SkillSocketTier,
} from '@poe2-tools/item-core'
import { type Ref, useMemo, useState } from 'react'

interface FormProps {
  catalog: CraftCatalog
  state: CraftState
  disabled: boolean
  translations?: Record<string, string>
  initialOperation?: SkillSocketsCraftOperation
  locked?: boolean
  prefix?: string
  buttonLabel: string
  onApply: (operation: SkillSocketsCraftOperation) => void
}

/** 声明草稿只属于当前装备；应用前不写入操作、费用或已保存指引。 */
export function SkillSocketsForm({
  catalog,
  state,
  disabled,
  translations = {},
  initialOperation,
  locked = false,
  prefix = '',
  buttonLabel,
  onApply,
}: FormProps) {
  const context = useMemo(
    () => ({ catalog, state, initialOperation }),
    [catalog, state, initialOperation],
  )
  const [draft, setDraft] = useState<{
    context: typeof context
    tier: SkillSocketTier
    previous: string
  } | null>(null)
  const inspected = inspectSkillSocketsCraft(catalog, state)
  if (!inspected.ok) return <p>{inspected.error}</p>
  const active = draft?.context === context ? draft : null
  const tier = locked
    ? (initialOperation?.tier ?? 'lesser')
    : (active?.tier ?? initialOperation?.tier ?? 'lesser')
  const known = inspected.value.previousSockets
  const previous = locked
    ? String(initialOperation?.previousSockets ?? '')
    : (active?.previous ?? String(known ?? initialOperation?.previousSockets ?? ''))
  const prepared =
    previous === '' ? null : prepareSkillSocketsCraft(catalog, state, tier, Number(previous))
  const field = (label: string) => (prefix ? `${prefix} ${label}` : label)
  return (
    <>
      <p>装备固有技能：{inspected.value.skillName}；辅助孔与符文孔、技能等级分别记录。</p>
      <label>
        工匠石档位
        <select
          aria-label={field('工匠石档位')}
          value={tier}
          disabled={disabled || locked}
          onChange={(event) =>
            setDraft({ context, tier: event.target.value as SkillSocketTier, previous })
          }
        >
          {(Object.keys(SKILL_SOCKET_TIERS) as SkillSocketTier[]).map((id) => {
            const entry = SKILL_SOCKET_TIERS[id]
            return (
              <option key={id} value={id}>
                {translations[entry.name] ??
                  catalog.localizedNames?.['zh-CN']?.[entry.name] ??
                  entry.name}
                ：设为 {entry.count} 孔
              </option>
            )
          })}
        </select>
      </label>
      <label>
        操作前技能辅助孔数
        <input
          aria-label={field('操作前技能辅助孔数')}
          type="number"
          min={2}
          max={4}
          step={1}
          value={previous}
          disabled={disabled}
          readOnly={locked || known !== null}
          onChange={(event) => setDraft({ context, tier, previous: event.target.value })}
        />
      </label>
      <p>
        {locked
          ? '操作前孔数采用指引声明，执行时仍核对当前状态。'
          : known !== null
            ? '操作前孔数已由演练历史确认。'
            : '起点辅助孔数未知，请在游戏技能面板核对后声明；不从技能等级或符文孔推断。'}
      </p>
      <p>只消耗 1 颗所选材料，直接设为 {SKILL_SOCKET_TIERS[tier].count} 个辅助孔。</p>
      {prepared && !prepared.ok ? <p role="alert">{prepared.error}</p> : null}
      <button
        type="button"
        disabled={disabled || !prepared?.ok}
        onClick={() => {
          if (!disabled && prepared?.ok)
            onApply({ kind: 'skill-sockets', tier, previousSockets: Number(previous) as 2 | 3 | 4 })
        }}
      >
        {buttonLabel}
      </button>
    </>
  )
}

export function SkillSocketsPanel({
  configuration,
  entryRef,
  onPreview,
  ...props
}: Omit<FormProps, 'buttonLabel' | 'onApply' | 'initialOperation' | 'locked'> & {
  configuration?: SkillSocketsCraftOperation
  entryRef?: Ref<HTMLElement>
  onPreview: (operation: SkillSocketsCraftOperation) => void
}) {
  return (
    <details
      data-craft-tool="skill-sockets"
      className="essence-catalog essence-craft"
      open={configuration ? true : undefined}
    >
      <summary ref={entryRef}>装备技能辅助孔</summary>
      <SkillSocketsForm
        {...props}
        {...(configuration ? { initialOperation: configuration, locked: true } : {})}
        buttonLabel="预览辅助孔结果"
        onApply={onPreview}
      />
    </details>
  )
}
