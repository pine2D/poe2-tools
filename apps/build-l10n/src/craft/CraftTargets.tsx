import {
  analyzeAlloyTargetDefinitions,
  analyzeBoneTargetDefinitions,
  analyzeEssencePreparationDefinitions,
  analyzeEssenceTargetDefinitions,
  analyzeTargetDefinitions,
  type CatalogMod,
  CRAFT_CURRENCY_LABELS,
  CRAFT_CURRENCY_RULES,
  type CraftCatalog,
  type CraftDefinitionAdviceStep,
  type CraftImplicitTargetValues,
  type CraftOmen,
  type CraftOperation,
  type CraftPricing,
  type CraftState,
  type CraftStep,
  type CraftTargetDefinitionEdit,
  type CraftTargetDefinitions,
  craftOmenDescription,
  craftTargetDefinitionCandidates,
  type DefinitionEssenceAdviceStep,
  definitionTargetsSatisfied,
  editTargetDefinitions,
  hasCraftModEligibility,
  hasGenesisModEligibility,
  influenceRuneTags,
  inspectCraftAlloys,
  inspectEssences,
  validateCraftFractureTarget,
} from '@poe2-tools/item-core'
import { useMemo, useState } from 'react'
import { AlloyAdvicePanel } from './AlloyAdvicePanel'
import './targets.css'
import { BoneAdvicePanel } from './BoneAdvicePanel'
import { EssenceAdvicePanel } from './EssenceAdvicePanel'
import { EssencePreparationPanel } from './EssencePreparationPanel'
import { ImplicitTargetEditor } from './ImplicitTargetEditor'
import { TargetExtractionPanel } from './TargetExtractionPanel'
import { TargetRoutesPanel } from './TargetRoutesPanel'
import { TargetValueEditor } from './TargetValueEditor'

interface CraftTargetsProps {
  onExtract?: (targets: CraftTargetDefinitions) => void
  pricing?: CraftPricing
  spentSteps?: CraftStep[]
  catalog: CraftCatalog
  state: CraftState
  capacityContext?: CraftState
  capacityHistory?: readonly CraftState[]
  targetImplicitValues?: CraftImplicitTargetValues[]
  onImplicitValuesChange?: (values: CraftImplicitTargetValues[]) => void
  definitions: CraftTargetDefinitions
  onEdit: (edit: CraftTargetDefinitionEdit) => void
  onStart: (step: CraftDefinitionAdviceStep) => void
  onStartEssence: (step: DefinitionEssenceAdviceStep) => void
  onStartPreparation: (operation: CraftOperation) => void
  onPreviewRoute: (operation: CraftStep, continuation?: CraftStep[]) => void
  translations: Record<string, string>
  omen?: CraftOmen
  busy: boolean
  translateLine?: (line: string) => string | null
}

