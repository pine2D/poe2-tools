import {
  analyzeAlloyTargets,
  analyzeBoneTargets,
  analyzeCraftTargets,
  analyzeEssencePreparation,
  analyzeEssenceTargets,
  type CatalogMod,
  CRAFT_CURRENCY_LABELS,
  CRAFT_CURRENCY_RULES,
  type CraftAdviceStep,
  type CraftCatalog,
  type CraftImplicitTargetValues,
  type CraftOmen,
  type CraftOperation,
  type CraftPricing,
  type CraftState,
  type CraftStep,
  type CraftTargetAlternative,
  type CraftTargetValues,
  craftOmenDescription,
  craftTargetCandidates,
  craftTargetsSatisfied,
  type EssenceAdviceStep,
  type ExtractedCraftTargets,
  hasCraftModEligibility,
  hasGenesisModEligibility,
  inspectCraftAlloys,
  inspectEssences,
  validateCraftFractureTarget,
  validateCraftTargetAlternatives,
  validateCraftTargets,
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
  onExtract?: (targets: ExtractedCraftTargets) => void
  minimumTargetCount?: number
  onMinimumTargetCountChange?: (value: number | undefined) => void
  pricing?: CraftPricing
  spentSteps?: CraftStep[]
  catalog: CraftCatalog
  state: CraftState
  targetImplicitValues?: CraftImplicitTargetValues[]
  onImplicitValuesChange?: (values: CraftImplicitTargetValues[]) => void
  targetModIds: string[]
  targetValues: CraftTargetValues[]
  targetAlternatives?: CraftTargetAlternative[]
  targetFracturedModId?: string
  onFracturedTargetChange?: (id: string | undefined) => void
  onAlternativesChange?: (alternatives: CraftTargetAlternative[]) => void
  onValuesChange: (values: CraftTargetValues[]) => void
  onChange: (ids: string[]) => void
  onStart: (step: CraftAdviceStep) => void
  onStartEssence: (step: EssenceAdviceStep) => void
  onStartPreparation: (operation: CraftOperation) => void
  onPreviewRoute: (operation: CraftStep) => void
  translations: Record<string, string>
  omen?: CraftOmen
  busy: boolean
  translateLine?: (line: string) => string | null
}

