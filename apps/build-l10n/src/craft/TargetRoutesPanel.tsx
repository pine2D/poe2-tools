import {
  BONE_RULES,
  CRAFT_CURRENCY_LABELS,
  type CraftCatalog,
  type CraftImplicitTargetValues,
  type CraftPricing,
  type CraftResult,
  type CraftState,
  type CraftStep,
  type CraftTargetAlternative,
  type CraftTargetRoutes,
  type CraftTargetValues,
  collectCraftCosts,
  craftOmenDescription,
  craftOmenMaterials,
  ESSENCE_OMEN_RULES,
} from '@poe2-tools/item-core'
import { useEffect, useRef, useState } from 'react'
import { BoneOperationDetails } from './BoneAdvicePanel'
import { boneOmenLabels, boneRevealOmenLabel } from './boneOmenLabels'
import { CraftCostSummary } from './CraftPricingPanel'
import { craftMaterialLabels } from './craftMaterialLabels'
import { requestTargetRoutes } from './targetRoutesWorkerClient'

interface Props {
  minimumTargetCount?: number
  pricing?: CraftPricing
  spentSteps?: CraftStep[]
  catalog: CraftCatalog
  state: CraftState
  ids: string[]
  values: CraftTargetValues[]
  alternatives: CraftTargetAlternative[]
  implicitValues?: CraftImplicitTargetValues[]
  targetFracturedModId?: string
  busy: boolean
  translations: Record<string, string>
  onPreview: (operation: CraftStep) => void
  translateLine?: (line: string) => string | null
}

