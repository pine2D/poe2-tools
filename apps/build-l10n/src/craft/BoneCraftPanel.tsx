import {
  BONE_RULES,
  type BoneCraftOperation,
  type CatalogMod,
  type CraftBone,
  type CraftCatalog,
  type CraftState,
  type CraftTargetAlternative,
  type CraftTargetValues,
  desecrationCandidates,
  inspectNumericLines,
  isCraftBone,
  prepareDesecration,
  renderNumericLines,
} from '@poe2-tools/item-core'
import { useId, useMemo, useState } from 'react'
import { ModStateBadges } from './ModStateBadges'
import { NumericControls } from './NumericControls'
import './essence-catalog.css'

interface BoneCraftPanelProps {
  catalog: CraftCatalog
  state: CraftState
  translations: Record<string, string>
  translateLine?: (line: string) => string | null
  disabled: boolean
  onPreview: (step: BoneCraftOperation) => void
  targetModIds?: string[]
  targetAlternatives?: CraftTargetAlternative[]
  targetValues?: CraftTargetValues[]
}
export function BoneCraftPanel({
  catalog,
  state,
  translations,
  translateLine,
  disabled,
  onPreview,
  targetModIds = [],
  targetAlternatives = [],
  targetValues = [],
}: BoneCraftPanelProps) {
  const id = useId()
  const [boneId, setBoneId] = useState<CraftBone | null>(null)
  const [kind, setKind] = useState<'prefix' | 'suffix' | null>(null)
  const [removeModId, setRemoveModId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<string[]>([])
  const [reveal, setReveal] = useState<{ modId: string; values: number[] } | null>(null)
  const pending = state.pendingDesecration
  const materials = useMemo(
    () =>
      Object.entries(BONE_RULES).flatMap(([key, rule]) =>
        isCraftBone(key)
          ? [{ id: key, rule, result: prepareDesecration(catalog, state, key) }]
          : [],
      ),
    [catalog, state],
  )
  const candidates = useMemo(
    () => (pending ? desecrationCandidates(catalog, state) : []),
    [catalog, state, pending],
  )
  const byId = useMemo(
    () => new Map(catalog.modifiers.map((mod) => [mod.id, mod])),
    [catalog.modifiers],
  )
  const prepared = materials.find((entry) => entry.id === boneId)?.result
  const removal = removeModId ? byId.get(removeModId) : undefined
  const requiresRemoval = prepared?.ok && prepared.value.requiresRemoval
  const kinds = prepared?.ok
    ? requiresRemoval
      ? removal
        ? [removal.kind]
        : []
      : prepared.value.kinds
    : []
  const affected = (modId: string) =>
    targetModIds.filter(
      (targetId) =>
        targetId === modId ||
        targetAlternatives.some(
          (entry) => entry.targetModId === targetId && entry.modIds.includes(modId),
        ),
    )
  const lostTargets = removeModId ? affected(removeModId) : []
  const riskTargets = prepared?.ok
    ? [...new Set(prepared.value.removableAffixes.flatMap((affix) => affected(affix.modId)))]
    : []
  const selected = reveal ? byId.get(reveal.modId) : undefined
  const needle = query.trim().toLowerCase()
  const matches = candidates.filter((mod) =>
    [
      mod.id,
      mod.name,
      mod.group,
      translations[mod.name],
      ...mod.lines,
      ...mod.lines.map((line) => translateLine?.(line)),
    ].some((text) => text?.toLowerCase().includes(needle)),
  )
  const bounds = targetValues.find((entry) => entry.modId === reveal?.modId)?.bounds
  const meetsBounds =
    reveal &&
    bounds?.every((bound) => {
      const value = reveal.values[bound.index]
      return (
        value !== undefined &&
        Number.isFinite(value) &&
        (bound.min === undefined || value >= bound.min) &&
        (bound.max === undefined || value <= bound.max)
      )
    })
  const lines = (mod: CatalogMod) =>
    mod.lines.map((line, index) => (
      // biome-ignore lint/suspicious/noArrayIndexKey: 目录可包含重复静态行。
      <div className="essence-catalog-line" key={index}>
        {translateLine?.(line) ? <span>{translateLine(line)}</span> : null}
        <code>{line}</code>
      </div>
    ))
  const targetNotice = (modId: string) =>
    affected(modId).length ? (
      <p>对应目标：{affected(modId).join('、')}；数值仍需核对。</p>
    ) : (
      <p>未对应当前普通目标。</p>
    )

  return (
    <section className="essence-catalog essence-craft" aria-label="骨骼与揭示">
      <h3>骨骼与揭示</h3>
      <p>指定结果演练，不代表真实概率。骨骼应用消耗一份材料；固定三项与完成揭示不重复计费。</p>
      {disabled ? <p>请先应用或取消当前草稿。</p> : null}
      {!pending ? (
        <>
          <label>
            骨骼材料
            <select
              aria-label="骨骼材料"
              disabled={disabled}
              value={boneId ?? ''}
              onChange={(event) => {
                const value = event.target.value
                setBoneId(isCraftBone(value) ? value : null)
                setKind(null)
                setRemoveModId(null)
              }}
            >
              <option value="">选择骨骼材料</option>
              {materials.map(({ id, rule, result }) => (
                <option key={id} value={id} disabled={!result.ok}>
                  {translations[rule.name] ?? rule.name} ·{' '}
                  {rule.category === 'weapon'
                    ? '武器与箭袋'
                    : rule.category === 'armour'
                      ? '防具与副手'
                      : '项链、戒指与腰带'}
                  {rule.maxItemLevel === 64 ? ' · 物等不高于64' : ''}
                  {rule.minModLevel === 40 ? ' · 物等至少40，最低词缀等级40' : ''}
                  {!result.ok ? ` · ${result.error}` : ''}
                </option>
              ))}
            </select>
          </label>
          {materials.every((entry) => !entry.result.ok) ? (
            <p>{materials.flatMap(({ result }) => (result.ok ? [] : [result.error]))[0]}</p>
          ) : null}
          {boneId ? (
            <p>
              {BONE_RULES[boneId].minModLevel
                ? '最低词缀等级 40；若一族将被完全排除，保留当前物等下该族最高合法档位。'
                : '没有额外最低词缀等级限制。'}
            </p>
          ) : null}
          {requiresRemoval && prepared?.ok ? (
            <>
              <p>满六组时游戏会随机移除一组词缀；这里指定结果用于演练，不能控制游戏中的移除。</p>
              {riskTargets.length ? (
                <p>随机移除风险中的对应目标词缀：{riskTargets.join('、')}。</p>
              ) : null}
              <fieldset disabled={disabled}>
                <legend>骨骼移除结果</legend>
                {prepared.value.removableAffixes.map((affix) => {
                  const mod = byId.get(affix.modId)
                  return (
                    <label className="essence-removal-option" key={affix.modId}>
                      <input
                        type="radio"
                        name={`${id}-remove`}
                        aria-label={`骨骼移除 ${affix.modId}`}
                        checked={removeModId === affix.modId}
                        onChange={() => {
                          setRemoveModId(affix.modId)
                          setKind(mod?.kind ?? null)
                        }}
                      />
                      <span>
                        {mod?.kind === 'prefix' ? '前缀' : '后缀'} · {affix.modId} ·{' '}
                        {mod ? (translations[mod.name] ?? mod.name) : ''}
                      </span>
                      <span>
                        <ModStateBadges states={affix.crafted ? ['crafted'] : []} />
                      </span>
                      {affix.lines.map((line, index) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: 已有词缀允许重复静态行。
                        <span className="essence-catalog-line" key={index}>
                          {translateLine?.(line) ? <span>{translateLine(line)}</span> : null}
                          <code>{line}</code>
                        </span>
                      ))}
                    </label>
                  )
                })}
              </fieldset>
              {lostTargets.length ? (
                <p>本次指定移除将移除对应目标词缀：{lostTargets.join('、')}；移除整组全部属性。</p>
              ) : null}
            </>
          ) : null}
          {prepared?.ok ? (
            <fieldset disabled={disabled}>
              <legend>亵渎占位侧</legend>
              {(['prefix', 'suffix'] as const).map((side) => (
                <label key={side}>
                  <input
                    type="radio"
                    name={`${id}-side`}
                    aria-label={side === 'prefix' ? '占用前缀' : '占用后缀'}
                    disabled={!kinds.includes(side)}
                    checked={kind === side}
                    onChange={() => setKind(side)}
                  />
                  {side === 'prefix' ? '占用前缀' : '占用后缀'}
                  {!kinds.includes(side) ? '（当前无空位或须先选择移除）' : ''}
                </label>
              ))}
            </fieldset>
          ) : null}
          <button
            type="button"
            disabled={
              disabled ||
              !prepared?.ok ||
              !boneId ||
              !kind ||
              !kinds.includes(kind) ||
              (requiresRemoval && !removeModId)
            }
            onClick={() => {
              if (boneId && kind)
                onPreview({
                  kind: 'desecrate',
                  boneId,
                  affixKind: kind,
                  ...(removeModId ? { removeModId } : {}),
                })
            }}
          >
            预览骨骼结果
          </button>
        </>
      ) : (
        <>
          <p>请先完成亵渎揭示；本工具尚未实现未揭示期间的交错制作。</p>
          {!pending.options ? (
            <>
              <p>从合法候选中指定恰好三项；只固定选项，不会立即获得其中属性。</p>
              <label>
                搜索揭示候选
                <input
                  type="search"
                  aria-label="搜索揭示候选"
                  placeholder="中文、英文或词缀ID"
                  value={query}
                  disabled={disabled}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <p>
                已选择 {options.length}/3；当前有 {candidates.length} 个合法候选。
              </p>
              {options.length ? <p>本次选择：{options.join('、')}</p> : null}
              {candidates.length < 3 ? (
                <p>合法候选不足三项，当前不能固定揭示选项；可撤销骨骼步骤。</p>
              ) : null}
              {/* biome-ignore lint/a11y/noNoninteractiveTabindex: 候选滚动区支持键盘滚动。 */}
              <section className="essence-catalog-list" aria-label="合法揭示候选" tabIndex={0}>
                {matches.slice(0, 60).map((mod) => (
                  <article key={mod.id}>
                    <label>
                      <input
                        type="checkbox"
                        aria-label={`候选 ${mod.id}`}
                        checked={options.includes(mod.id)}
                        disabled={disabled || (!options.includes(mod.id) && options.length === 3)}
                        onChange={() =>
                          setOptions((current) =>
                            current.includes(mod.id)
                              ? current.filter((entry) => entry !== mod.id)
                              : [...current, mod.id],
                          )
                        }
                      />
                      {mod.id} · {translations[mod.name] ?? mod.name}
                    </label>
                    <p>
                      {mod.kind === 'prefix' ? '前缀' : '后缀'} · 等级 {mod.level} ·{' '}
                      {mod.desecratedOnly ? '亵渎专属候选' : '普通候选'}
                    </p>
                    {lines(mod)}
                    {targetNotice(mod.id)}
                  </article>
                ))}
              </section>
              {matches.length > 60 ? (
                <p>显示前60项，请搜索缩小范围；已选候选不会因筛选丢失。</p>
              ) : null}
              {!matches.length ? <p>没有匹配的候选。</p> : null}
              <button
                type="button"
                disabled={disabled || options.length !== 3}
                onClick={() => onPreview({ kind: 'desecration-offer', modIds: [...options] })}
              >
                预览三项候选
              </button>
            </>
          ) : (
            <>
              <h4>已固定三项候选</h4>
              <p>这些选项随项目保存；更换三项需要撤销固定候选这一步。</p>
              <section aria-label="固定揭示选项" className="essence-catalog-list">
                {pending.options.map((modId) => {
                  const mod = byId.get(modId)
                  if (!mod) return <p key={modId}>候选已不在目录中：{modId}</p>
                  return (
                    <article key={mod.id}>
                      <h4>
                        {mod.id} · {translations[mod.name] ?? mod.name}
                      </h4>
                      <p>
                        等级 {mod.level} · {mod.desecratedOnly ? '亵渎专属候选' : '普通候选'}
                      </p>
                      {lines(mod)}
                      {targetNotice(mod.id)}
                      <button
                        type="button"
                        aria-pressed={reveal?.modId === mod.id}
                        disabled={disabled}
                        onClick={() => {
                          const numeric = inspectNumericLines(mod.lines)
                          if (numeric.ok)
                            setReveal({
                              modId: mod.id,
                              values: numeric.value.map((range) => range.min),
                            })
                        }}
                      >
                        选择揭示 {mod.id}
                      </button>
                    </article>
                  )
                })}
              </section>
              {selected && reveal ? (
                <>
                  {affected(selected.id).length && bounds?.length ? (
                    <p>{meetsBounds ? '当前数值满足此目标条件。' : '当前数值不满足此目标条件。'}</p>
                  ) : null}
                  <fieldset disabled={disabled}>
                    <NumericControls
                      label={selected.id}
                      patterns={selected.lines}
                      values={reveal.values}
                      onChange={(values) => setReveal({ ...reveal, values })}
                      {...(translateLine ? { translateLine } : {})}
                    />
                  </fieldset>
                  <button
                    type="button"
                    disabled={disabled || !renderNumericLines(selected.lines, reveal.values).ok}
                    onClick={() =>
                      onPreview({
                        kind: 'desecration-reveal',
                        modId: reveal.modId,
                        values: [...reveal.values],
                      })
                    }
                  >
                    预览揭示结果
                  </button>
                </>
              ) : null}
            </>
          )}
        </>
      )}
    </section>
  )
}
