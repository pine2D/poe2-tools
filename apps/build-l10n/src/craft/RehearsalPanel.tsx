import {
  type AlloyCraftOperation,
  type ArchitectCraftOperation,
  type ArtificerCraftOperation,
  addCraftAffix,
  alloyCatalogSignature,
  alloyProjectUsage,
  applyCraftOperation,
  applyCraftStep,
  BONE_RULES,
  type BoneCraftOperation,
  type CatalogMod,
  CORRUPTION_STRATEGY_RULES_VERSION,
  CRAFT_CURRENCY_LABELS,
  CRAFT_CURRENCY_RULES,
  CRAFT_OMEN_RULES,
  type CraftAdviceStep,
  type CraftAffixSelector,
  type CraftCatalog,
  type CraftCurrency,
  type CraftCurrencyTier,
  type CraftImplicitTargetValues,
  type CraftOmen,
  type CraftOperation,
  type CraftPricing,
  type CraftState,
  type CraftStep,
  type CraftTargetDefinitionContext,
  collectCraftCosts,
  corruptionSourceHash,
  craftAffixCapacities,
  craftAffixSpace,
  craftCandidates,
  craftOmenDescription,
  craftOmenMaterials,
  definitionStrategyStageAt,
  desecrationSourceHash,
  ESSENCE_OMEN_RULES,
  type EssenceCraftOperation,
  type EssenceOmen,
  EXTRACTION_CRAFT_RULES_VERSION,
  type ExtractionCraftOperation,
  editTargetDefinitionContext,
  enableCraftAffixIdentity,
  FLUX_CRAFT_RULES_VERSION,
  FLUXES,
  type FluxCraftOperation,
  type FractureCraftOperation,
  fluxCatalogSignature,
  IDENTITY_CRAFT_RULES_VERSION,
  type IdentifiedCraftState,
  type ItemDictionary,
  inspectNumericLines,
  isBasicJewel,
  isIdentifiedCraftState,
  JEWEL_EFFECT_EMOTION_ID,
  jewelSourceHash,
  type LiquidEmotionCraftOperation,
  liquidEmotionSourceHash,
  loadTargetWorkbenchProject,
  PERFECT_FLUX_CRAFT_RULES_VERSION,
  type PerfectFluxCraftOperation,
  prepareCraftOperation,
  prepareExtractionCraft,
  prepareStrategySocket,
  projectTargetDefinitions,
  RETAINED_CATALYST_RULES_VERSION,
  type RemovalCraftCurrency,
  type RestoredCraftProject,
  type RestoredIdentityCraftProject,
  type RestoredTargetCraftProject,
  readCraftGrantedSkillLevel,
  readNumericValues,
  removableCraftAffixes,
  requiresCorruptionStrategyProjectVersion,
  requiresExtractionProjectVersion,
  requiresPerfectFluxProjectVersion,
  requiresRetainedCatalystProjectVersion,
  resolveCraftAffix,
  resolveCraftImplicitPatterns,
  resolveGrantedSkill,
  type SocketCraftOperation,
  serializeCraftProject,
  serializeIdentityCraftProject,
  serializeTargetCraftProject,
  setTargetDefinitionStrategy,
  statScalabilitySourceHash,
  TARGET_CRAFT_RULES_VERSION,
  type TargetCraftProject,
  targetProjectSourceUsage,
  usesExplicitModEffect,
  usesJewelCapacity,
  usesJewelEffect,
  type VaalCraftOperation,
} from '@poe2-tools/item-core'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AlloyCraftPanel } from './AlloyCraftPanel'
import { ArchitectPanel } from './ArchitectPanel'
import { CorruptionPanel } from './CorruptionPanel'
import { CraftPricingPanel } from './CraftPricingPanel'
import { craftMaterialLabels } from './craftMaterialLabels'
import { ExtractionPanel, ExtractionReturns } from './ExtractionPanel'
import { FluxCraftPanel } from './FluxCraftPanel'
import { PerfectFluxPanel } from './PerfectFluxPanel'
import './rehearsal.css'
import { BoneOperationDetails } from './BoneAdvicePanel'
import { BoneCraftPanel } from './BoneCraftPanel'
import { boneOmenLabels, boneRevealOmenLabel } from './boneOmenLabels'
import { CatalystPreviewPanel } from './CatalystPreviewPanel'
import { CraftComparisonPanel } from './CraftComparisonPanel'
import { CraftItemTextPanel } from './CraftItemTextPanel'
import { CraftStrategyPanel } from './CraftStrategyPanel'
import { CraftStrategyResults, type SpecialStrategyAction } from './CraftStrategyResults'
import { CraftTargets } from './CraftTargets'
import { DefencePanel } from './DefencePanel'
import { EssenceResultDetails } from './EssenceAdvicePanel'
import { EssenceCraftPanel } from './EssenceCraftPanel'
import { FracturePanel } from './FracturePanel'
import { JewelEffectPanel } from './JewelEffectPanel'
import { JewelRadiusPanel } from './JewelRadiusPanel'
import { LiquidEmotionCraftPanel } from './LiquidEmotionCraftPanel'
import { ModStateBadges } from './ModStateBadges'
import { NumericControls } from './NumericControls'
import { ProjectControls } from './ProjectControls'
import { ResistancePanel } from './ResistancePanel'
import { SkillLevelPanel } from './SkillLevelPanel'
import { SocketPanel } from './SocketPanel'
import { WeaponPanel } from './WeaponPanel'

export interface RehearsalPanelProps {
  catalog: CraftCatalog
  initialState: CraftState
  translations: Record<string, string>
  translateLine?: (line: string) => string | null
  dictionary?: ItemDictionary
  initialProject?: RestoredCraftProject | RestoredIdentityCraftProject | RestoredTargetCraftProject
  importedSockets?: (string | null)[]
  importedQuality?: number
}

interface HistoryEntry {
  id: number
  state: IdentifiedCraftState
  operation: CraftStep | null
}

interface Draft {
  omen?: CraftOmen
  currency: CraftCurrency
  state: CraftState
  count: number
  modIds: string[]
  removeModId?: string
  removeAffixId?: string
  rolls?: NonNullable<CraftOperation['rolls']>
  implicitValues?: number[]
}

function removalSelector(
  operation: Pick<Draft, 'removeModId' | 'removeAffixId'>,
): CraftAffixSelector | undefined {
  return operation.removeModId === undefined
    ? undefined
    : {
        modId: operation.removeModId,
        ...(operation.removeAffixId === undefined ? {} : { affixId: operation.removeAffixId }),
      }
}

function draftOperation(draft: Draft): CraftOperation {
  return {
    currency: draft.currency,
    ...(draft.omen === undefined ? {} : { omen: draft.omen }),
    modIds: [...draft.modIds],
    ...(draft.removeModId === undefined ? {} : { removeModId: draft.removeModId }),
    ...(draft.removeAffixId === undefined ? {} : { removeAffixId: draft.removeAffixId }),
    ...(draft.rolls === undefined
      ? {}
      : { rolls: draft.rolls.map((roll) => ({ ...roll, values: [...roll.values] })) }),
    ...(draft.implicitValues === undefined ? {} : { implicitValues: [...draft.implicitValues] }),
  }
}

function initialValues(patterns: string[], actual = patterns) {
  const ranges = inspectNumericLines(patterns)
  if (!ranges.ok) return ranges
  const existing = readNumericValues(patterns, actual)
  if (!existing.ok) return existing
  return {
    ok: true as const,
    value: ranges.value.map((range) => existing.value[range.index] ?? range.min),
  }
}

const CURRENCIES = Object.keys(CRAFT_CURRENCY_LABELS) as CraftCurrency[]

function isRemovalCurrency(currency: CraftCurrency): currency is RemovalCraftCurrency {
  return CRAFT_CURRENCY_RULES[currency].base === 'chaos' || currency === 'annulment'
}

const RARITIES: Record<CraftState['rarity'], string> = {
  normal: '普通',
  magic: '魔法',
  rare: '稀有',
}
const CANDIDATE_LIMIT = 60
const SLOT_NUMBERS = [1, 2, 3]

function AffixCard({
  mod,
  lines,
  crafted,
  desecrated,
  fractured,
  translateLine,
}: {
  mod: CatalogMod | undefined
  lines: string[]
  crafted?: true | undefined
  desecrated?: true | undefined
  fractured?: true | undefined
  translateLine: ((line: string) => string | null) | undefined
}) {
  return (
    <article className="rehearsal-affix">
      <header>
        <strong>{mod?.name ?? '已导入词缀'}</strong>
        <ModStateBadges
          states={[
            ...(crafted ? ['crafted' as const] : []),
            ...(desecrated ? ['desecrated' as const] : []),
            ...(fractured ? ['fractured' as const] : []),
          ]}
        />
        {mod ? (
          <span>
            {mod.kind === 'prefix' ? '前缀' : '后缀'} · 等级 {mod.level}
          </span>
        ) : null}
      </header>
      {lines.map((line) => {
        const translated = translateLine?.(line)
        return (
          <div key={line}>
            {translated ? <span>{translated}</span> : null}
            <code>{line}</code>
          </div>
        )
      })}
    </article>
  )
}

function CandidateButton({
  mod,
  minimumLevel,
  translateLine,
  onClick,
}: {
  mod: CatalogMod
  minimumLevel: number
  translateLine: ((line: string) => string | null) | undefined
  onClick: () => void
}) {
  return (
    <button type="button" className="rehearsal-candidate" onClick={onClick}>
      <span className="rehearsal-candidate-text">
        <strong>{mod.id}</strong> · {mod.name}
      </span>
      <span className="rehearsal-candidate-text">
        {mod.kind === 'prefix' ? '前缀' : '后缀'} · 等级 {mod.level}
      </span>
      {mod.level < minimumLevel ? (
        <span className="rehearsal-candidate-text">该词缀族的最高可用档位例外</span>
      ) : null}
      {mod.lines.map((line) => {
        const translated = translateLine?.(line)
        return (
          <span className="rehearsal-candidate-line" key={line}>
            {translated ? `${translated} · ` : ''}
            {line}
          </span>
        )
      })}
    </button>
  )
}

function removalLabel(
  mod: CatalogMod | undefined,
  lines: readonly string[],
  translateLine: ((line: string) => string | null) | undefined,
) {
  const identity = mod ? `${mod.name}，组 ${mod.group}` : '已导入词缀'
  const properties = lines
    .flatMap((line) => {
      const translated = translateLine?.(line)
      return translated ? [translated, line] : [line]
    })
    .join('；')
  return `选择移除此组：${identity}；${properties}`
}