export function TargetRoutesPanel(props: Props) {
  const [preserveMatched, setPreserveMatched] = useState(true)
  const [preferCosts, setPreferCosts] = useState(false)
  const costSearch = preferCosts && props.pricing !== undefined
  useEffect(() => {
    if (!props.pricing) setPreferCosts(false)
  }, [props.pricing])
  // 输入一变即销毁缓存与运行任务；撤销回旧状态也必须主动重新计算。
  return (
    <RouteSearch
      key={JSON.stringify([
        props.catalog._meta,
        props.state,
        props.ids,
        props.values,
        props.alternatives,
        props.implicitValues,
        props.targetFracturedModId,
        props.minimumTargetCount,
        preserveMatched,
        costSearch ? props.pricing : null,
      ])}
      {...props}
      costSearch={costSearch}
      onCostSearchChange={setPreferCosts}
      preserveMatched={preserveMatched}
      onPreserveChange={setPreserveMatched}
    />
  )
}
function RouteSearch({
  minimumTargetCount,
  pricing,
  spentSteps = [],
  catalog,
  state,
  ids,
  values,
  alternatives,
  implicitValues = [],
  targetFracturedModId,
  busy,
  translations,
  onPreview,
  translateLine,
  preserveMatched,
  onPreserveChange,
  costSearch,
  onCostSearchChange,
}: Props & {
  preserveMatched: boolean
  onPreserveChange: (value: boolean) => void
  costSearch: boolean
  onCostSearchChange: (value: boolean) => void
}) {
  const [result, setResult] = useState<CraftResult<CraftTargetRoutes> | null>(null)
  const [running, setRunning] = useState(false)
  const cancelRef = useRef<(() => void) | null>(null)
  const requestId = useRef(0)
  useEffect(
    () => () => {
      requestId.current++
      cancelRef.current?.()
    },
    [],
  )
  const stop = () => {
    requestId.current++
    cancelRef.current?.()
    cancelRef.current = null
    setRunning(false)
  }
  const materialLabel = craftMaterialLabels(catalog, translations)
  const localize = (name: string) =>
    translations[name] ?? catalog.localizedNames?.['zh-CN']?.[name] ?? name
  const label = (step: CraftStep) => {
    if ('currency' in step) return CRAFT_CURRENCY_LABELS[step.currency]
    if (step.kind === 'fracture') return localize('Fracturing Orb')
    if (step.kind === 'essence')
      return localize(
        catalog.essences?.find((e) => e.id === step.essenceId)?.name ?? step.essenceId,
      )
    if (step.kind === 'desecrate') return localize(BONE_RULES[step.boneId].name)
    if (step.kind === 'desecration-offer')
      return (
        '固定三项亵渎候选' +
        (step.revealOmen ? ` + ${boneRevealOmenLabel(step.revealOmen, catalog, translations)}` : '')
      )
    if (step.kind === 'desecration-reroll') return '重选第二组三项候选'
    if (step.kind === 'desecration-reveal') return '完成亵渎揭示'
    return step.kind === 'socket' ? '符文' : '巧匠石'
  }
  const omenNames = (step: CraftStep): string[] =>
    'omen' in step && step.omen
      ? 'currency' in step
        ? craftOmenMaterials(step.omen).map(localize)
        : [localize(ESSENCE_OMEN_RULES[step.omen].name)]
      : []
  const omenLabel = (step: CraftStep) => omenNames(step).join(' + ')
  const boneOmens = (step: CraftStep) =>
    'kind' in step && step.kind === 'desecrate'
      ? boneOmenLabels(step, catalog, translations).map((entry) => entry.label)
      : []
  const modLabel = (id: string) => {
    const mod = catalog.modifiers.find((m) => m.id === id)
    return mod ? `${mod.name} · ${translateLine?.(mod.lines[0] ?? '') ?? mod.lines[0] ?? id}` : id
  }
  const implicitLabel = (index: number) => {
    const line =
      catalog.bases.find((base) => base.id === state.baseId)?.implicit?.split('\n')[index] ?? ''
    return `固有属性 ${index + 1} · ${translateLine?.(line) ?? line}`
  }
  return (
    <section className="target-advice target-routes" aria-label="多步示例路线">
      <h3>多步示例路线</h3>
      <p>
        只搜索已支持操作的目标推进与准备选择，未涵盖所有游戏路径；示例不代表最优、成功率或实际游戏结果。咒符与传奇仅用于对比。
      </p>
      <label>
        <input
          type="checkbox"
          checked={preserveMatched}
          onChange={(event) => {
            stop()
            setResult(null)
            onPreserveChange(event.target.checked)
          }}
        />
        保留当前已达成目标
      </label>
      <p>
        保留会约束示例每一步维持起点已满足的目标身份和数值，包括尚未破裂的指定目标；不保护非目标词缀，也不保证游戏随机结果安全。
      </p>
      <label>
        <input
          type="checkbox"
          checked={costSearch}
          disabled={!pricing}
          onChange={(event) => {
            stop()
            setResult(null)
            onCostSearchChange(event.target.checked)
          }}
        />
        按自填报价优先搜索
      </label>
      <p>
        {pricing
          ? '完整已知的新增费用优先，缺价路线仍标为未知；不把起点或已用材料重复计入搜索。有限预算可能遗漏更便宜路线，不代表全局最优或随机制作的期望成本。'
          : '先在制作报价中应用单价，即可启用费用优先搜索。'}
        {costSearch ? '修改报价会清除旧结果，请重新生成路线。' : ''}
      </p>
      <button
        type="button"
        disabled={
          busy || running || (ids.length + implicitValues.length === 0 && !state.pendingDesecration)
        }
        onClick={() => {
          stop()
          setResult(null)
          setRunning(true)
          const id = ++requestId.current
          try {
            cancelRef.current = requestTargetRoutes(
              [
                catalog,
                state,
                ids,
                values,
                alternatives,
                {
                  preserveMatched,
                  ...(minimumTargetCount === undefined ? {} : { minimumTargetCount }),
                  ...(costSearch && pricing ? { pricing } : {}),
                },
                implicitValues,
                targetFracturedModId,
              ],
              (next) => {
                if (requestId.current !== id) return
                setResult(next)
                setRunning(false)
                cancelRef.current = null
              },
            )
          } catch {
            setRunning(false)
            setResult({
              ok: false,
              error: '当前浏览器无法启动路线计算，请重试或使用支持 Worker 的浏览器。',
            })
          }
        }}
      >
        生成多步示例路线
      </button>
      {running ? (
        <>
          <p role="status">正在计算有限示例路线…</p>
          <button type="button" onClick={stop}>
            取消路线计算
          </button>
        </>
      ) : null}
      {result && !result.ok ? <p role="status">{result.error}</p> : null}
      {result?.ok ? (
        <>
          <p role="status">
            {result.value.alreadyMatched
              ? minimumTargetCount === undefined
                ? '全部目标已达成，无需新增路线。'
                : '数量条件及必选目标已达成，无需新增路线。'
              : result.value.routes.length
                ? minimumTargetCount === undefined
                  ? `找到 ${result.value.routes.length} 条全部目标达成的示例路线。`
                  : `找到 ${result.value.routes.length} 条满足数量及必选条件的示例路线。`
                : '本次有限搜索未找到完整路线，不能证明目标不可达。'}
          </p>
          <p>
            展开 {result.value.examinedStates} 个状态；候选验证 {result.value.candidateApplications}{' '}
            次。
            {result.value.truncated
              ? '搜索已截断：达到预算、深度或候选选择限制；仅展示有限示例。'
              : ''}
          </p>
          {result.value.routes.map((route, index) => {
            const routeOperations = route.steps.map((step) => step.operation)
            const materialCosts = collectCraftCosts(catalog, routeOperations)
            const costs = materialCosts.ok
              ? materialCosts.value.map((m) => `${materialLabel(m)} × ${m.count}`)
              : []
            return (
              <article key={JSON.stringify(route.steps.map((s) => s.operation))}>
                <h4>
                  示例路线 {index + 1} · {route.steps.length} 步
                </h4>
                <p>
                  预计材料：
                  {costs.length
                    ? costs.join('、')
                    : materialCosts.ok
                      ? '无需新增材料'
                      : '材料识别失败'}
                  。预览不计入实际历史。
                </p>
                {!materialCosts.ok ? <p role="alert">{materialCosts.error}</p> : null}
                <CraftCostSummary
                  costs={materialCosts}
                  pricing={pricing}
                  title="路线新增成本"
                  materialLabel={materialLabel}
                />
                <CraftCostSummary
                  costs={collectCraftCosts(catalog, [...spentSteps, ...routeOperations])}
                  pricing={pricing}
                  title="完成路线后总成本"
                  includeBase
                  materialLabel={materialLabel}
                />
                <ol>
                  {route.steps.map((step, stepIndex) => {
                    const previous =
                      stepIndex === 0 ? state : (route.steps[stepIndex - 1]?.state ?? state)
                    const removed = previous.affixes.filter(
                      (a) => !step.state.affixes.some((b) => a.modId === b.modId),
                    )
                    const gained = step.state.affixes.filter(
                      (a) =>
                        !previous.affixes.some(
                          (b) =>
                            a.modId === b.modId &&
                            JSON.stringify(a.lines) === JSON.stringify(b.lines),
                        ),
                    )
                    return (
                      <li key={JSON.stringify([step.operation, step.state])}>
                        <strong>
                          {label(step.operation)}
                          {omenLabel(step.operation) ? ` + ${omenLabel(step.operation)}` : ''}
                          {boneOmens(step.operation).length
                            ? ` + ${boneOmens(step.operation).join(' + ')}`
                            : ''}
                        </strong>
                        {'currency' in step.operation &&
                        (step.operation.omen === 'whittling' || step.operation.omen === 'light') ? (
                          <p>{craftOmenDescription(step.operation.omen)}</p>
                        ) : null}
                        {'kind' in step.operation && step.operation.kind === 'fracture' ? (
                          <p className="target-warning">
                            演练锁定：{modLabel(step.operation.modId)}。游戏随机锁定当前{' '}
                            {step.fractureCandidateModIds?.length ?? 0}{' '}
                            组候选中的一组，可能锁到其他词缀；此路线只指定结果，不代表成功率。
                          </p>
                        ) : null}
                        {'kind' in step.operation &&
                        (step.operation.kind === 'desecrate' ||
                          step.operation.kind === 'desecration-offer' ||
                          step.operation.kind === 'desecration-reroll' ||
                          step.operation.kind === 'desecration-reveal') ? (
                          <BoneOperationDetails
                            catalog={catalog}
                            operation={step.operation}
                            translations={translations}
                            {...(translateLine ? { translateLine } : {})}
                          />
                        ) : null}
                        {ids.length + implicitValues.length > 0 ? (
                          <p>
                            已达成{' '}
                            {step.matchedTargetIds.length +
                              (step.matchedImplicitLineIndexes?.length ?? 0)}{' '}
                            / {ids.length + implicitValues.length}
                          </p>
                        ) : (
                          <p>未设置制作目标；本路线用于完成揭示。</p>
                        )}
                        {step.state.pendingDesecration ? (
                          <p>此步仍有未揭示亵渎，路线尚未完成。</p>
                        ) : null}
                        {step.gainedImplicitLineIndexes?.length ? (
                          <p>
                            达成固有目标：
                            {step.gainedImplicitLineIndexes.map(implicitLabel).join('；')}
                          </p>
                        ) : null}
                        {step.lostImplicitLineIndexes?.length ? (
                          <p className="target-warning">
                            失去固有目标：
                            {step.lostImplicitLineIndexes.map(implicitLabel).join('；')}
                          </p>
                        ) : null}
                        {gained.map((a) => (
                          <p key={a.modId}>
                            得到 / 更新：
                            {a.lines.map((line) => translateLine?.(line) ?? line).join('；')}（
                            {catalog.modifiers.find((m) => m.id === a.modId)?.name ?? a.modId}）
                          </p>
                        ))}
                        {removed.map((a) => (
                          <p key={a.modId}>
                            移除：{a.lines.map((line) => translateLine?.(line) ?? line).join('；')}
                            （{catalog.modifiers.find((m) => m.id === a.modId)?.name ?? a.modId}）
                          </p>
                        ))}
                        {step.lostTargetIds.length ? (
                          <p className="target-warning">
                            指定结果丢失目标：{step.lostTargetIds.map(modLabel).join('；')}
                          </p>
                        ) : null}
                        {step.atRiskTargetIds.length ? (
                          <p className="target-warning">
                            {'kind' in step.operation && step.operation.kind === 'desecrate'
                              ? '本工具可演练移除池内的目标风险：'
                              : 'currency' in step.operation && step.operation.omen === 'whittling'
                                ? '最低等级候选内的目标风险：'
                                : '整个合法随机移除池内的目标风险：'}
                            {step.atRiskTargetIds.map(modLabel).join('；')}
                            。所选安全结果不代表随机安全。
                          </p>
                        ) : null}
                        {'currency' in step.operation && step.operation.currency === 'divine' ? (
                          <p className="target-warning">
                            神圣会随机重掷未破裂显式与固有数值，已达成条件也可能变差；破裂数值保持不变。涉及目标：
                            {[
                              ...step.rerolledTargetIds.map(modLabel),
                              ...(step.rerolledImplicitLineIndexes?.map(implicitLabel) ?? []),
                            ].join('；')}
                            。固有示例值：
                            {step.operation.implicitValues?.join('、') ?? '无范围'}
                          </p>
                        ) : null}
                      </li>
                    )
                  })}
                </ol>
                <p>
                  预览将切换本次通货与预兆配置为路线第一步所选配置（未选预兆即不使用）；取消后可重新选择。
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    const first = route.steps[0]
                    if (first && !busy) onPreview(first.operation)
                  }}
                >
                  预览路线第一步
                </button>
              </article>
            )
          })}
        </>
      ) : null}
    </section>
  )
}