export function CraftTargets({
  onExtract,
  minimumTargetCount,
  onMinimumTargetCountChange,
  pricing,
  spentSteps,
  catalog,
  state,
  targetModIds,
  targetImplicitValues = [],
  onImplicitValuesChange,
  targetValues,
  targetAlternatives = [],
  targetFracturedModId,
  onFracturedTargetChange,
  onAlternativesChange,
  onValuesChange,
  onChange,
  onStart,
  onStartEssence,
  onStartPreparation,
  onPreviewRoute,
  translations,
  busy,
  omen,
  translateLine,
}: CraftTargetsProps) {
  const [query, setQuery] = useState('')
  const [message, setMessage] = useState('')
  const [showAllSteps, setShowAllSteps] = useState(false)
  const modById = useMemo(
    () => new Map(catalog.modifiers.map((mod) => [mod.id, mod])),
    [catalog.modifiers],
  )
  const pool = useMemo(() => craftTargetCandidates(catalog, state.baseId), [catalog, state.baseId])
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
      analyzeCraftTargets(
        catalog,
        state,
        targetModIds,
        targetValues,
        targetAlternatives,
        omen,
        targetImplicitValues,
        targetFracturedModId,
        minimumTargetCount,
      ),
    [
      catalog,
      state,
      targetModIds,
      targetValues,
      targetAlternatives,
      omen,
      targetImplicitValues,
      targetFracturedModId,
      minimumTargetCount,
    ],
  )
  const boneAdvice = useMemo(
    () =>
      analyzeBoneTargets(catalog, state, targetModIds, targetValues, targetAlternatives, {
        ...(minimumTargetCount === undefined ? {} : { minimumTargetCount }),
        ...(targetFracturedModId === undefined ? {} : { fracturedTargetId: targetFracturedModId }),
      }),
    [
      catalog,
      state,
      targetModIds,
      targetValues,
      targetAlternatives,
      minimumTargetCount,
      targetFracturedModId,
    ],
  )
  const boneSteps = boneAdvice.ok ? boneAdvice.value : []
  const essenceAdvice = useMemo(
    () =>
      analyzeEssenceTargets(catalog, state, targetModIds, targetValues, targetAlternatives, {
        ...(minimumTargetCount === undefined ? {} : { minimumTargetCount }),
        ...(targetFracturedModId === undefined ? {} : { fracturedTargetId: targetFracturedModId }),
      }),
    [
      catalog,
      state,
      targetModIds,
      targetValues,
      targetAlternatives,
      minimumTargetCount,
      targetFracturedModId,
    ],
  )
  const alloyAdvice = useMemo(
    () =>
      analyzeAlloyTargets(catalog, state, targetModIds, targetValues, targetAlternatives, {
        ...(minimumTargetCount === undefined ? {} : { minimumTargetCount }),
        ...(targetFracturedModId === undefined ? {} : { fracturedTargetId: targetFracturedModId }),
      }),
    [
      catalog,
      state,
      targetModIds,
      targetValues,
      targetAlternatives,
      minimumTargetCount,
      targetFracturedModId,
    ],
  )
  const preparationAdvice = useMemo(
    () =>
      analyzeEssencePreparation(catalog, state, targetModIds, targetValues, targetAlternatives, {
        ...(minimumTargetCount === undefined ? {} : { minimumTargetCount }),
        ...(targetFracturedModId === undefined ? {} : { fracturedTargetId: targetFracturedModId }),
      }),
    [
      catalog,
      state,
      targetModIds,
      targetValues,
      targetAlternatives,
      minimumTargetCount,
      targetFracturedModId,
    ],
  )
  const preparationRoutes = preparationAdvice.ok ? preparationAdvice.value.routes : []
  const essenceSteps = essenceAdvice.ok ? essenceAdvice.value : []
  const addTarget = (id: string) => {
    const mod = modById.get(id)
    if (mod && targetModIds.some((targetId) => modById.get(targetId)?.group === mod.group)) {
      setMessage('同组已有目标；请在已有目标中勾选可接受的同组档位。')
      return
    }
    const checked = validateCraftTargets(
      catalog,
      state.baseId,
      [...targetModIds, id],
      minimumTargetCount,
      targetFracturedModId,
    )
    if (!checked.ok) {
      setMessage(checked.error)
      return
    }
    onChange(checked.value)
    setMessage('')
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
    craftTargetsSatisfied(advice.value, minimumTargetCount, targetFracturedModId)
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
          onApply={onExtract}
          {...(translateLine ? { translateLine } : {})}
        />
      ) : null}
      {targetModIds.length > 0 && onMinimumTargetCountChange ? (
        <label>
          显式目标达成条件
          <select
            aria-label="显式目标达成条件"
            value={minimumTargetCount ?? 'all'}
            onChange={(event) => {
              const required = event.target.value === 'all' ? undefined : Number(event.target.value)
              const checked = validateCraftTargets(
                catalog,
                state.baseId,
                targetModIds,
                required,
                targetFracturedModId,
              )
              if (!checked.ok) {
                setMessage(checked.error)
                return
              }
              onMinimumTargetCountChange(required)
              setMessage('')
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
          catalog={catalog}
          state={state}
          values={targetImplicitValues}
          onChange={onImplicitValuesChange}
          {...(translateLine ? { translateLine } : {})}
        />
      ) : null}
      <TargetRoutesPanel
        {...(minimumTargetCount === undefined ? {} : { minimumTargetCount })}
        {...(pricing ? { pricing } : {})}
        {...(spentSteps ? { spentSteps } : {})}
        catalog={catalog}
        state={state}
        ids={targetModIds}
        values={targetValues}
        alternatives={targetAlternatives}
        implicitValues={targetImplicitValues}
        {...(targetFracturedModId === undefined ? {} : { targetFracturedModId })}
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
            {results.slice(0, 30).map((mod) => (
              <article key={mod.id}>
                {properties(mod)}
                <button
                  type="button"
                  aria-label={`加入目标 ${mod.id}`}
                  disabled={targetModIds.includes(mod.id)}
                  onClick={() => addTarget(mod.id)}
                >
                  {targetModIds.includes(mod.id) ? '已加入目标' : '加入目标'}
                </button>
              </article>
            ))}
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
      ) : (
        <>
          <div className="target-list">
            {advice.value.targets.map((target) => {
              const mod = modById.get(target.modId)
              return (
                <article key={target.modId}>
                  <span className={target.matched ? 'target-met' : 'target-meta'}>
                    {target.matched ? '已达成' : '未达成'}
                  </span>
                  {onFracturedTargetChange &&
                  validateCraftFractureTarget(
                    catalog,
                    targetModIds,
                    targetAlternatives,
                    target.modId,
                  ).ok ? (
                    <label className="target-alternative">
                      <input
                        type="checkbox"
                        aria-label={`要求破裂 ${target.modId}`}
                        checked={targetFracturedModId === target.modId}
                        onChange={(event) => {
                          const required = event.target.checked ? target.modId : undefined
                          const combined = validateCraftTargets(
                            catalog,
                            state.baseId,
                            targetModIds,
                            minimumTargetCount,
                            required,
                          )
                          if (!combined.ok) {
                            setMessage(combined.error)
                            return
                          }
                          onFracturedTargetChange(required)
                          setMessage('')
                        }}
                      />
                      要求此组破裂（同组任一已接受档位；每件最多一组）
                    </label>
                  ) : null}
                  {(target.alternatives ?? [target]).map((member) => {
                    const memberMod = modById.get(member.modId)
                    return (
                      <section key={member.modId} aria-label={`目标档位 ${member.modId}`}>
                        {target.alternatives ? (
                          <p className={member.matched ? 'target-met' : 'target-meta'}>
                            {member.modId === target.modId ? '主档位' : '替代档位'} ·{' '}
                            {member.matched ? '已达成' : '未达成'}
                          </p>
                        ) : null}
                        {memberMod ? properties(memberMod) : <code>{member.modId}</code>}
                        {member.numeric.map((value) => (
                          <p key={value.index}>
                            {targetValues.find((entry) => entry.modId === member.modId)?.basis ===
                            'effective'
                              ? '有效'
                              : '基础'}
                            数值 {value.index + 1}：当前{' '}
                            {value.actualRange
                              ? `${value.actualRange.min}–${value.actualRange.max}`
                              : (value.actual ?? '未知')}
                            ；{value.min === undefined ? '' : `至少 ${value.min}`}
                            {value.min !== undefined && value.max !== undefined ? '，' : ''}
                            {value.max === undefined ? '' : `至多 ${value.max}`} ·{' '}
                            {value.matched ? '达成' : '未达成'}
                          </p>
                        ))}
                        {memberMod ? (
                          <TargetValueEditor
                            {...(minimumTargetCount === undefined ? {} : { minimumTargetCount })}
                            key={`${member.modId}:${JSON.stringify(targetValues.find((entry) => entry.modId === member.modId) ?? null)}`}
                            catalog={catalog}
                            baseId={state.baseId}
                            state={state}
                            ids={targetModIds}
                            alternatives={targetAlternatives}
                            values={targetValues}
                            mod={memberMod}
                            onChange={onValuesChange}
                            {...(translateLine === undefined ? {} : { translateLine })}
                          />
                        ) : null}
                        {!target.matched && member.reasons.length > 0 ? (
                          <ul>
                            {member.reasons.map((reason) => (
                              <li key={reason}>{reason}</li>
                            ))}
                          </ul>
                        ) : null}
                      </section>
                    )
                  })}
                  {mod && onAlternativesChange ? (
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
                        .map((candidate) => {
                          const selected =
                            targetAlternatives.find((entry) => entry.targetModId === mod.id)
                              ?.modIds ?? []
                          return (
                            <label key={candidate.id} className="target-alternative">
                              <input
                                type="checkbox"
                                aria-label={`接受档位 ${candidate.id}`}
                                checked={selected.includes(candidate.id)}
                                onChange={(event) => {
                                  const modIds = event.target.checked
                                    ? [...selected, candidate.id]
                                    : selected.filter((id) => id !== candidate.id)
                                  const next = targetAlternatives.filter(
                                    (entry) => entry.targetModId !== mod.id,
                                  )
                                  if (modIds.length) next.push({ targetModId: mod.id, modIds })
                                  const checked = validateCraftTargetAlternatives(
                                    catalog,
                                    state.baseId,
                                    targetModIds,
                                    next,
                                    minimumTargetCount,
                                  )
                                  if (!checked.ok) {
                                    setMessage(checked.error)
                                    return
                                  }
                                  if (targetFracturedModId) {
                                    const fracture = validateCraftFractureTarget(
                                      catalog,
                                      targetModIds,
                                      checked.value,
                                      targetFracturedModId,
                                    )
                                    if (!fracture.ok) {
                                      setMessage(fracture.error)
                                      return
                                    }
                                  }
                                  onAlternativesChange(checked.value)
                                  setMessage('')
                                }}
                              />
                              <span>{properties(candidate)}</span>
                            </label>
                          )
                        })}
                    </details>
                  ) : null}
                  <button
                    type="button"
                    aria-label={`移除目标 ${target.modId}`}
                    onClick={() => {
                      const next = targetModIds.filter((id) => id !== target.modId)
                      const required =
                        minimumTargetCount !== undefined && minimumTargetCount > next.length
                          ? undefined
                          : minimumTargetCount
                      const checked = validateCraftTargets(
                        catalog,
                        state.baseId,
                        next,
                        required,
                        next.includes(targetFracturedModId ?? '')
                          ? targetFracturedModId
                          : undefined,
                      )
                      if (!checked.ok) {
                        setMessage('移除后无法按全部模式满足条件，请先调整达成数量。')
                        return
                      }
                      onChange(next)
                      setMessage(
                        required !== minimumTargetCount ? '目标减少，达成条件已恢复为全部。' : '',
                      )
                    }}
                  >
                    移除目标
                  </button>
                </article>
              )
            })}
          </div>
          {totalTargets > 0 || state.pendingDesecration ? (
            <details className="target-advice" open>
              <summary>
                下一步提示 ·{' '}
                {advice.value.steps.length +
                  essenceSteps.length +
                  preparationRoutes.length +
                  boneSteps.length}{' '}
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
              essenceSteps.length === 0 &&
              preparationRoutes.length === 0 &&
              boneSteps.length === 0 ? (
                <p>
                  当前没有可直接推进目标的受支持通货、精华或骨骼提示。请检查物等、冲突和目标条件；这不代表所有游戏制作路线都不可行。
                </p>
              ) : null}
              {!boneAdvice.ok ? <p role="status">{boneAdvice.error}</p> : null}
              <BoneAdvicePanel
                catalog={catalog}
                state={state}
                steps={boneSteps}
                translations={translations}
                busy={busy}
                onPreview={onPreviewRoute}
                {...(translateLine ? { translateLine } : {})}
              />
              <EssencePreparationPanel
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
                catalog={catalog}
                state={state}
                steps={alloyAdvice.ok ? alloyAdvice.value : []}
                translations={translations}
                busy={busy}
                onPreview={onPreviewRoute}
                {...(translateLine ? { translateLine } : {})}
              />
              <EssenceAdvicePanel
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
                  <article key={`${step.currency}:${step.removeModId ?? ''}`}>
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
                          ? `涉及数值目标：${step.rerolledTargetIds.map(modLabel).join('；')}`
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
                        该指定结果会失去已有目标：{step.lostTargetIds.map(modLabel).join('；')}
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
        </>
      )}
    </section>
  )
}