export function RehearsalPanel({
  catalog,
  initialState,
  translations,
  translateLine,
  dictionary,
  initialProject: providedProject,
  importedSockets,
  importedQuality,
}: RehearsalPanelProps) {
  const fluxSignature = useMemo(() => fluxCatalogSignature(catalog), [catalog])
  const restored = useMemo(() => {
    if (!providedProject) return null
    try {
      const saved =
        'targetDefinitions' in providedProject.project
          ? serializeTargetCraftProject(providedProject.project, catalog, dictionary)
          : providedProject.project.rulesVersion === IDENTITY_CRAFT_RULES_VERSION
            ? serializeIdentityCraftProject(providedProject.project, catalog, dictionary)
            : { ok: true as const, value: serializeCraftProject(providedProject.project) }
      return saved.ok ? loadTargetWorkbenchProject(saved.value, catalog, dictionary) : saved
    } catch {
      return { ok: false as const, error: '演练项目无法读取。' }
    }
  }, [providedProject, catalog, dictionary])
  const initialProject = restored?.ok ? restored.value : undefined
  const initial = useMemo(
    () =>
      restored && !restored.ok
        ? restored
        : enableCraftAffixIdentity(catalog, initialProject?.project.initialState ?? initialState),
    [catalog, initialProject, initialState, restored],
  )
  const [history, setHistory] = useState<HistoryEntry[]>(() =>
    initialProject
      ? initialProject.states.map((state, index) => ({
          id: index,
          state,
          operation: index === 0 ? null : (initialProject.project.operations[index - 1] ?? null),
        }))
      : initial.ok
        ? [{ id: 0, state: initial.value, operation: null }]
        : [],
  )
  const [strategyResultAction, setStrategyResultAction] = useState<SpecialStrategyAction | null>(
    null,
  )
  const [targetContext, setTargetContext] = useState<CraftTargetDefinitionContext>(() =>
    initialProject
      ? {
          definitions: initialProject.project.targetDefinitions,
          orphanedTargets: initialProject.project.orphanedTargets,
          ...(initialProject.project.strategy ? { strategy: initialProject.project.strategy } : {}),
        }
      : {
          definitions: { nextTargetId: 1, targets: [], alternatives: [], values: [] },
          orphanedTargets: [],
        },
  )
  const { definitions, strategy } = targetContext
  // 已验证定义的只读候选输入；目标身份及全部编辑始终以 context 为唯一事实源。
  const {
    targetModIds,
    targetValues = [],
    targetAlternatives = [],
  } = useMemo(() => projectTargetDefinitions(definitions), [definitions])
  const [strategyStartStep, setStrategyStartStep] = useState(
    initialProject?.project.strategyStartStep,
  )
  const [pricing, setPricing] = useState<CraftPricing | undefined>(initialProject?.project.pricing)
  const [cursor, setCursor] = useState(initialProject?.project.cursor ?? 0)
  const [socketDeclaration, setSocketDeclaration] = useState(
    initialProject ? initialProject.project.importedSockets : importedSockets,
  )
  const [qualityDeclaration, setQualityDeclaration] = useState(
    initialProject ? initialProject.project.importedQuality : importedQuality,
  )
  const [targetImplicitValues, setTargetImplicitValues] = useState<CraftImplicitTargetValues[]>(
    initialProject?.project.targetImplicitValues ?? [],
  )
  const [targetSession, setTargetSession] = useState(0)
  const [comparisonOpen, setComparisonOpen] = useState(false)
  const [omen, setOmen] = useState<CraftOmen | undefined>()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [socketDraft, setSocketDraft] = useState<
    | SocketCraftOperation
    | ArtificerCraftOperation
    | VaalCraftOperation
    | ArchitectCraftOperation
    | null
  >(null)
  const [guaranteedDraft, setGuaranteedDraft] = useState<
    | EssenceCraftOperation
    | LiquidEmotionCraftOperation
    | AlloyCraftOperation
    | FluxCraftOperation
    | PerfectFluxCraftOperation
    | ExtractionCraftOperation
    | null
  >(null)
  const [boneDraft, setBoneDraft] = useState<BoneCraftOperation | null>(null)
  const [fractureDraft, setFractureDraft] = useState<FractureCraftOperation | null>(null)
  const fractureDraftRef = useRef<HTMLElement>(null)
  const fracturePanelRef = useRef<HTMLDivElement>(null)
  const restoreFractureFocusRef = useRef(false)
  useEffect(() => {
    if (fractureDraft) fractureDraftRef.current?.focus()
    else if (restoreFractureFocusRef.current) {
      fracturePanelRef.current?.focus()
      restoreFractureFocusRef.current = false
    }
  }, [fractureDraft])
  const [boneSession, setBoneSession] = useState(0)
  const boneDraftRef = useRef<HTMLElement>(null)
  const bonePanelRef = useRef<HTMLDivElement>(null)
  const restoreBoneFocusRef = useRef(false)
  useEffect(() => {
    if (boneDraft) boneDraftRef.current?.focus()
    else if (restoreBoneFocusRef.current) {
      bonePanelRef.current?.focus()
      restoreBoneFocusRef.current = false
    }
  }, [boneDraft])

  const [essenceSession, setEssenceSession] = useState(0)
  const guaranteedDraftRef = useRef<HTMLElement>(null)
  const essenceTriggerRef = useRef<HTMLElement | null>(null)
  const restoreEssenceFocusRef = useRef(false)
  const fluxEntryRef = useRef<HTMLElement>(null)
  const perfectFluxEntryRef = useRef<HTMLElement>(null)
  const extractionEntryRef = useRef<HTMLElement>(null)
  const alloyEntryRef = useRef<HTMLElement>(null)
  const emotionEntryRef = useRef<HTMLElement>(null)
  const essenceEntryRef = useRef<HTMLElement>(null)
  const strategyTriggerRef = useRef<HTMLElement | null>(null)
  const corruptionStrategyRef = useRef(false)
  const restoreCorruptionFocusRef = useRef(false)
  useEffect(() => {
    if (!socketDraft && restoreCorruptionFocusRef.current) {
      restoreCorruptionFocusRef.current = false
      strategyTriggerRef.current?.focus()
    }
  }, [socketDraft])
  const guaranteedOriginRef = useRef<{
    kind: 'essence' | 'liquid-emotion' | 'alloy' | 'flux' | 'perfect-flux' | 'extraction'
    strategy: boolean
  } | null>(null)
  useEffect(() => {
    if (guaranteedDraft) {
      guaranteedDraftRef.current?.focus()
    } else {
      if (restoreEssenceFocusRef.current) {
        const origin = guaranteedOriginRef.current
        const fallback = origin?.strategy
          ? strategyTriggerRef.current
          : origin?.kind === 'extraction'
            ? extractionEntryRef.current
            : origin?.kind === 'perfect-flux'
              ? perfectFluxEntryRef.current
              : origin?.kind === 'flux'
                ? fluxEntryRef.current
                : origin?.kind === 'alloy'
                  ? alloyEntryRef.current
                  : origin?.kind === 'liquid-emotion'
                    ? emotionEntryRef.current
                    : essenceEntryRef.current
        const trigger = essenceTriggerRef.current?.isConnected
          ? essenceTriggerRef.current
          : fallback
        trigger?.focus()
      }
      guaranteedOriginRef.current = null
      restoreEssenceFocusRef.current = false
      essenceTriggerRef.current = null
    }
  }, [guaranteedDraft])
  const preparationTriggerRef = useRef<HTMLElement | null>(null)
  const restorePreparationFocusRef = useRef(false)
  const draftRef = useRef<HTMLElement>(null)
  const activeDraftKey = draft
    ? `${draft.currency}:${draft.removeAffixId ?? draft.removeModId ?? ''}`
    : null
  useEffect(() => {
    if (activeDraftKey !== null) draftRef.current?.focus()
    else {
      if (restorePreparationFocusRef.current && preparationTriggerRef.current?.isConnected) {
        preparationTriggerRef.current.focus()
      }
      restorePreparationFocusRef.current = false
      preparationTriggerRef.current = null
    }
  }, [activeDraftKey])
  const [removalCurrency, setRemovalCurrency] = useState<RemovalCraftCurrency | null>(null)
  const [currencyTier, setCurrencyTier] = useState<CraftCurrencyTier>('basic')
  const [query, setQuery] = useState('')
  const [message, setMessage] = useState(initial.ok ? '' : initial.error)
  const current = history[cursor]?.state
  const corruptionContextRef = useRef({ catalog, current })
  useEffect(() => {
    const previous = corruptionContextRef.current
    if (previous.catalog === catalog && previous.current === current) return
    corruptionContextRef.current = { catalog, current }
    setSocketDraft((pending) =>
      pending?.kind === 'vaal' || pending?.kind === 'architect' ? null : pending,
    )
    setStrategyResultAction((action) =>
      action?.kind === 'vaal' || action?.kind === 'architect' ? null : action,
    )
    corruptionStrategyRef.current = false
    restoreCorruptionFocusRef.current = false
  }, [catalog, current])
  const destroyedHeading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (current?.destroyed) destroyedHeading.current?.focus()
  }, [current])
  const base = catalog.bases.find((entry) => entry.id === current?.baseId)
  const implicit = useMemo(
    () => (base && current ? resolveCraftImplicitPatterns(base, current) : null),
    [base, current],
  )
  const modById = useMemo(
    () => new Map(catalog.modifiers.map((mod) => [mod.id, mod])),
    [catalog.modifiers],
  )
  const candidateList = useMemo(() => {
    if (!draft) return []
    const needle = query.trim().toLowerCase()
    return craftCandidates(catalog, draft.state, draft.currency, draft.omen)
      .filter((mod) => {
        const translated = mod.lines.map((line) => translateLine?.(line) ?? '').join(' ')
        return `${mod.id} ${mod.name} ${mod.group} ${mod.lines.join(' ')} ${translated}`
          .toLowerCase()
          .includes(needle)
      })
      .slice(0, CANDIDATE_LIMIT)
  }, [catalog, draft, query, translateLine])
  const preview = useMemo(() => {
    if (fractureDraft && current) return applyCraftStep(catalog, current, fractureDraft)
    if (boneDraft && current) return applyCraftStep(catalog, current, boneDraft)
    if (guaranteedDraft && current) return applyCraftStep(catalog, current, guaranteedDraft)
    if (socketDraft && current) return applyCraftStep(catalog, current, socketDraft)
    if (!draft || !current || draft.modIds.length !== draft.count) return null
    return applyCraftOperation(catalog, current, draftOperation(draft))
  }, [catalog, current, draft, socketDraft, guaranteedDraft, boneDraft, fractureDraft])

  useEffect(() => {
    if (draft || removalCurrency || socketDraft || guaranteedDraft || boneDraft || fractureDraft)
      setStrategyResultAction(null)
  }, [draft, removalCurrency, socketDraft, guaranteedDraft, boneDraft, fractureDraft])

  const stageResult = useMemo(
    () =>
      strategy?.flow
        ? definitionStrategyStageAt(
            catalog,
            history.map((entry) => entry.state),
            history.slice(1).flatMap((entry) => (entry.operation ? [entry.operation] : [])),
            strategy,
            strategyStartStep ?? 0,
            cursor,
            { definitions, targetImplicitValues },
          )
        : null,
    [catalog, history, strategy, strategyStartStep, cursor, definitions, targetImplicitValues],
  )

  if (!initial.ok || !current || !base) {
    return <section className="rehearsal-panel rehearsal-error">无法开始演练：{message}</section>
  }

  const startOperation = (currency: CraftCurrency, operationOmen: CraftOmen | undefined) => {
    if (fractureDraft || boneDraft || current.pendingDesecration) return
    setCurrencyTier(CRAFT_CURRENCY_RULES[currency].tier)
    if (isRemovalCurrency(currency)) {
      const removable = removableCraftAffixes(catalog, current, currency, operationOmen)
      if (!removable.ok) {
        setMessage(removable.error)
        return
      }
      setRemovalCurrency(currency)
      setMessage('')
      return
    }
    const prepared = prepareCraftOperation(catalog, current, currency, undefined, operationOmen)
    if (!prepared.ok) {
      setMessage(prepared.error)
      return
    }
    const next: Draft = {
      currency,
      ...(operationOmen === undefined ? {} : { omen: operationOmen }),
      state: prepared.value.state,
      count: prepared.value.count,
      modIds: [],
    }
    if (currency === 'divine') {
      next.rolls = []
      for (const affix of current.affixes) {
        if (operationOmen === 'blessed' || affix.fractured) continue
        const mod = modById.get(affix.modId)
        if (!mod) return
        const values = initialValues(mod.lines, affix.lines)
        if (!values.ok) {
          setMessage(values.error)
          return
        }
        if (values.value.length > 0)
          next.rolls.push({
            modId: mod.id,
            values: values.value,
            ...(affix.affixId === undefined ? {} : { affixId: affix.affixId }),
          })
      }
      if (!implicit?.ok) {
        setMessage(implicit && !implicit.ok ? implicit.error : '固有属性无法核对。')
        return
      }
      const patterns = implicit.value.patterns
      const values = initialValues(patterns, current.implicitLines ?? patterns)
      if (!values.ok) {
        setMessage(values.error)
        return
      }
      if (values.value.length > 0) next.implicitValues = values.value
    }
    setDraft(next)
    setQuery('')
    setMessage('')
  }
  const chooseRemoval = (
    currency: RemovalCraftCurrency,
    selection: CraftAffixSelector,
    operationOmen: CraftOmen | undefined,
  ) => {
    setCurrencyTier(CRAFT_CURRENCY_RULES[currency].tier)
    const prepared = prepareCraftOperation(catalog, current, currency, selection, operationOmen)
    if (!prepared.ok) {
      setMessage(prepared.error)
      return
    }
    setDraft({
      currency,
      ...(operationOmen === undefined ? {} : { omen: operationOmen }),
      state: prepared.value.state,
      count: prepared.value.count,
      modIds: [],
      removeModId: selection.modId,
      ...(selection.affixId === undefined ? {} : { removeAffixId: selection.affixId }),
    })
    setRemovalCurrency(null)
    setQuery('')
    setMessage('')
  }
  const chooseCandidate = (modId: string) => {
    if (!draft) return
    const next = addCraftAffix(catalog, draft.state, modId, draft.currency, draft.omen)
    if (!next.ok) {
      setMessage(next.error)
      return
    }
    const mod = modById.get(modId)
    if (!mod) return
    const values = initialValues(mod.lines)
    if (!values.ok) {
      setMessage(values.error)
      return
    }
    const added = next.value.affixes[draft.state.affixes.length]
    if (!added) {
      setMessage('无法核对本次新增的词缀实例。')
      return
    }
    setDraft({
      ...draft,
      state: next.value,
      modIds: [...draft.modIds, modId],
      ...(values.value.length > 0
        ? {
            rolls: [
              ...(draft.rolls ?? []),
              {
                modId,
                values: values.value,
                ...(added.affixId === undefined ? {} : { affixId: added.affixId }),
              },
            ],
          }
        : {}),
    })
    setMessage('')
  }
  const startAdvice = (step: CraftAdviceStep) => {
    if (draft || removalCurrency || socketDraft || guaranteedDraft || boneDraft || fractureDraft)
      return
    setOmen(step.omen)
    if (isRemovalCurrency(step.currency)) {
      const selection = removalSelector(step)
      if (selection) chooseRemoval(step.currency, selection, step.omen)
    } else {
      startOperation(step.currency, step.omen)
    }
  }
  const startRoute = (operation: CraftStep) => {
    if (draft || removalCurrency || socketDraft || guaranteedDraft || boneDraft || fractureDraft)
      return
    if ('kind' in operation) {
      if (operation.kind === 'vaal' || operation.kind === 'architect') {
        const checked = applyCraftStep(catalog, current, operation)
        if (!checked.ok) {
          setMessage(checked.error)
          return
        }
        setOmen(undefined)
        setSocketDraft(operation)
        setMessage('')
        return
      }
      if (operation.kind === 'fracture') {
        startFracture(operation)
        return
      }
      if (
        operation.kind === 'desecrate' ||
        operation.kind === 'desecration-offer' ||
        operation.kind === 'desecration-reroll' ||
        operation.kind === 'desecration-reveal'
      ) {
        startBone(operation)
        return
      }
      if (
        operation.kind === 'essence' ||
        operation.kind === 'liquid-emotion' ||
        operation.kind === 'alloy' ||
        operation.kind === 'flux' ||
        operation.kind === 'perfect-flux' ||
        operation.kind === 'extraction'
      ) {
        setOmen(undefined)
        startGuaranteed(operation)
      }
      return
    }
    const applied = applyCraftStep(catalog, current, operation)
    if (!applied.ok) {
      setMessage(applied.error)
      return
    }
    const prepared = prepareCraftOperation(
      catalog,
      current,
      operation.currency,
      removalSelector(operation),
      operation.omen,
    )
    if (!prepared.ok) {
      setMessage(prepared.error)
      return
    }
    preparationTriggerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    setDraft({
      ...structuredClone(operation),
      state: applied.value,
      count: prepared.value.count,
      modIds: [...operation.modIds],
      ...(operation.rolls
        ? {
            rolls: operation.rolls.map((roll) => ({ ...roll, values: [...roll.values] })),
          }
        : {}),
    })
    setCurrencyTier(CRAFT_CURRENCY_RULES[operation.currency].tier)
    setOmen(operation.omen)
    setQuery('')
    setMessage('')
  }
  const startPreparation = (operation: CraftOperation) => {
    if (
      (operation.currency !== 'transmutation' && operation.currency !== 'regal') ||
      operation.omen !== undefined ||
      operation.removeModId !== undefined
    )
      return
    startRoute(operation)
  }
  const startGuaranteed = (
    operation:
      | EssenceCraftOperation
      | LiquidEmotionCraftOperation
      | AlloyCraftOperation
      | FluxCraftOperation
      | PerfectFluxCraftOperation
      | ExtractionCraftOperation,
  ) => {
    if (draft || removalCurrency || socketDraft || guaranteedDraft || boneDraft || fractureDraft)
      return
    const checked = applyCraftStep(catalog, current, operation)
    if (!checked.ok) {
      setMessage(checked.error)
      return
    }
    essenceTriggerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    guaranteedOriginRef.current = { kind: operation.kind, strategy: strategyResultAction !== null }
    setGuaranteedDraft(operation)
    setOmen(undefined)
    setMessage('')
  }
  const startBone = (operation: BoneCraftOperation) => {
    if (draft || removalCurrency || socketDraft || guaranteedDraft || boneDraft || fractureDraft)
      return
    const checked = applyCraftStep(catalog, current, operation)
    if (!checked.ok) {
      setMessage(checked.error)
      return
    }
    setBoneDraft(structuredClone(operation))
    setOmen(undefined)
    setComparisonOpen(true)
    setMessage('')
  }
  const startFracture = (operation: FractureCraftOperation) => {
    if (draft || removalCurrency || socketDraft || guaranteedDraft || boneDraft || fractureDraft)
      return
    const checked = applyCraftStep(catalog, current, operation)
    if (!checked.ok) {
      setMessage(checked.error)
      return
    }
    setFractureDraft({ ...operation })
    setOmen(undefined)
    setComparisonOpen(true)
    setMessage('')
  }
  const clearTargetDrafts = () => {
    corruptionStrategyRef.current = false
    restoreCorruptionFocusRef.current = false
    if (strategy?.flow) setStrategyStartStep(cursor)
    setStrategyResultAction(null)
    setDraft(null)
    setSocketDraft(null)
    setGuaranteedDraft(null)
    setBoneDraft(null)
    setFractureDraft(null)
    setRemovalCurrency(null)
    setBoneSession((value) => value + 1)
    setEssenceSession((value) => value + 1)
    setMessage('')
  }
  const applyStep = (operation: CraftStep) => {
    const applied = applyCraftStep(catalog, current, operation)
    if (!applied.ok) {
      setMessage(applied.error)
      return
    }
    if (!isIdentifiedCraftState(applied.value)) {
      setMessage('操作结果缺少完整词缀实例身份，未应用本次结果。')
      return
    }
    const next = [
      ...history.slice(0, cursor + 1),
      {
        id: Math.max(...history.map((entry) => entry.id)) + 1,
        state: applied.value,
        operation,
      },
    ]
    if (
      'kind' in operation &&
      ['desecrate', 'desecration-offer', 'desecration-reroll', 'desecration-reveal'].includes(
        operation.kind,
      )
    )
      restoreBoneFocusRef.current = true
    if ('kind' in operation && operation.kind === 'fracture') restoreFractureFocusRef.current = true
    setHistory(next)
    if (strategy?.flow) setStrategyStartStep(Math.min(strategyStartStep ?? 0, cursor))
    setCursor(next.length - 1)
    if (!('kind' in operation)) setOmen(undefined)
    setStrategyResultAction(null)
    setDraft(null)
    setSocketDraft(null)
    setGuaranteedDraft(null)
    setBoneDraft(null)
    setFractureDraft(null)
    setBoneSession((value) => value + 1)
    setEssenceSession((value) => value + 1)
    setRemovalCurrency(null)
    setMessage('')
  }
  const applyDraft = () => {
    if (draft && draft.modIds.length === draft.count) applyStep(draftOperation(draft))
  }
  const undoDraftChoice = () => {
    if (!draft || draft.modIds.length === 0) return
    const prepared = prepareCraftOperation(
      catalog,
      current,
      draft.currency,
      removalSelector(draft),
      draft.omen,
    )
    if (!prepared.ok) {
      setMessage(prepared.error)
      return
    }
    const remaining = draft.modIds.slice(0, -1)
    let state = prepared.value.state
    for (const modId of remaining) {
      const next = addCraftAffix(catalog, state, modId, draft.currency, draft.omen)
      if (!next.ok) {
        setMessage(next.error)
        return
      }
      state = next.value
    }
    const added = state.affixes.slice(prepared.value.state.affixes.length)
    const rolls = draft.rolls?.filter((roll) =>
      added.some(
        (affix) =>
          affix.modId === roll.modId &&
          (roll.affixId === undefined || affix.affixId === roll.affixId),
      ),
    )
    setDraft({ ...draft, state, modIds: remaining, ...(rolls === undefined ? {} : { rolls }) })
    setMessage('')
  }
  const moveTo = (next: number) => {
    setCursor(next)
    setOmen(undefined)
    setStrategyResultAction(null)
    setDraft(null)
    setSocketDraft(null)
    setGuaranteedDraft(null)
    setBoneDraft(null)
    setFractureDraft(null)
    setBoneSession((value) => value + 1)
    setEssenceSession((value) => value + 1)
    setRemovalCurrency(null)
    setMessage('')
  }
  const capacities = craftAffixCapacities(catalog, current)
  const space = craftAffixSpace(catalog, current)
  const prefixes = current.affixes.filter((affix) => modById.get(affix.modId)?.kind === 'prefix')
  const suffixes = current.affixes.filter((affix) => modById.get(affix.modId)?.kind === 'suffix')
  const omenLabel = (id: CraftOmen) =>
    craftOmenMaterials(id)
      .map((name) => translations[name] ?? name)
      .join(' + ')
  const essenceOmenLabel = (id: EssenceOmen) =>
    translations[ESSENCE_OMEN_RULES[id].name] ?? ESSENCE_OMEN_RULES[id].name
  const essenceLabel = (id: string) => {
    const name = catalog.essences?.find((entry) => entry.id === id)?.name ?? id
    return translations[name] ?? name
  }
  const fractureLabel =
    translations['Fracturing Orb'] ??
    catalog.localizedNames?.['zh-CN']?.['Fracturing Orb'] ??
    'Fracturing Orb'
  const stepLabel = (step: CraftStep) => {
    if (!('kind' in step))
      return CRAFT_CURRENCY_LABELS[step.currency] + (step.omen ? ` + ${omenLabel(step.omen)}` : '')
    if (step.kind === 'fracture') return fractureLabel
    if (step.kind === 'extraction') return '萃取石'
    if (step.kind === 'perfect-flux') return '完美溶剂'
    if (step.kind === 'flux') {
      const name = FLUXES.find((f) => f.id === step.fluxId)?.name ?? step.fluxId
      return translations[name] ?? catalog.localizedNames?.['zh-CN']?.[name] ?? name
    }
    if (step.kind === 'alloy') {
      const name =
        catalog.alloys?.alloys.find((entry) => entry.id === step.alloyId)?.name ?? step.alloyId
      return translations[name] ?? catalog.localizedNames?.['zh-CN']?.[name] ?? name
    }
    if (step.kind === 'liquid-emotion') {
      const name =
        catalog.liquidEmotions?.find((entry) => entry.id === step.emotionId)?.name ?? step.emotionId
      return translations[name] ?? catalog.localizedNames?.['zh-CN']?.[name] ?? name
    }
    if (step.kind === 'essence') {
      return essenceLabel(step.essenceId) + (step.omen ? ` + ${essenceOmenLabel(step.omen)}` : '')
    }
    if (step.kind === 'desecrate')
      return [
        translations[BONE_RULES[step.boneId].name] ??
          catalog.localizedNames?.['zh-CN']?.[BONE_RULES[step.boneId].name] ??
          BONE_RULES[step.boneId].name,
        ...boneOmenLabels(step, catalog, translations).map((entry) => entry.label),
      ].join(' + ')
    if (step.kind === 'desecration-offer')
      return (
        '固定三项亵渎候选' +
        (step.revealOmen ? ` + ${boneRevealOmenLabel(step.revealOmen, catalog, translations)}` : '')
      )
    if (step.kind === 'desecration-reroll') return '重选第二组三项候选'
    if (step.kind === 'desecration-reveal') return '完成亵渎揭示'
    if (step.kind === 'architect')
      return step.outcome === 'destroy' ? '建筑师宝珠：摧毁物品' : '建筑师宝珠：新增腐化强化'
    if (step.kind === 'vaal')
      return `瓦尔石：${step.outcome === 'socket' ? '腐化增加一孔' : step.outcome === 'enchant' ? '新增腐化强化' : step.outcome === 'reroll' ? `重选词缀（${step.replacements.length} 次替换）` : '腐化但属性不变'}`
    if (step.kind === 'artificer') return translations["Artificer's Orb"] ?? '巧匠石'
    const name = catalog.augments?.find((entry) => entry.id === step.augmentId)?.name ?? '符文镶嵌'
    return translations[name] ?? name
  }
  const appliedOperations = history
    .slice(1, cursor + 1)
    .flatMap(({ operation }) => (operation ? [operation] : []))
  const costResult = collectCraftCosts(catalog, appliedOperations)
  const costMaterials = costResult.ok ? costResult.value : []
  const costName = craftMaterialLabels(catalog, translations)
  const costs = costMaterials.map((m) => `${costName(m)} × ${m.count}`)
  const augmentSourceHash = catalog._meta.sources.find(
    (source) => source.path === 'src/Data/ModRunes.lua',
  )?.sha256
  const essenceSourceHash = catalog._meta.sources.find(
    (source) => source.path === 'src/Data/Essence.lua',
  )?.sha256
  const retainedCatalystHistory = requiresRetainedCatalystProjectVersion({ history }, catalog)
  const hasEssenceHistory =
    strategy?.rules.some((rule) => rule.action.kind === 'essence') ||
    history.some(
      ({ operation }) => operation && 'kind' in operation && operation.kind === 'essence',
    )
  const desecratedHash =
    strategy?.rules.some(
      (rule) => rule.action.kind === 'desecrate' || rule.action.kind === 'reveal',
    ) ||
    history[0]?.state.affixes.some((affix) => affix.desecrated) ||
    history.some(
      ({ operation }) =>
        operation &&
        'kind' in operation &&
        ['desecrate', 'desecration-offer', 'desecration-reroll', 'desecration-reveal'].includes(
          operation.kind,
        ),
    )
      ? desecrationSourceHash(catalog)
      : null
  const referencedTargetIds = [
    ...targetModIds,
    ...targetAlternatives.flatMap((entry) => entry.modIds),
    ...targetValues.map((entry) => entry.modId),
    ...targetContext.orphanedTargets.map((target) => target.modId),
  ]
  const targetSources = targetProjectSourceUsage(catalog, current.baseId, referencedTargetIds)
  const effectSourcesNeeded =
    usesJewelEffect(catalog, {
      affixes: referencedTargetIds.map((modId) => ({ modId, lines: [] })),
    }) ||
    history.some(({ state }) => usesJewelEffect(catalog, state)) ||
    strategy?.rules.some(
      (rule) =>
        rule.action.kind === 'liquid-emotion' && rule.action.emotionId === JEWEL_EFFECT_EMOTION_ID,
    ) ||
    history.some(
      ({ operation }) =>
        operation &&
        'kind' in operation &&
        operation.kind === 'liquid-emotion' &&
        operation.emotionId === JEWEL_EFFECT_EMOTION_ID,
    )
  const emotionHash =
    effectSourcesNeeded ||
    targetSources.liquid ||
    (isBasicJewel(base) &&
      (['prefix', 'suffix'] as const).some(
        (kind) => targetModIds.filter((id) => modById.get(id)?.kind === kind).length > 2,
      )) ||
    history.some(({ state }) => usesJewelCapacity(catalog, state)) ||
    history[0]?.state.affixes.some((affix) => base.type === 'Jewel' && affix.crafted) ||
    strategy?.rules.some((rule) => rule.action.kind === 'liquid-emotion') ||
    history.some(
      ({ operation }) => operation && 'kind' in operation && operation.kind === 'liquid-emotion',
    )
      ? liquidEmotionSourceHash(catalog)
      : null
  const alloyUsage = alloyProjectUsage({ history, referencedTargetIds, strategy, pricing })
  const alloySignature = alloyUsage.used ? alloyCatalogSignature(catalog) : null
  const projectConfig: TargetCraftProject = {
    schemaVersion: 1 as const,
    ...(pricing ? { pricing } : {}),
    ...(strategy ? { strategy } : {}),
    ...(strategy?.flow ? { strategyStartStep: strategyStartStep ?? 0 } : {}),
    sourceCommit: catalog._meta.sourceCommit,
    rulesVersion: fluxSignature ? FLUX_CRAFT_RULES_VERSION : TARGET_CRAFT_RULES_VERSION,
    ...(fluxSignature ? { fluxCatalogSignature: fluxSignature } : {}),
    targetDefinitions: definitions,
    orphanedTargets: targetContext.orphanedTargets,
    ...(alloySignature ? { alloyCatalogSignature: alloySignature } : {}),
    ...((effectSourcesNeeded ||
      alloyUsage.resistanceEffect ||
      history[0]?.state.catalyst ||
      targetValues.some((entry) => entry.basis === 'effective') ||
      targetImplicitValues.some((entry) => entry.basis === 'effective')) &&
    statScalabilitySourceHash(catalog)
      ? { scalabilitySourceHash: statScalabilitySourceHash(catalog) as string }
      : {}),
    initialState: history[0]?.state ?? current,
    operations: history
      .slice(1)
      .flatMap((entry) => (entry.operation === null ? [] : [entry.operation])),
    cursor,
    ...((desecratedHash || targetSources.desecration) && desecrationSourceHash(catalog)
      ? { desecrationSourceHash: desecrationSourceHash(catalog) as string }
      : {}),
    ...(history.some((entry) => entry.state.corruption) && corruptionSourceHash(catalog)
      ? { corruptionSourceHash: corruptionSourceHash(catalog) as string }
      : {}),
    ...((base.type === 'Jewel' || targetSources.jewel) && jewelSourceHash(catalog)
      ? { jewelSourceHash: jewelSourceHash(catalog) as string }
      : {}),
    ...((emotionHash || targetSources.liquid) && liquidEmotionSourceHash(catalog)
      ? { liquidEmotionSourceHash: liquidEmotionSourceHash(catalog) as string }
      : {}),
    ...((retainedCatalystHistory || hasEssenceHistory || targetSources.essence) && essenceSourceHash
      ? { essenceSourceHash }
      : {}),
    ...((history[0]?.state.sockets !== undefined ||
      strategy?.rules.some(
        (rule) =>
          rule.action.kind === 'socket' ||
          rule.action.kind === 'artificer' ||
          rule.action.kind === 'extraction',
      )) &&
    augmentSourceHash
      ? { augmentSourceHash }
      : {}),
    ...(targetImplicitValues.length === 0 ? {} : { targetImplicitValues }),
    ...(socketDeclaration === undefined ? {} : { importedSockets: [...socketDeclaration] }),
    ...(qualityDeclaration === undefined ? {} : { importedQuality: qualityDeclaration }),
  }
  const project: TargetCraftProject = retainedCatalystHistory
    ? { ...projectConfig, rulesVersion: RETAINED_CATALYST_RULES_VERSION }
    : requiresCorruptionStrategyProjectVersion(projectConfig)
      ? { ...projectConfig, rulesVersion: CORRUPTION_STRATEGY_RULES_VERSION }
      : requiresExtractionProjectVersion(projectConfig)
        ? { ...projectConfig, rulesVersion: EXTRACTION_CRAFT_RULES_VERSION }
        : requiresPerfectFluxProjectVersion(projectConfig)
          ? { ...projectConfig, rulesVersion: PERFECT_FLUX_CRAFT_RULES_VERSION }
          : projectConfig
  const guaranteedLabel = guaranteedDraft
    ? {
        essence: '精华',
        'liquid-emotion': '液态情感',
        alloy: '合金',
        flux: '溶剂',
        'perfect-flux': '完美溶剂',
        extraction: '萃取石',
      }[guaranteedDraft.kind]
    : ''
  const grantedSkill = readCraftGrantedSkillLevel(catalog, current)

  const restoreProject = (restored: RestoredTargetCraftProject) => {
    setPricing(restored.project.pricing)
    setTargetContext({
      definitions: restored.project.targetDefinitions,
      orphanedTargets: restored.project.orphanedTargets,
      ...(restored.project.strategy ? { strategy: restored.project.strategy } : {}),
    })
    setStrategyStartStep(restored.project.strategyStartStep)
    setHistory(
      restored.states.map((state, index) => ({
        id: index,
        state,
        operation: index === 0 ? null : (restored.project.operations[index - 1] ?? null),
      })),
    )
    setCursor(restored.project.cursor)
    setOmen(undefined)
    setTargetImplicitValues(restored.project.targetImplicitValues ?? [])
    setSocketDeclaration(restored.project.importedSockets)
    setQualityDeclaration(restored.project.importedQuality)
    setTargetSession((value) => value + 1)
    setStrategyResultAction(null)
    setDraft(null)
    setSocketDraft(null)
    setGuaranteedDraft(null)
    setBoneDraft(null)
    setFractureDraft(null)
    setBoneSession((value) => value + 1)
    setEssenceSession((value) => value + 1)
    setRemovalCurrency(null)
    setMessage('')
  }
  const comparisonBefore =
    draft || socketDraft || guaranteedDraft || boneDraft || fractureDraft
      ? preview?.ok
        ? current
        : undefined
      : removalCurrency
        ? undefined
        : history[cursor - 1]?.state
  const comparisonAfter =
    (draft || socketDraft || guaranteedDraft || boneDraft || fractureDraft) && preview?.ok
      ? preview.value
      : current

  const historyControls = (
    <>
      <div className="rehearsal-toolbar">
        <button type="button" disabled={cursor === 0} onClick={() => moveTo(cursor - 1)}>
          撤销
        </button>
        <button
          type="button"
          disabled={cursor >= history.length - 1}
          onClick={() => moveTo(cursor + 1)}
        >
          重做
        </button>
        <button type="button" disabled={cursor === 0} onClick={() => moveTo(0)}>
          回到起点
        </button>
        <section className="rehearsal-costs" aria-label="已消耗材料">
          {costs.length > 0 ? (
            costs.map((cost) => <span key={cost}>{cost}</span>)
          ) : (
            <span>{costResult.ok ? '尚未消耗通货' : '材料计费失败'}</span>
          )}
        </section>
      </div>

      <nav className="rehearsal-history" aria-label="演练历史">
        {history.map((entry, index) => {
          const currency = entry.operation ? stepLabel(entry.operation) : undefined
          return (
            <button
              type="button"
              key={entry.id}
              aria-current={index === cursor ? 'step' : undefined}
              onClick={() => moveTo(index)}
            >
              步骤 {index}：{currency ?? '起点'}
            </button>
          )
        })}
      </nav>
    </>
  )
  const projectControls = (
    <ProjectControls
      catalog={catalog}
      project={project}
      onRestore={restoreProject}
      {...(dictionary === undefined ? {} : { dictionary })}
    />
  )
  const pricingControls = (
    <CraftPricingPanel
      key={targetSession}
      catalog={catalog}
      pricing={pricing}
      costs={costResult}
      materialIds={costMaterials.map((m) => m.id)}
      onChange={setPricing}
      translations={translations}
    />
  )
  const currentOperation = history[cursor]?.operation
  const extracted =
    currentOperation && 'kind' in currentOperation && currentOperation.kind === 'extraction'
  const extractionBefore = extracted ? history[cursor - 1]?.state : undefined
  const terminalExtraction = extractionBefore
    ? prepareExtractionCraft(catalog, extractionBefore)
    : null
  const previewExtraction =
    guaranteedDraft?.kind === 'extraction' ? prepareExtractionCraft(catalog, current) : null
  if (current.destroyed)
    return (
      <section className="rehearsal-panel" aria-label="通货演练">
        <section aria-label="已摧毁装备">
          <h3 ref={destroyedHeading} tabIndex={-1}>
            装备已摧毁
          </h3>
          <p role="status">
            {translations[base.name] ?? base.name}
            {extracted
              ? ' 已由萃取石摧毁，装备不可继续使用；返还镶嵌物见清单。'
              : ' 已在演练中摧毁，装备与镶嵌物均不可继续使用。'}
          </p>
          {extracted ? (
            terminalExtraction?.ok ? (
              <ExtractionReturns
                returns={terminalExtraction.value.returns}
                catalog={catalog}
                translations={translations}
              />
            ) : (
              <p role="alert">
                无法核对萃取返还：
                {terminalExtraction && !terminalExtraction.ok
                  ? terminalExtraction.error
                  : '缺少操作前装备。'}
              </p>
            )
          ) : null}
          <p>
            已消耗材料与起点成本保留。可撤销、回到起点或恢复项目继续比较路线；游戏中无法撤销摧毁。
          </p>
        </section>
        {projectControls}
        {pricingControls}
        {historyControls}
      </section>
    )
  const ItemPanel =
    base.tags.includes('weapon') || ['Wand', 'Staff', 'Sceptre'].includes(base.type)
      ? WeaponPanel
      : DefencePanel
  return (
    <section className="rehearsal-panel" aria-label="通货演练">
      <header className="rehearsal-heading">
        <div>
          <h2>通货演练 · 指定结果演练</h2>
          <p>可指定词缀与具体数值；范围试掷采用演练模型，不计算真实概率或市场价格。</p>
          {usesExplicitModEffect(catalog, current) ? (
            <p className="rehearsal-scope-note">
              制作步骤使用增效前基础值；数值目标可选择有效值，适用的工艺增效与催化品质的合计效果见下方预览。
            </p>
          ) : current.catalyst ? (
            <p className="rehearsal-scope-note">
              制作步骤使用催化前基础值；数值目标可选择基础值或品质后的有效值口径，品质效果见下方预览。
            </p>
          ) : null}
          <p className="rehearsal-scope-note">
            支持普通攻击武器本地面板与三项防御估算；普通品质保留，催化品质按步骤更新，角色技能等级与角色面板尚未计算。
          </p>
        </div>
        <div>
          <strong>{translations[base.name] ?? base.name}</strong>
          <span>{RARITIES[current.rarity]}</span>
        </div>
      </header>

      {projectControls}
      <p className="rehearsal-project-identity">
        当前演练项目：{translations[base.name] ?? base.name} · 物品等级 {current.itemLevel}
      </p>
      <CraftItemTextPanel
        catalog={catalog}
        state={current}
        pending={Boolean(
          draft || removalCurrency || socketDraft || guaranteedDraft || boneDraft || fractureDraft,
        )}
      />
      <ItemPanel
        catalog={catalog}
        current={current}
        preview={Boolean(draft || socketDraft || guaranteedDraft || boneDraft || fractureDraft)}
        {...(comparisonBefore ? { before: comparisonBefore, after: comparisonAfter } : {})}
        {...(qualityDeclaration === undefined ? {} : { importedQuality: qualityDeclaration })}
      />
      <ResistancePanel
        catalog={catalog}
        current={current}
        preview={Boolean(draft || socketDraft || guaranteedDraft || boneDraft || fractureDraft)}
        {...(comparisonBefore ? { before: comparisonBefore, after: comparisonAfter } : {})}
      />
      <SkillLevelPanel
        catalog={catalog}
        current={current}
        preview={Boolean(draft || socketDraft || guaranteedDraft || boneDraft || fractureDraft)}
        {...(comparisonBefore ? { before: comparisonBefore, after: comparisonAfter } : {})}
      />
      <JewelRadiusPanel
        catalog={catalog}
        current={current}
        preview={Boolean(draft || socketDraft || guaranteedDraft || boneDraft || fractureDraft)}
        {...(comparisonBefore ? { before: comparisonBefore, after: comparisonAfter } : {})}
      />
      {socketDeclaration !== undefined ? (
        <p className="rehearsal-scope-note">
          孔位由用户核对：起点 {socketDeclaration.length}{' '}
          个孔。此信息独立于复制原文，起点已有符文不计费。
        </p>
      ) : null}
      {current.runeSourceLines !== undefined ? (
        <p className="rehearsal-scope-note">
          原文符文效果已核对；当前效果按孔内物计算，后续替换不改写起点来源。
        </p>
      ) : null}
      {pricingControls}
      {!costResult.ok ? <p role="alert">{costResult.error}</p> : null}
      <CraftStrategyPanel
        key={`strategy:${targetSession}`}
        {...(stageResult?.ok && stageResult.value ? { stageId: stageResult.value } : {})}
        {...(stageResult && !stageResult.ok ? { stageError: stageResult.error } : {})}
        startStep={strategyStartStep ?? 0}
        onRestart={clearTargetDrafts}
        catalog={catalog}
        translations={translations}
        {...(translateLine ? { translateLine } : {})}
        state={current}
        strategy={strategy}
        goals={{ definitions, targetImplicitValues }}
        orphanedTargets={targetContext.orphanedTargets}
        appliedSteps={cursor}
        pending={Boolean(
          draft || removalCurrency || socketDraft || guaranteedDraft || boneDraft || fractureDraft,
        )}
        omenLabel={omenLabel}
        onChange={(value) => {
          const changed = setTargetDefinitionStrategy(catalog, current.baseId, targetContext, value)
          if (!changed.ok) {
            setMessage(changed.error)
            return
          }
          clearTargetDrafts()
          setTargetContext(changed.value)
          setStrategyStartStep(value?.flow ? cursor : undefined)
        }}
        onStart={(action) => {
          strategyTriggerRef.current =
            document.activeElement instanceof HTMLElement ? document.activeElement : null
          if (
            draft ||
            removalCurrency ||
            socketDraft ||
            guaranteedDraft ||
            boneDraft ||
            fractureDraft
          )
            return
          if (action.kind === 'currency') {
            setStrategyResultAction(null)
            setOmen(action.omen)
            startOperation(action.currency, action.omen)
          } else if (action.kind === 'socket' || action.kind === 'artificer') {
            const step = prepareStrategySocket(catalog, current, action)
            if (!step.ok) {
              setMessage(step.error)
              return
            }
            setStrategyResultAction(null)
            setSocketDraft(step.value)
            setMessage('')
          } else {
            setStrategyResultAction(action)
          }
        }}
      />
      {strategyResultAction ? (
        <CraftStrategyResults
          action={strategyResultAction}
          catalog={catalog}
          state={current}
          translations={translations}
          definitions={definitions}
          {...(translateLine ? { translateLine } : {})}
          fractureLabel={fractureLabel}
          onPreview={(operation) => {
            corruptionStrategyRef.current =
              'kind' in operation && (operation.kind === 'vaal' || operation.kind === 'architect')
            setStrategyResultAction(null)
            startRoute(operation)
          }}
          onCancel={() => {
            setStrategyResultAction(null)
            strategyTriggerRef.current?.focus()
          }}
        />
      ) : null}
      <CraftTargets
        onExtract={(targets) => {
          const changed = editTargetDefinitionContext(catalog, current, targetContext, {
            kind: 'replace-definitions',
            definitions: targets,
          })
          if (!changed.ok) {
            setMessage(changed.error)
            return
          }
          clearTargetDrafts()
          setTargetContext(changed.value)
        }}
        key={`${current.baseId}:${targetSession}`}
        catalog={catalog}
        state={current}
        definitions={definitions}
        onEdit={(edit) => {
          const changed = editTargetDefinitionContext(catalog, current, targetContext, edit)
          if (!changed.ok) {
            setMessage(changed.error)
            return
          }
          clearTargetDrafts()
          setTargetContext(changed.value)
        }}
        targetImplicitValues={targetImplicitValues}
        onImplicitValuesChange={(values) => {
          clearTargetDrafts()
          setTargetImplicitValues(values)
        }}
        {...(omen === undefined ? {} : { omen })}
        onStart={startAdvice}
        onStartPreparation={startPreparation}
        onPreviewRoute={startRoute}
        {...(pricing ? { pricing } : {})}
        spentSteps={appliedOperations}
        onStartEssence={(step) => startGuaranteed(step.operation)}
        translations={translations}
        busy={
          draft !== null ||
          removalCurrency !== null ||
          socketDraft !== null ||
          guaranteedDraft !== null ||
          boneDraft !== null ||
          fractureDraft !== null
        }
        {...(translateLine === undefined ? {} : { translateLine })}
      />

      <div className="rehearsal-omen">
        <label>
          本次搭配预兆
          <select
            aria-label="本次搭配预兆"
            value={omen ?? ''}
            disabled={
              draft !== null ||
              removalCurrency !== null ||
              socketDraft !== null ||
              guaranteedDraft !== null ||
              boneDraft !== null ||
              fractureDraft !== null ||
              current.pendingDesecration !== undefined ||
              current.corrupted === true
            }
            onChange={(event) => {
              setOmen((event.target.value || undefined) as CraftOmen | undefined)
              setMessage('')
            }}
          >
            <option value="">不使用预兆</option>
            {(Object.keys(CRAFT_OMEN_RULES) as CraftOmen[]).map((id) => (
              <option key={id} value={id}>
                {omenLabel(id)}
              </option>
            ))}
          </select>
        </label>
        {omen ? (
          <p>
            <span lang="en">{CRAFT_OMEN_RULES[omen].name}</span> · 适配
            {CRAFT_OMEN_RULES[omen].addCount === 2 || CRAFT_OMEN_RULES[omen].consumesCatalyst
              ? '三档'
              : '基础'}
            {CRAFT_CURRENCY_LABELS[CRAFT_OMEN_RULES[omen].currency]}；{craftOmenDescription(omen)}
            {CRAFT_OMEN_RULES[omen].currency === 'chaos' ? '混沌新增仍可为任一合法侧。' : ''}
            仅用于本次通货；应用成功分别计入 {craftOmenMaterials(omen).length} 枚预兆费用。
          </p>
        ) : null}
      </div>
      <label className="rehearsal-tier">
        通货层级
        <select
          aria-label="通货层级"
          value={currencyTier}
          disabled={
            draft !== null ||
            removalCurrency !== null ||
            socketDraft !== null ||
            guaranteedDraft !== null ||
            boneDraft !== null ||
            fractureDraft !== null ||
            current.pendingDesecration !== undefined ||
            current.corrupted === true
          }
          onChange={(event) => setCurrencyTier(event.target.value as CraftCurrencyTier)}
        >
          <option value="basic">基础</option>
          <option value="greater">高级</option>
          <option value="perfect">完美</option>
        </select>
      </label>
      {currencyTier !== 'basic' ? (
        <p>
          最低词缀等级限制新增档位；若某类词缀将被完全排除，仍保留该物等下最高可用档位。装备物等必须达到通货门槛。
        </p>
      ) : null}
      <nav className="rehearsal-currencies" aria-label="选择通货">
        {CURRENCIES.filter((id) => CRAFT_CURRENCY_RULES[id].tier === currencyTier).map((id) => (
          <button
            type="button"
            key={id}
            disabled={
              (id === 'divine' &&
                implicit?.ok &&
                implicit.value.charm !== null &&
                !implicit.value.charm.fixed &&
                implicit.value.charm.range === null) ||
              draft !== null ||
              removalCurrency !== null ||
              socketDraft !== null ||
              guaranteedDraft !== null ||
              boneDraft !== null ||
              fractureDraft !== null ||
              current.pendingDesecration !== undefined ||
              current.corrupted === true
            }
            onClick={() => startOperation(id, omen)}
          >
            {CRAFT_CURRENCY_LABELS[id]}
          </button>
        ))}
      </nav>
      {removalCurrency && (
        <section className="rehearsal-removal" aria-label="选择要移除的词缀">
          <h3>{CRAFT_CURRENCY_LABELS[removalCurrency]}：先指定移除结果</h3>
          <p>请选择一个完整词缀组。该选择是演练指定结果，不代表游戏中的随机概率。</p>
          {omen ? <p>{craftOmenDescription(omen)}</p> : null}
          <div className="rehearsal-removal-list">
            {(() => {
              const removable = removableCraftAffixes(catalog, current, removalCurrency, omen)
              return removable.ok ? removable.value : []
            })().map((affix) => {
              const mod = modById.get(affix.modId)
              return (
                <div className="rehearsal-removal-choice" key={affix.affixId ?? affix.modId}>
                  {omen && CRAFT_OMEN_RULES[omen].lowestLevel && mod ? (
                    <p>目录词缀等级 {mod.level}</p>
                  ) : null}
                  <AffixCard
                    mod={mod}
                    crafted={affix.crafted}
                    desecrated={affix.desecrated}
                    fractured={affix.fractured}
                    lines={affix.lines}
                    translateLine={translateLine}
                  />
                  <button
                    type="button"
                    aria-label={removalLabel(mod, affix.lines, translateLine)}
                    onClick={() => chooseRemoval(removalCurrency, affix, omen)}
                  >
                    选择移除此组
                  </button>
                </div>
              )
            })}
          </div>
          <button type="button" onClick={() => setRemovalCurrency(null)}>
            取消选择
          </button>
        </section>
      )}
      {message && (
        <p className="rehearsal-message" role="status">
          {message}
        </p>
      )}

      {historyControls}

      {comparisonBefore ? (
        <div className="rehearsal-comparison">
          <p>
            {draft || socketDraft || guaranteedDraft || boneDraft || fractureDraft
              ? '当前装备与待应用结果'
              : '上一步与当前历史步骤'}
          </p>
          <button
            type="button"
            aria-expanded={comparisonOpen}
            onClick={() => setComparisonOpen(!comparisonOpen)}
          >
            {comparisonOpen ? '收起前后变化' : '展开前后变化'}
          </button>
          {comparisonOpen ? (
            <CraftComparisonPanel
              catalog={catalog}
              translations={translations}
              targetImplicitValues={targetImplicitValues}
              definitions={definitions}
              before={comparisonBefore}
              after={comparisonAfter}
              {...(translateLine === undefined ? {} : { translateLine })}
            />
          ) : null}
        </div>
      ) : null}
      <div ref={fracturePanelRef} tabIndex={-1}>
        {!strategyResultAction ? (
          <FracturePanel
            catalog={catalog}
            state={current}
            label={fractureLabel}
            definitions={definitions}
            disabled={Boolean(
              draft ||
                removalCurrency ||
                socketDraft ||
                guaranteedDraft ||
                boneDraft ||
                fractureDraft,
            )}
            {...(translateLine ? { translateLine } : {})}
            onPreview={startFracture}
          />
        ) : null}
      </div>
      {fractureDraft ? (
        <section
          ref={fractureDraftRef}
          tabIndex={-1}
          className="rehearsal-draft"
          aria-label="破裂待应用结果"
        >
          <h3>{fractureLabel} · 待应用</h3>
          <p>
            将锁定 {modById.get(fractureDraft.modId)?.name ?? fractureDraft.modId}
            ，保留当前数值与原有来源。应用后计一份材料。
          </p>
          {preview && !preview.ok ? <p role="alert">{preview.error}</p> : null}
          <button
            type="button"
            onClick={() => {
              restoreFractureFocusRef.current = true
              setFractureDraft(null)
            }}
          >
            取消破裂步骤
          </button>
          <button
            type="button"
            className="primary"
            disabled={!preview?.ok}
            onClick={() => applyStep(fractureDraft)}
          >
            应用破裂步骤
          </button>
        </section>
      ) : null}
      <div ref={bonePanelRef} tabIndex={-1}>
        {!strategyResultAction ? (
          <BoneCraftPanel
            key={`bone:${targetSession}:${cursor}:${history[cursor]?.id}:${boneSession}`}
            catalog={catalog}
            state={current}
            translations={translations}
            definitions={definitions}
            disabled={Boolean(
              draft ||
                removalCurrency ||
                socketDraft ||
                guaranteedDraft ||
                boneDraft ||
                fractureDraft,
            )}
            {...(translateLine ? { translateLine } : {})}
            onPreview={startBone}
          />
        ) : null}
      </div>
      {boneDraft ? (
        <section
          ref={boneDraftRef}
          tabIndex={-1}
          className="rehearsal-draft"
          aria-label="骨骼待应用结果"
        >
          <h3>{stepLabel(boneDraft)}</h3>
          <BoneOperationDetails
            catalog={catalog}
            state={current}
            operation={boneDraft}
            translations={translations}
            {...(translateLine ? { translateLine } : {})}
          />
          {preview?.ok ? (
            <p>
              {boneDraft.kind === 'desecrate'
                ? '应用后消耗一份骨骼及各一份所选预兆，产生未知亵渎占位。'
                : boneDraft.kind === 'desecration-offer'
                  ? boneDraft.revealOmen
                    ? '应用后固定首组三项并消耗一份深渊回响；即使不重选也不退还。'
                    : '应用后固定三项候选，不额外计费。'
                  : boneDraft.kind === 'desecration-reroll'
                    ? '应用后固定第二组三项，保留首组，不额外计费。'
                    : '应用后保留所选亵渎属性，恢复常规制作，不额外计费。'}
            </p>
          ) : (
            <p role="alert">{preview?.error}</p>
          )}
          <button
            type="button"
            onClick={() => {
              restoreBoneFocusRef.current = true
              setBoneDraft(null)
              setFractureDraft(null)
              setBoneSession((value) => value + 1)
            }}
          >
            取消骨骼步骤
          </button>
          <button
            type="button"
            className="primary"
            disabled={!preview?.ok}
            onClick={() => applyStep(boneDraft)}
          >
            应用骨骼步骤
          </button>
        </section>
      ) : null}
      {!strategyResultAction ? (
        <EssenceCraftPanel
          entryRef={essenceEntryRef}
          key={`essence:${targetSession}:${cursor}:${history[cursor]?.id}:${essenceSession}`}
          catalog={catalog}
          state={current}
          translations={translations}
          definitions={definitions}
          disabled={
            draft !== null ||
            removalCurrency !== null ||
            socketDraft !== null ||
            guaranteedDraft !== null ||
            boneDraft !== null ||
            fractureDraft !== null ||
            current.pendingDesecration !== undefined ||
            current.corrupted === true
          }
          {...(translateLine ? { translateLine } : {})}
          onPreview={startGuaranteed}
        />
      ) : null}
      {!strategyResultAction ? (
        <LiquidEmotionCraftPanel
          entryRef={emotionEntryRef}
          key={`emotion:${targetSession}:${cursor}:${history[cursor]?.id}:${essenceSession}`}
          catalog={catalog}
          state={current}
          translations={translations}
          definitions={definitions}
          disabled={Boolean(
            draft ||
              removalCurrency ||
              socketDraft ||
              guaranteedDraft ||
              boneDraft ||
              fractureDraft ||
              current.pendingDesecration?.options,
          )}
          {...(translateLine ? { translateLine } : {})}
          onPreview={startGuaranteed}
        />
      ) : null}
      {!strategyResultAction ? (
        <AlloyCraftPanel
          entryRef={alloyEntryRef}
          key={`alloy:${targetSession}:${cursor}:${history[cursor]?.id}:${essenceSession}`}
          catalog={catalog}
          state={current}
          translations={translations}
          definitions={definitions}
          disabled={Boolean(
            draft ||
              removalCurrency ||
              socketDraft ||
              guaranteedDraft ||
              boneDraft ||
              fractureDraft ||
              current.pendingDesecration ||
              current.corrupted,
          )}
          {...(translateLine ? { translateLine } : {})}
          onPreview={startGuaranteed}
        />
      ) : null}
      {!strategyResultAction ? (
        <FluxCraftPanel
          key={`flux:${targetSession}:${cursor}:${history[cursor]?.id}:${essenceSession}`}
          entryRef={fluxEntryRef}
          catalog={catalog}
          state={current}
          translations={translations}
          disabled={Boolean(
            draft ||
              removalCurrency ||
              socketDraft ||
              guaranteedDraft ||
              boneDraft ||
              fractureDraft,
          )}
          {...(translateLine ? { translateLine } : {})}
          onPreview={startGuaranteed}
        />
      ) : null}
      {!strategyResultAction ? (
        <PerfectFluxPanel
          key={`perfect-flux:${targetSession}:${cursor}:${history[cursor]?.id}:${essenceSession}`}
          entryRef={perfectFluxEntryRef}
          catalog={catalog}
          state={current}
          disabled={Boolean(
            draft ||
              removalCurrency ||
              socketDraft ||
              guaranteedDraft ||
              boneDraft ||
              fractureDraft,
          )}
          {...(translateLine ? { translateLine } : {})}
          onPreview={startGuaranteed}
        />
      ) : null}
      {!strategyResultAction ? (
        <ExtractionPanel
          key={`extraction:${targetSession}:${cursor}:${history[cursor]?.id}:${essenceSession}`}
          entryRef={extractionEntryRef}
          catalog={catalog}
          state={current}
          translations={translations}
          disabled={Boolean(
            draft ||
              removalCurrency ||
              socketDraft ||
              guaranteedDraft ||
              boneDraft ||
              fractureDraft,
          )}
          onPreview={startGuaranteed}
        />
      ) : null}
      {guaranteedDraft ? (
        <section
          ref={guaranteedDraftRef}
          tabIndex={-1}
          className="rehearsal-draft"
          aria-label={`${guaranteedLabel}待应用结果`}
        >
          <h3>{stepLabel(guaranteedDraft)}</h3>
          {guaranteedDraft.kind === 'extraction' ? (
            <>
              <p>装备将被摧毁，应用后无法继续制作或使用装备；可撤销查看演练前态。</p>
              {previewExtraction?.ok ? (
                <ExtractionReturns
                  returns={previewExtraction.value.returns}
                  catalog={catalog}
                  translations={translations}
                />
              ) : null}
            </>
          ) : guaranteedDraft.kind === 'perfect-flux' ? (
            <p>
              装备技能最高等级：{guaranteedDraft.previousMaxLevel} → 20；角色当前使用等级未计算。
            </p>
          ) : guaranteedDraft.kind !== 'flux' ? (
            <EssenceResultDetails
              catalog={catalog}
              state={current}
              operation={guaranteedDraft}
              {...(translateLine ? { translateLine } : {})}
            />
          ) : (
            <p>
              将转换 {guaranteedDraft.rolls.length}{' '}
              条抗性，保留每条词缀的独立身份。下方对照显示全部结果。
            </p>
          )}
          {preview?.ok ? (
            <p>
              {guaranteedDraft.kind === 'extraction'
                ? '应用后消耗 1 颗萃取石；返还物只列数量，不抵扣已消耗材料与起点成本。'
                : guaranteedDraft.kind === 'perfect-flux'
                  ? '应用后消耗 1 颗完美溶剂；起点观察保留，完整结果请保存演练项目。'
                  : guaranteedDraft.kind === 'flux'
                    ? '一次转换所有适用抗性；应用后计入一份溶剂材料。'
                    : guaranteedDraft.kind === 'alloy'
                      ? '将移除指定整组并加入合金保证工艺，应用后计入一份合金材料。'
                      : guaranteedDraft.kind === 'liquid-emotion'
                        ? '将移除指定整组词缀并加入一组工艺词缀，稀有度不变；应用后计入一份液态情感材料。'
                        : guaranteedDraft.removeModId
                          ? '将移除指定整组词缀并加入一组工艺词缀，稀有度不变；应用后计入一份精华费用。'
                          : '将升级为稀有装备，加入一组工艺词缀；应用后计入一份精华费用。'}
            </p>
          ) : (
            <p role="alert">{preview?.error}</p>
          )}
          {guaranteedDraft.kind === 'essence' && guaranteedDraft.omen ? (
            <p>此方案另消耗一份结晶预兆，确认应用后分别计费。</p>
          ) : null}
          <button
            type="button"
            onClick={() => {
              restoreEssenceFocusRef.current = true
              setGuaranteedDraft(null)
              setBoneDraft(null)
              setFractureDraft(null)
              setBoneSession((value) => value + 1)
              setEssenceSession((value) => value + 1)
            }}
          >
            {`取消${guaranteedLabel}结果`}
          </button>
          <button
            type="button"
            className="primary"
            disabled={!preview?.ok}
            onClick={() => applyStep(guaranteedDraft)}
          >
            {`应用${guaranteedLabel}结果`}
          </button>
        </section>
      ) : null}
      <JewelEffectPanel
        catalog={catalog}
        state={comparisonAfter}
        preview={comparisonAfter !== current}
        {...(translateLine ? { translateLine } : {})}
      />
      <CatalystPreviewPanel
        catalog={catalog}
        state={current}
        translations={translations}
        {...(translateLine ? { translateLine } : {})}
      />
      {!strategyResultAction ? (
        <ArchitectPanel
          key={`architect:${targetSession}:${cursor}:${history[cursor]?.id}`}
          catalog={catalog}
          state={current}
          {...(translateLine ? { translateLine } : {})}
          draft={socketDraft?.kind === 'architect' ? socketDraft : null}
          busy={Boolean(
            draft ||
              removalCurrency ||
              guaranteedDraft ||
              boneDraft ||
              fractureDraft ||
              (socketDraft && socketDraft.kind !== 'architect'),
          )}
          canApply={preview?.ok === true}
          onPreview={(step) => {
            setSocketDraft(step)
            setMessage('')
            if (!step && corruptionStrategyRef.current) {
              corruptionStrategyRef.current = false
              restoreCorruptionFocusRef.current = true
            }
          }}
          onApply={() => {
            if (socketDraft?.kind === 'architect') applyStep(socketDraft)
          }}
        />
      ) : null}
      {!strategyResultAction ? (
        <CorruptionPanel
          key={`corruption:${targetSession}:${cursor}:${history[cursor]?.id}`}
          catalog={catalog}
          state={current}
          {...(translateLine ? { translateLine } : {})}
          draft={socketDraft?.kind === 'vaal' ? socketDraft : null}
          busy={Boolean(
            draft ||
              removalCurrency ||
              guaranteedDraft ||
              boneDraft ||
              fractureDraft ||
              (socketDraft && socketDraft.kind !== 'vaal'),
          )}
          canApply={preview?.ok === true}
          onPreview={(step) => {
            setSocketDraft(step)
            setMessage('')
            if (!step && corruptionStrategyRef.current) {
              corruptionStrategyRef.current = false
              restoreCorruptionFocusRef.current = true
            }
          }}
          onApply={() => {
            if (socketDraft?.kind === 'vaal') applyStep(socketDraft)
          }}
        />
      ) : null}
      <SocketPanel
        key={`${targetSession}:${cursor}:${history[cursor]?.id}`}
        catalog={catalog}
        state={current}
        draft={
          socketDraft?.kind === 'vaal' || socketDraft?.kind === 'architect' ? null : socketDraft
        }
        busy={
          draft !== null ||
          removalCurrency !== null ||
          guaranteedDraft !== null ||
          boneDraft !== null ||
          fractureDraft !== null ||
          current.pendingDesecration !== undefined ||
          socketDraft?.kind === 'vaal' ||
          socketDraft?.kind === 'architect'
        }
        canApply={preview?.ok === true}
        translations={translations}
        {...(translateLine ? { translateLine } : {})}
        onPreview={(step) => {
          setSocketDraft(step)
          setMessage('')
        }}
        onApply={() => {
          if (socketDraft) applyStep(socketDraft)
        }}
      />
      {socketDraft && preview && !preview.ok ? <p role="status">{preview.error}</p> : null}
      {current.affixes.some((affix) => affix.desecrated) ? (
        <div>
          <p>亵渎词缀 1/1</p>
          <p>
            {current.corrupted
              ? '已腐化，不能继续普通制作或移除亵渎组。'
              : '可继续常规制作；亵渎组也可能被移除。再次施加骨骼前需先移除已有亵渎组。'}
          </p>
        </div>
      ) : null}
      {isBasicJewel(base) &&
      current.affixes.length === 5 &&
      (prefixes.length < capacities.prefix || suffixes.length < capacities.suffix) ? (
        <p>已有词缀已达五组上限，当前不能新增词缀。</p>
      ) : null}
      <div className="rehearsal-slots">
        <section>
          <h3>
            前缀 {prefixes.length + (current.pendingDesecration?.kind === 'prefix' ? 1 : 0)}/
            {capacities.prefix}
          </h3>
          {prefixes.length > capacities.prefix ? (
            <p>已有前缀保留；当前已超过新增上限，不能再新增前缀。</p>
          ) : null}
          {current.pendingDesecration?.kind === 'prefix' ? (
            <p className="rehearsal-affix">未揭示亵渎前缀</p>
          ) : null}
          {prefixes.map((affix) => (
            <AffixCard
              key={affix.affixId ?? affix.modId}
              mod={modById.get(affix.modId)}
              crafted={affix.crafted}
              desecrated={affix.desecrated}
              fractured={affix.fractured}
              lines={affix.lines}
              translateLine={translateLine}
            />
          ))}
          {SLOT_NUMBERS.slice(0, space.prefix).map((slot) => (
            <p className="rehearsal-empty-slot" key={`prefix-${slot}`}>
              空前缀
            </p>
          ))}
        </section>
        <section>
          <h3>
            后缀 {suffixes.length + (current.pendingDesecration?.kind === 'suffix' ? 1 : 0)}/
            {capacities.suffix}
          </h3>
          {suffixes.length > capacities.suffix ? (
            <p>已有后缀保留；当前已超过新增上限，不能再新增后缀。</p>
          ) : null}
          {current.pendingDesecration?.kind === 'suffix' ? (
            <p className="rehearsal-affix">未揭示亵渎后缀</p>
          ) : null}
          {suffixes.map((affix) => (
            <AffixCard
              key={affix.affixId ?? affix.modId}
              mod={modById.get(affix.modId)}
              crafted={affix.crafted}
              desecrated={affix.desecrated}
              fractured={affix.fractured}
              lines={affix.lines}
              translateLine={translateLine}
            />
          ))}
          {SLOT_NUMBERS.slice(0, space.suffix).map((slot) => (
            <p className="rehearsal-empty-slot" key={`suffix-${slot}`}>
              空后缀
            </p>
          ))}
        </section>
      </div>

      {current.grantedSkillLevel === 20 && grantedSkill.ok ? (
        <section aria-label="当前装备技能结果" className="rehearsal-implicit">
          <h3>当前装备技能结果</h3>
          <p>
            {translateLine?.(`Grants Skill: Level 20 ${grantedSkill.value.name}`) ??
              grantedSkill.value.name}{' '}
            · 装备技能最高等级 20
          </p>
          <p>角色当前使用等级未计算。</p>
        </section>
      ) : null}
      {(current.implicitLines ?? base.implicit?.split('\n') ?? []).length > 0 ? (
        <section className="rehearsal-implicit" aria-label="当前固有属性">
          <h3>固有属性</h3>
          {current.grantedSkillLevel === 20 ? <p>导入／起点观察</p> : null}
          {implicit?.ok && implicit.value.charm ? (
            <p>
              {implicit.value.charm.fixed
                ? '咒符栏：固定 1 栏，不随物品等级增加。'
                : implicit.value.charm.range
                  ? `咒符栏：${implicit.value.charm.value}；可重掷范围：1–${implicit.value.charm.range.max}。`
                  : `咒符栏：${implicit.value.charm.value}；原文未提供范围，不能使用神圣石；请提供完整高级装备文本。其他制作可继续。`}
            </p>
          ) : null}
          {base.implicit?.includes('Grants Skill:') ? (
            <p>
              授予技能原文有等级时保留起点观察，无等级时保留名称；角色需求及全局技能加成尚未计算。带等级范围的授予技能暂不支持神圣石重掷。
            </p>
          ) : null}
          {(current.implicitLines ?? base.implicit?.split('\n') ?? []).map((line) => {
            const maximum = resolveGrantedSkill(line, [], 'en').maxLevel
            const suffix = maximum === null ? '' : ` (Max Level ${maximum})`
            const body = suffix ? line.slice(0, -suffix.length) : line
            const translated = translateLine?.(body)
            return (
              <div key={line}>
                {translated ? (
                  <span>
                    {translated}
                    {maximum === null ? '' : `（最高等级 ${maximum}）`}
                  </span>
                ) : null}
                <code>{line}</code>
              </div>
            )
          })}
        </section>
      ) : null}

      {draft && (
        <section className="rehearsal-draft" aria-label="本次指定结果" ref={draftRef} tabIndex={-1}>
          <header>
            <div>
              <h3>{stepLabel(draftOperation(draft))}</h3>
              {draft.count > 0 ? (
                <p>
                  已选择 {draft.modIds.length}/{draft.count}
                </p>
              ) : null}
            </div>
            <div>
              {draft.count > 0 ? (
                <button
                  type="button"
                  disabled={draft.modIds.length === 0}
                  onClick={undoDraftChoice}
                >
                  撤销上一个选择
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  restorePreparationFocusRef.current = true
                  setStrategyResultAction(null)
                  setDraft(null)
                }}
              >
                取消本次结果
              </button>
              <button
                className="primary"
                type="button"
                disabled={draft.modIds.length !== draft.count || !preview?.ok}
                onClick={applyDraft}
              >
                应用本次结果
              </button>
            </div>
          </header>
          {CRAFT_CURRENCY_RULES[draft.currency].minModLevel > 0 ? (
            <p className="rehearsal-warning">
              本次最低词缀等级 {CRAFT_CURRENCY_RULES[draft.currency].minModLevel}；当前物等{' '}
              {current.itemLevel}。词缀族仅剩低档时保留当前最高档，已有属性不受影响。
            </p>
          ) : null}
          {draft.currency === 'alchemy' && (
            <p className="rehearsal-warning">点金会清除当前旧词缀并换成四条新词缀。</p>
          )}
          {draft.currency === 'divine' ? (
            <p className="rehearsal-warning">
              {draft.omen === 'blessed'
                ? craftOmenDescription('blessed')
                : '神圣会重掷未破裂词缀及固有属性的数值，不改变档位；数值可能变差。破裂数值保持不变，请核对可调整的范围后确认。'}
              {targetImplicitValues.length
                ? draft.omen === 'blessed'
                  ? '其他已达成的固有目标也可能失去。'
                  : '已达成的未破裂显式目标及固有目标也可能失去；示例指定值不代表游戏随机结果安全。'
                : ''}
            </p>
          ) : draft.modIds.length > 0 ? (
            <p>新增范围初始填入下限，可调整数值或按范围试掷；应用前请核对。</p>
          ) : null}
          {draft.rolls?.map((roll, rollIndex) => {
            const mod = modById.get(roll.modId)
            if (!mod) return null
            return (
              <NumericControls
                key={roll.affixId ?? roll.modId}
                label={mod.name || mod.id}
                patterns={mod.lines}
                values={roll.values}
                onChange={(values) =>
                  setDraft({
                    ...draft,
                    rolls: (draft.rolls ?? []).map((entry, index) =>
                      index === rollIndex ? { ...entry, values } : entry,
                    ),
                  })
                }
                {...(translateLine === undefined ? {} : { translateLine })}
              />
            )
          })}
          {draft.implicitValues !== undefined ? (
            <NumericControls
              label="固有属性"
              patterns={implicit?.ok ? implicit.value.patterns : []}
              values={draft.implicitValues}
              onChange={(implicitValues) => setDraft({ ...draft, implicitValues })}
              {...(translateLine === undefined ? {} : { translateLine })}
            />
          ) : null}
          {preview && !preview.ok ? (
            <p className="rehearsal-warning" role="alert">
              {preview.error}
            </p>
          ) : null}
          {draft.removeModId && (
            <section className="rehearsal-removed" aria-label="将移除的词缀">
              <h4 className="rehearsal-selected-title">将移除</h4>
              {(() => {
                const selection = removalSelector(draft)
                const resolved = selection ? resolveCraftAffix(current, selection) : null
                const affix = resolved?.ok ? resolved.value.affix : undefined
                return affix ? (
                  <AffixCard
                    mod={modById.get(affix.modId)}
                    crafted={affix.crafted}
                    desecrated={affix.desecrated}
                    fractured={affix.fractured}
                    lines={affix.lines}
                    translateLine={translateLine}
                  />
                ) : null
              })()}
            </section>
          )}
          {draft.modIds.length > 0 && (
            <section className="rehearsal-selected" aria-label="已选词缀">
              <h4 className="rehearsal-selected-title">应用前核对</h4>
              {draft.modIds.map((modId, index) => {
                const affixes = (preview?.ok ? preview.value : draft.state).affixes
                const affix = affixes[affixes.length - draft.modIds.length + index]
                return affix?.modId === modId ? (
                  <AffixCard
                    key={affix.affixId ?? modId}
                    mod={modById.get(modId)}
                    crafted={affix.crafted}
                    desecrated={affix.desecrated}
                    fractured={affix.fractured}
                    lines={affix.lines}
                    translateLine={translateLine}
                  />
                ) : null
              })}
            </section>
          )}
          {draft.modIds.length < draft.count && (
            <>
              <label>
                搜索合法词缀
                <input
                  type="search"
                  aria-label="搜索合法词缀"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <p className="rehearsal-candidate-count">
                显示前 {candidateList.length} 条合法候选。
              </p>
              <div className="rehearsal-candidates">
                {candidateList.map((mod) => (
                  <CandidateButton
                    key={mod.id}
                    mod={mod}
                    minimumLevel={CRAFT_CURRENCY_RULES[draft.currency].minModLevel}
                    translateLine={translateLine}
                    onClick={() => chooseCandidate(mod.id)}
                  />
                ))}
              </div>
            </>
          )}
        </section>
      )}
    </section>
  )
}