export function CraftTargets({
  onExtract,
  pricing,
  spentSteps,
  catalog,
  state,
  capacityContext,
  capacityHistory,
  definitions,
  onEdit,
  targetImplicitValues = [],
  onImplicitValuesChange,
  onStart,
  onStartEssence,
  onStartPreparation,
  onPreviewRoute,
  translations,
  busy,
  omen,
  translateLine,
}: CraftTargetsProps) {
  const { minimumTargetCount } = definitions
  const targetModIds = definitions.targets.map((target) => target.modId)
  const targetAlternatives = definitions.alternatives.map((entry) => ({
    targetModId:
      definitions.targets.find((target) => target.targetId === entry.targetId)?.modId ?? '',
    modIds: entry.modIds,
  }))
  const [query, setQuery] = useState('')
  const [message, setMessage] = useState('')
  const [showAllSteps, setShowAllSteps] = useState(false)
  const modById = useMemo(
    () => new Map(catalog.modifiers.map((mod) => [mod.id, mod])),
    [catalog.modifiers],
  )
  const source = capacityContext ?? state
  const influence = influenceRuneTags(catalog, source)
  // 无影响来源时沿用静态搜索，不因普通词缀数值和历史游标变化重建全目录候选。
  const poolContext = !influence.ok || influence.value.length > 0 ? source : undefined
  const pool = useMemo(
    () => craftTargetDefinitionCandidates(catalog, state.baseId, poolContext),
    [catalog, state.baseId, poolContext],
  )
  const genesisOnly = useMemo(() => {
    const base = catalog.bases.find((entry) => entry.id === state.baseId)
    return new Set(
      base
        ? catalog.modifiers
            .filter(
              (mod) => hasGenesisModEligibility(base, mod) && !hasCraftModEligibility(base, mod),
            )
            .map((mod) => mod.id)
        : [],
    )
  }, [catalog, state.baseId])
  const essenceSources = useMemo(() => {
    const base = catalog.bases.find((entry) => entry.id === state.baseId)
    const sources = new Map<string, string[]>()
    if (base)
      for (const entry of inspectEssences(catalog, base)) {
        if (!entry.mod) continue
        const names = sources.get(entry.mod.id) ?? []
        names.push(catalog.localizedNames?.['zh-CN']?.[entry.essence.name] ?? entry.essence.name)
        sources.set(entry.mod.id, names)
      }
    return sources
  }, [catalog, state.baseId])
  const alloySources = useMemo(() => {
    const base = catalog.bases.find((entry) => entry.id === state.baseId)
    return new Map(
      base
        ? inspectCraftAlloys(catalog, base).flatMap((entry) =>
            entry.mod
              ? [
                  [
                    entry.mod.id,
                    translations[entry.alloy.name] ??
                      catalog.localizedNames?.['zh-CN']?.[entry.alloy.name] ??
                      entry.alloy.name,
                  ],
                ]
              : [],
          )
        : [],
    )
  }, [catalog, state.baseId, translations])
  const results = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (words.length === 0) return []
    return pool.filter((mod) => {
      const text = [
        mod.id,
        mod.name,
        mod.group,
        ...mod.lines,
        ...mod.lines.map((line) => translateLine?.(line) ?? ''),
      ]
        .join(' ')
        .toLowerCase()
      return words.every((word) => text.includes(word))
    })
  }, [pool, query, translateLine])
  const advice = useMemo(
    () =>
      analyzeTargetDefinitions(
        catalog,
        state,
        definitions,
        omen,
        targetImplicitValues,
        capacityContext,
      ),
    [catalog, state, definitions, omen, targetImplicitValues, capacityContext],
  )
  const boneAdvice = useMemo(
    () => analyzeBoneTargetDefinitions(catalog, state, definitions, capacityContext),
    [catalog, state, definitions, capacityContext],
  )
  const essenceAdvice = useMemo(
    () => analyzeEssenceTargetDefinitions(catalog, state, definitions, capacityContext),
    [catalog, state, definitions, capacityContext],
  )
  const alloyAdvice = useMemo(
    () => analyzeAlloyTargetDefinitions(catalog, state, definitions, capacityContext),
    [catalog, state, definitions, capacityContext],
  )
  const preparationAdvice = useMemo(
    () => analyzeEssencePreparationDefinitions(catalog, state, definitions, capacityContext),
    [catalog, state, definitions, capacityContext],
  )
  const boneSteps = boneAdvice.ok ? boneAdvice.value : []
  const essenceSteps = essenceAdvice.ok ? essenceAdvice.value : []
  const preparationRoutes = preparationAdvice.ok ? preparationAdvice.value.routes : []
  const edit = (change: CraftTargetDefinitionEdit) => {
    const checked = editTargetDefinitions(
      catalog,
      state,
      definitions,
      change,
      capacityContext,
      capacityHistory,
    )
    if (!checked.ok) {
      setMessage(checked.error)
      return
    }
    onEdit(change)
    setMessage(
      change.kind === 'remove' && checked.value.minimumTargetCount !== minimumTargetCount
        ? '目标减少，达成数量已调整为剩余目标数。'
        : '',
    )
  }
  const addTarget = (id: string) => {
    const checked = editTargetDefinitions(
      catalog,
      state,
      definitions,
      { kind: 'add', modId: id },
      capacityContext,
      capacityHistory,
    )
    const mod = modById.get(id)
    if (
      !checked.ok &&
      mod &&
      targetModIds.some((targetId) => modById.get(targetId)?.group === mod.group)
    ) {
      setMessage(`${checked.error} 如需接受不同档位，请在已有目标中勾选可接受的同组档位。`)
      return
    }
    edit({ kind: 'add', modId: id })
  }
  const visibleSteps = useMemo(() => {
    if (!advice.ok) return []
    if (showAllSteps) return advice.value.steps
    const seen = new Set<string>()
    return advice.value.steps.filter((step) => {
      const base = CRAFT_CURRENCY_RULES[step.currency].base
      if (seen.has(base) || seen.size >= 3) return false
      seen.add(base)
      return true
    })
  }, [advice, showAllSteps])
  const totalTargets = targetModIds.length + targetImplicitValues.length
  const matchedTargets = advice.ok
    ? advice.value.targets.filter((t) => t.matched).length +
      (advice.value.implicitTargets?.filter((t) => t.matched).length ?? 0)
    : 0
  const allMatched =
    !state.pendingDesecration &&
    totalTargets > 0 &&
    advice.ok &&
    definitionTargetsSatisfied(advice.value)
  const implicitLabel = (index: number) => {
    const line =
      catalog.bases.find((base) => base.id === state.baseId)?.implicit?.split('\n')[index] ?? ''
    return `固有属性 ${index + 1} · ${translateLine?.(line) ?? line}`
  }
  const modLabel = (id: string) => {
    const mod = modById.get(id)
    if (!mod) return id
    const firstLine = mod.lines[0] ?? ''
    return `${mod.name} · ${translateLine?.(firstLine) ?? firstLine}`
  }
  const targetLabel = (id: string) =>
    modLabel(definitions.targets.find((target) => target.targetId === id)?.modId ?? id)
  const properties = (mod: CatalogMod) => (
    <>
      <strong>{mod.name}</strong>
      {genesisOnly.has(mod.id) ? (
        <span className="target-meta">Genesis Tree 专属 · 支持已有属性</span>
      ) : null}
      {mod.desecratedOnly ? <span className="target-meta">亵渎专属 · 需要骨骼揭示</span> : null}
      {alloySources.has(mod.id) ? (
        <span className="target-meta">合金保证来源：{alloySources.get(mod.id)}</span>
      ) : null}
      {essenceSources.has(mod.id) ? (
        <span className="target-meta">精华保证来源：{essenceSources.get(mod.id)?.join('、')}</span>
      ) : null}
      <span className="target-meta">
        {mod.kind === 'prefix' ? '前缀' : '后缀'} · 目录词缀等级 {mod.level}
      </span>
      {mod.lines.map((line) => (
        <div key={line}>
          {translateLine?.(line) ? <span>{translateLine(line)}</span> : null}
          <code>{line}</code>
        </div>
      ))}
    </>
  )

  return (
    <section className="craft-targets" aria-label="制作目标与下一步">
      <header>
        <h3>制作目标</h3>
        {advice.ok && totalTargets > 0 ? (
          <strong role="status">
            已达成 {matchedTargets} / {totalTargets}
          </strong>
        ) : null}
      </header>
      {onExtract ? (
        <TargetExtractionPanel
          catalog={catalog}
          state={state}
          busy={busy}
          context={definitions}
          onApply={onExtract}
          {...(translateLine ? { translateLine } : {})}
        />
      ) : null}
      {targetModIds.length > 0 ? (
        <label>
          显式目标达成条件
          <select
            aria-label="显式目标达成条件"
            value={minimumTargetCount ?? 'all'}
            onChange={(event) => {
              edit({
                kind: 'minimum',
                count: event.target.value === 'all' ? null : Number(event.target.value),
              })
            }}
          >
            <option value="all">全部显式目标组</option>
            {Array.from({ length: targetModIds.length }, (_, index) => index + 1).map((count) => (
              <option key={count} value={count}>
                至少 {count} 组显式目标
              </option>
            ))}
          </select>
          <span className="target-meta">同组替代档位只计一组；固有条件与指定破裂组始终必选。</span>
        </label>
      ) : null}

      <p>
        同组内任一已选档位及其数值条件满足即达成；勾选破裂要求时还需锁定该组。
        {minimumTargetCount === undefined
          ? '不同目标组需全部达成'
          : `不同目标组至少达成 ${minimumTargetCount} 组`}
        ，更高档位不自动接受。
      </p>
      {onImplicitValuesChange ? (
        <ImplicitTargetEditor
          context={definitions}
          catalog={catalog}
          state={state}
          values={targetImplicitValues}
          onChange={onImplicitValuesChange}
          {...(translateLine ? { translateLine } : {})}
        />
      ) : null}
      <TargetRoutesPanel
        {...(capacityContext ? { capacityContext } : {})}
        {...(pricing ? { pricing } : {})}
        {...(spentSteps ? { spentSteps } : {})}
        catalog={catalog}
        state={state}
        definitions={definitions}
        implicitValues={targetImplicitValues}
        busy={busy}
        translations={translations}
        onPreview={onPreviewRoute}
        {...(translateLine ? { translateLine } : {})}
      />
      {omen ? <p>建议已按本次预兆配置筛选，仅列适配的基础通货。</p> : null}
      <label>
        搜索目标词缀
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="输入中文属性、英文名称或词缀组"
        />
      </label>
      {query.trim() ? (
        <>
          <p>
            匹配 {results.length} 条，显示前 {Math.min(results.length, 30)} 条；可继续输入缩小范围。
          </p>
          <section className="target-search-results" aria-label="目标词缀搜索结果">
            {results.slice(0, 30).map((mod) => {
              const exists = targetModIds.includes(mod.id)
              const canAdd =
                !exists ||
                editTargetDefinitions(
                  catalog,
                  state,
                  definitions,
                  { kind: 'add', modId: mod.id },
                  capacityContext,
                  capacityHistory,
                ).ok
              return (
                <article key={mod.id}>
                  {properties(mod)}
                  <button
                    type="button"
                    aria-label={`加入目标 ${mod.id}`}
                    disabled={!canAdd}
                    onClick={() => addTarget(mod.id)}
                  >
                    {exists ? (canAdd ? '再加入一项目标' : '已加入目标') : '加入目标'}
                  </button>
                </article>
              )
            })}
          </section>
        </>
      ) : (
        <p>输入属性查找目标；可选择完整目录中的档位，具体操作可用性以演练区为准。</p>
      )}
      {message ? (
        <p className="target-warning" role="status">
          {message}
        </p>
      ) : null}
      {!advice.ok ? (
        <p className="target-warning" role="status">
          {advice.error}
        </p>
      ) : null}
      <div className="target-list">
        {definitions.targets.map((target, index) => {
          const mod = modById.get(target.modId)
          const status = advice.ok
            ? advice.value.targets.find((entry) => entry.targetId === target.targetId)
            : undefined
          const selected =
            definitions.alternatives.find((entry) => entry.targetId === target.targetId)?.modIds ??
            []
          return (
            <article key={target.targetId}>
              <span className={status?.matched ? 'target-met' : 'target-meta'}>
                {status ? (status.matched ? '已达成' : '未达成') : '当前无法判断'}
              </span>
              {validateCraftFractureTarget(catalog, targetModIds, targetAlternatives, target.modId)
                .ok ? (
                <label className="target-alternative">
                  <input
                    type="checkbox"
                    aria-label={`要求破裂 ${target.modId}`}
                    checked={definitions.fracturedTargetId === target.targetId}
                    onChange={(event) =>
                      edit({
                        kind: 'fractured',
                        targetId: event.target.checked ? target.targetId : null,
                      })
                    }
                  />
                  要求此组破裂（同组任一已接受档位；每件最多一组）
                </label>
              ) : null}
              {[target.modId, ...selected].map((modId) => {
                const memberMod = modById.get(modId)
                const member =
                  status?.alternatives?.find((entry) => entry.modId === modId) ??
                  (status?.modId === modId ? status : undefined)
                const saved = definitions.values.find(
                  (entry) => entry.targetId === target.targetId && entry.modId === modId,
                )
                return (
                  <section key={modId} aria-label={`目标档位 ${modId}`}>
                    {selected.length ? (
                      <p className={member?.matched ? 'target-met' : 'target-meta'}>
                        {modId === target.modId ? '主档位' : '替代档位'} ·{' '}
                        {member ? (member.matched ? '已达成' : '未达成') : '当前无法判断'}
                      </p>
                    ) : null}
                    {memberMod ? properties(memberMod) : <code>{modId}</code>}
                    {(
                      member?.numeric ??
                      saved?.bounds.map((bound) => ({
                        ...bound,
                        actual: null,
                        matched: false,
                        actualRange: undefined,
                      })) ??
                      []
                    ).map((value) => (
                      <p key={value.index}>
                        {saved?.basis === 'effective' ? '有效' : '基础'}数值 {value.index + 1}：当前{' '}
                        {value.actualRange
                          ? `${value.actualRange.min}–${value.actualRange.max}`
                          : (value.actual ?? '未知')}
                        ；{value.min === undefined ? '' : `至少 ${value.min}`}
                        {value.min !== undefined && value.max !== undefined ? '，' : ''}
                        {value.max === undefined ? '' : `至多 ${value.max}`} ·{' '}
                        {member ? (value.matched ? '达成' : '未达成') : '当前无法判断'}
                      </p>
                    ))}
                    {memberMod ? (
                      <TargetValueEditor
                        {...(capacityContext ? { capacityContext } : {})}
                        catalog={catalog}
                        state={state}
                        definitions={definitions}
                        targetId={target.targetId}
                        mod={memberMod}
                        onEdit={onEdit}
                        {...(translateLine ? { translateLine } : {})}
                      />
                    ) : null}
                    {!status?.matched && member?.reasons.length ? (
                      <ul>
                        {member.reasons.map((reason) => (
                          <li key={reason}>{reason}</li>
                        ))}
                      </ul>
                    ) : null}
                  </section>
                )
              })}
              {mod ? (
                <details>
                  <summary>可接受的同组档位 · {mod.name}</summary>
                  <p>仅明确勾选的档位计入目标；每个档位分别设置数值条件。</p>
                  {pool
                    .filter(
                      (candidate) =>
                        candidate.id !== mod.id &&
                        candidate.kind === mod.kind &&
                        candidate.group === mod.group,
                    )
                    .map((candidate) => (
                      <label key={candidate.id} className="target-alternative">
                        <input
                          type="checkbox"
                          aria-label={`接受档位 ${candidate.id}`}
                          checked={selected.includes(candidate.id)}
                          onChange={(event) =>
                            edit({
                              kind: 'alternatives',
                              targetId: target.targetId,
                              modIds: event.target.checked
                                ? [...selected, candidate.id]
                                : selected.filter((id) => id !== candidate.id),
                            })
                          }
                        />
                        <span>{properties(candidate)}</span>
                      </label>
                    ))}
                </details>
              ) : null}
              {([-1, 1] as const).map((direction) => (
                <button
                  key={direction}
                  type="button"
                  aria-label={`${direction === -1 ? '上移' : '下移'}目标 ${target.modId}`}
                  disabled={
                    index + direction < 0 || index + direction >= definitions.targets.length
                  }
                  onClick={() => {
                    const ids = definitions.targets.map((entry) => entry.targetId)
                    const other = ids[index + direction] as string
                    ids[index + direction] = target.targetId
                    ids[index] = other
                    edit({ kind: 'reorder', targetIds: ids })
                  }}
                >
                  {direction === -1 ? '上移' : '下移'}
                </button>
              ))}
              <button
                type="button"
                aria-label={`移除目标 ${target.modId}`}
                onClick={() => edit({ kind: 'remove', targetId: target.targetId })}
              >
                移除目标
              </button>
            </article>
          )
        })}
      </div>
      {advice.ok && (totalTargets > 0 || state.pendingDesecration) ? (
        <details className="target-advice" open>
          <summary>
            下一步提示 ·{' '}
            {advice.value.steps.length +
              essenceSteps.length +
              preparationRoutes.length +
              boneSteps.length +
              Number(Boolean(advice.value.perfectFluxOperation))}{' '}
            种指定结果
          </summary>
          <p>
            列出可推进目标的受支持通货及精华；请同时核对重掷、移除和重置风险。没有比较概率或价格，也不保证完整路线可达。
          </p>
          {state.pendingDesecration ? (
            <p>当前仍有未揭示亵渎，请先完成候选与揭示；已有目标达成不代表隐藏状态已结束。</p>
          ) : null}
          {allMatched ? (
            <p>
              {minimumTargetCount !== undefined
                ? '数量条件及必选目标均已达成，可停止当前路线。'
                : targetImplicitValues.length
                  ? '所有目标组及固有条件均已达成，可停止当前路线。'
                  : '所有目标组均已达成，可停止当前路线。'}
            </p>
          ) : null}
          {!allMatched &&
          advice.value.steps.length === 0 &&
          !advice.value.perfectFluxOperation &&
          essenceSteps.length === 0 &&
          preparationRoutes.length === 0 &&
          boneSteps.length === 0 ? (
            <p>
              当前没有可直接推进目标的受支持通货、精华或骨骼提示。请检查物等、冲突和目标条件；这不代表所有游戏制作路线都不可行。
            </p>
          ) : null}
          {!boneAdvice.ok ? <p role="status">{boneAdvice.error}</p> : null}
          {advice.value.perfectFluxOperation ? (
            <div className="target-step">
              <p>
                完美溶剂：装备固有技能最高等级 {advice.value.perfectFluxOperation.previousMaxLevel}{' '}
                → 20；消耗1枚。
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (advice.value.perfectFluxOperation)
                    onPreviewRoute(advice.value.perfectFluxOperation)
                }}
              >
                预览建议：完美溶剂
              </button>
            </div>
          ) : null}
          <BoneAdvicePanel
            definitions={definitions}
            catalog={catalog}
            state={state}
            steps={boneSteps}
            translations={translations}
            busy={busy}
            onPreview={onPreviewRoute}
            {...(translateLine ? { translateLine } : {})}
          />
          <EssencePreparationPanel
            definitions={definitions}
            catalog={catalog}
            state={state}
            routes={preparationRoutes}
            truncated={preparationAdvice.ok && preparationAdvice.value.truncated}
            translations={translations}
            busy={busy}
            onStartPreparation={onStartPreparation}
            {...(translateLine ? { translateLine } : {})}
          />
          <AlloyAdvicePanel
            definitions={definitions}
            catalog={catalog}
            state={state}
            steps={alloyAdvice.ok ? alloyAdvice.value : []}
            translations={translations}
            busy={busy}
            onPreview={onPreviewRoute}
            {...(translateLine ? { translateLine } : {})}
          />
          <EssenceAdvicePanel
            definitions={definitions}
            catalog={catalog}
            state={state}
            steps={essenceSteps}
            translations={translations}
            busy={busy}
            onStartEssence={onStartEssence}
            {...(translateLine ? { translateLine } : {})}
          />
          {visibleSteps.map((step) => {
            const currency = CRAFT_CURRENCY_LABELS[step.currency]
            const removal = step.removeModId ? modLabel(step.removeModId) : null
            return (
              <article key={`${step.currency}:${step.removeAffixId ?? step.removeModId ?? ''}`}>
                <h4>
                  {currency}
                  {removal ? ` · 演练移除 ${removal}` : ''}
                </h4>
                {CRAFT_CURRENCY_RULES[step.currency].minModLevel > 0 ? (
                  <p>
                    最低词缀等级 {CRAFT_CURRENCY_RULES[step.currency].minModLevel}
                    ，包含整类低档词缀的最高可用档位例外。
                  </p>
                ) : null}
                <p>
                  {step.currency === 'divine'
                    ? '已有目标数值尚未满足，可重掷这些目标：'
                    : step.currency === 'annulment'
                      ? '指定移除后，可在下一次增幅或崇高中选择：'
                      : '准备本次通货后，可选择以下目标之一：'}
                </p>
                <ul>
                  {step.targetImplicitLineIndexes?.map((index) => (
                    <li key={`implicit:${index}`}>{implicitLabel(index)}</li>
                  ))}
                  {step.targetModIds.map((id) => (
                    <li key={id}>{modLabel(id)}</li>
                  ))}
                </ul>
                {step.currency === 'divine' ? (
                  <p className="target-warning">
                    {step.omen === 'blessed'
                      ? craftOmenDescription('blessed')
                      : '神圣同时重掷显式与固有范围，其他已达成数值条件也可能变差；不保证达到目标。'}
                    {step.rerolledImplicitLineIndexes?.length
                      ? `涉及固有目标：${step.rerolledImplicitLineIndexes.map(implicitLabel).join('；')}`
                      : ''}
                    {step.rerolledTargetIds?.length
                      ? `涉及数值目标：${step.rerolledTargetIds.map(targetLabel).join('；')}`
                      : ''}
                  </p>
                ) : null}
                {step.randomRemovalRisk ? (
                  <p className="target-warning">
                    {step.omen
                      ? craftOmenDescription(step.omen)
                      : '游戏实际随机移除；已有目标没有被保护。'}
                    这里指定移除结果仅用于演练。
                  </p>
                ) : null}
                {step.clearsAll ? (
                  <p className="target-warning">
                    将清除全部已有显式词缀；需依次选择四组，后续每组仍需校验，不能据此保证整套组合可达。
                  </p>
                ) : null}
                {step.lostTargetIds.length > 0 ? (
                  <p className="target-warning">
                    该指定结果会失去已有目标：{step.lostTargetIds.map(targetLabel).join('；')}
                  </p>
                ) : null}
                {step.lostImplicitLineIndexes?.length ? (
                  <p className="target-warning">
                    该指定结果会失去已有固有目标：
                    {step.lostImplicitLineIndexes.map(implicitLabel).join('；')}
                  </p>
                ) : null}
                <button
                  type="button"
                  disabled={busy}
                  aria-label={`演练建议：${currency}${step.removeModId ? `，移除 ${step.removeModId}` : ''}`}
                  onClick={() => onStart(step)}
                >
                  打开{currency}演练
                </button>
              </article>
            )
          })}
          {showAllSteps || advice.value.steps.length > visibleSteps.length ? (
            <button type="button" onClick={() => setShowAllSteps(!showAllSteps)}>
              {showAllSteps
                ? '收起其余建议'
                : `显示其余 ${advice.value.steps.length - visibleSteps.length} 种建议`}
            </button>
          ) : null}
        </details>
      ) : null}
    </section>
  )
}
