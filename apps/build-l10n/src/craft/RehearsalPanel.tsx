import {
  type ArtificerCraftOperation,
  addCraftAffix,
  applyCraftOperation,
  applyCraftStep,
  BONE_RULES,
  type BoneCraftOperation,
  type CatalogMod,
  CRAFT_CURRENCY_LABELS,
  CRAFT_CURRENCY_RULES,
  CRAFT_OMEN_RULES,
  CRAFT_RULES_VERSION,
  type CraftAdviceStep,
  type CraftCatalog,
  type CraftCurrency,
  type CraftCurrencyTier,
  type CraftImplicitTargetValues,
  type CraftOmen,
  type CraftOperation,
  type CraftPricing,
  type CraftProject,
  type CraftState,
  type CraftStep,
  type CraftStrategy,
  type CraftTargetAlternative,
  type CraftTargetValues,
  collectCraftCosts,
  craftAffixCapacities,
  craftAffixSpace,
  craftCandidates,
  craftOmenDescription,
  craftOmenMaterials,
  craftStrategyLeaves,
  createCraftState,
  desecrationSourceHash,
  ESSENCE_OMEN_RULES,
  type EssenceCraftOperation,
  type EssenceOmen,
  type FractureCraftOperation,
  type ItemDictionary,
  inspectNumericLines,
  isBasicJewel,
  JEWEL_EFFECT_EMOTION_ID,
  jewelSourceHash,
  type LiquidEmotionCraftOperation,
  liquidEmotionSourceHash,
  prepareCraftOperation,
  prepareStrategySocket,
  type RemovalCraftCurrency,
  type RestoredCraftProject,
  readNumericValues,
  removableCraftAffixes,
  resolveCraftImplicitPatterns,
  resolveGrantedSkill,
  type SocketCraftOperation,
  statScalabilitySourceHash,
  strategyStageAt,
  usesJewelCapacity,
  usesJewelEffect,
} from '@poe2-tools/item-core'
import { useEffect, useMemo, useRef, useState } from 'react'
import { CraftPricingPanel } from './CraftPricingPanel'
import { craftMaterialLabels } from './craftMaterialLabels'
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
import { LiquidEmotionCraftPanel } from './LiquidEmotionCraftPanel'
import { ModStateBadges } from './ModStateBadges'
import { NumericControls } from './NumericControls'
import { ProjectControls } from './ProjectControls'
import { ResistancePanel } from './ResistancePanel'
import { SocketPanel } from './SocketPanel'
import { WeaponPanel } from './WeaponPanel'

export interface RehearsalPanelProps {
  catalog: CraftCatalog
  initialState: CraftState
  translations: Record<string, string>
  translateLine?: (line: string) => string | null
  dictionary?: ItemDictionary
  initialProject?: RestoredCraftProject
  importedSockets?: (string | null)[]
  importedQuality?: number
}

interface HistoryEntry {
  id: number
  state: CraftState
  operation: CraftStep | null
}

interface Draft {
  omen?: CraftOmen
  currency: CraftCurrency
  state: CraftState
  count: number
  modIds: string[]
  removeModId?: string
  rolls?: NonNullable<CraftOperation['rolls']>
  implicitValues?: number[]
}

function draftOperation(draft: Draft): CraftOperation {
  return {
    currency: draft.currency,
    ...(draft.omen === undefined ? {} : { omen: draft.omen }),
    modIds: [...draft.modIds],
    ...(draft.removeModId === undefined ? {} : { removeModId: draft.removeModId }),
    ...(draft.rolls === undefined
      ? {}
      : { rolls: draft.rolls.map((roll) => ({ modId: roll.modId, values: [...roll.values] })) }),
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
  initialProject,
  importedSockets,
  importedQuality,
}: RehearsalPanelProps) {
  const initial = useMemo(
    () => createCraftState(catalog, initialProject?.project.initialState ?? initialState),
    [catalog, initialProject, initialState],
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
  const [strategy, setStrategy] = useState<CraftStrategy | undefined>(
    initialProject?.project.strategy,
  )
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
  const [targetModIds, setTargetModIds] = useState<string[]>(
    initialProject?.project.targetModIds ?? [],
  )
  const [minimumTargetCount, setMinimumTargetCount] = useState<number | undefined>(
    initialProject?.project.minimumTargetCount,
  )
  const [targetValues, setTargetValues] = useState<CraftTargetValues[]>(
    initialProject?.project.targetValues ?? [],
  )
  const [targetAlternatives, setTargetAlternatives] = useState<CraftTargetAlternative[]>(
    initialProject?.project.targetAlternatives ?? [],
  )
  const [targetFracturedModId, setTargetFracturedModId] = useState<string | undefined>(
    initialProject?.project.targetFracturedModId,
  )
  const [targetImplicitValues, setTargetImplicitValues] = useState<CraftImplicitTargetValues[]>(
    initialProject?.project.targetImplicitValues ?? [],
  )
  const [targetSession, setTargetSession] = useState(0)
  const [comparisonOpen, setComparisonOpen] = useState(false)
  const [omen, setOmen] = useState<CraftOmen | undefined>()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [socketDraft, setSocketDraft] = useState<
    SocketCraftOperation | ArtificerCraftOperation | null
  >(null)
  const [guaranteedDraft, setGuaranteedDraft] = useState<
    EssenceCraftOperation | LiquidEmotionCraftOperation | null
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
  const emotionEntryRef = useRef<HTMLElement>(null)
  const essenceEntryRef = useRef<HTMLElement>(null)
  const strategyTriggerRef = useRef<HTMLElement | null>(null)
  const guaranteedOriginRef = useRef<{
    kind: 'essence' | 'liquid-emotion'
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
  const activeDraftKey = draft ? `${draft.currency}:${draft.removeModId ?? ''}` : null
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
        ? strategyStageAt(
            catalog,
            history.map((entry) => entry.state),
            history.slice(1).flatMap((entry) => (entry.operation ? [entry.operation] : [])),
            strategy,
            strategyStartStep ?? 0,
            cursor,
            {
              targetModIds,
              targetValues,
              targetAlternatives,
              targetImplicitValues,
              ...(minimumTargetCount === undefined ? {} : { minimumTargetCount }),
              ...(targetFracturedModId === undefined ? {} : { targetFracturedModId }),
            },
          )
        : null,
    [
      catalog,
      history,
      strategy,
      strategyStartStep,
      cursor,
      targetModIds,
      targetValues,
      targetAlternatives,
      targetImplicitValues,
      minimumTargetCount,
      targetFracturedModId,
    ],
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
        if (values.value.length > 0) next.rolls.push({ modId: mod.id, values: values.value })
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
    removeModId: string,
    operationOmen: CraftOmen | undefined,
  ) => {
    setCurrencyTier(CRAFT_CURRENCY_RULES[currency].tier)
    const prepared = prepareCraftOperation(catalog, current, currency, removeModId, operationOmen)
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
      removeModId,
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
    setDraft({
      ...draft,
      state: next.value,
      modIds: [...draft.modIds, modId],
      ...(values.value.length > 0
        ? { rolls: [...(draft.rolls ?? []), { modId, values: values.value }] }
        : {}),
    })
    setMessage('')
  }
  const startAdvice = (step: CraftAdviceStep) => {
    if (draft || removalCurrency || socketDraft || guaranteedDraft || boneDraft || fractureDraft)
      return
    setOmen(step.omen)
    if (isRemovalCurrency(step.currency)) {
      if (step.removeModId) chooseRemoval(step.currency, step.removeModId, step.omen)
    } else {
      startOperation(step.currency, step.omen)
    }
  }
  const startRoute = (operation: CraftStep) => {
    if (draft || removalCurrency || socketDraft || guaranteedDraft || boneDraft || fractureDraft)
      return
    if ('kind' in operation) {
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
      if (operation.kind === 'essence' || operation.kind === 'liquid-emotion') {
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
      operation.removeModId,
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
            rolls: operation.rolls.map((roll) => ({ modId: roll.modId, values: [...roll.values] })),
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
  const startGuaranteed = (operation: EssenceCraftOperation | LiquidEmotionCraftOperation) => {
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
      draft.removeModId,
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
    const rolls = draft.rolls?.filter((roll) => remaining.includes(roll.modId))
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
  const jewelHash = base.type === 'Jewel' ? jewelSourceHash(catalog) : null
  const referencedTargetIds = [
    ...targetModIds,
    ...targetAlternatives.flatMap((entry) => entry.modIds),
    ...targetValues.map((entry) => entry.modId),
    ...(strategy?.rules.flatMap((rule) =>
      craftStrategyLeaves(rule.conditions).flatMap((condition) =>
        condition.kind === 'selected-targets' ? condition.modIds : [],
      ),
    ) ?? []),
  ]
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
  const craftedJewelTarget = [...referencedTargetIds].some((id) => {
    const mod = modById.get(id)
    return mod?.jewelOnly && mod.craftedOnly
  })
  const emotionHash =
    effectSourcesNeeded ||
    craftedJewelTarget ||
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
  const project: CraftProject = {
    schemaVersion: 1 as const,
    ...(pricing ? { pricing } : {}),
    ...(strategy ? { strategy } : {}),
    ...(strategy?.flow ? { strategyStartStep: strategyStartStep ?? 0 } : {}),
    sourceCommit: catalog._meta.sourceCommit,
    rulesVersion: CRAFT_RULES_VERSION,
    ...((effectSourcesNeeded ||
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
    ...(desecratedHash ? { desecrationSourceHash: desecratedHash } : {}),
    ...(jewelHash ? { jewelSourceHash: jewelHash } : {}),
    ...(emotionHash ? { liquidEmotionSourceHash: emotionHash } : {}),
    ...(hasEssenceHistory && essenceSourceHash ? { essenceSourceHash } : {}),
    ...((history[0]?.state.sockets !== undefined ||
      strategy?.rules.some(
        (rule) => rule.action.kind === 'socket' || rule.action.kind === 'artificer',
      )) &&
    augmentSourceHash
      ? { augmentSourceHash }
      : {}),
    ...(targetModIds.length === 0 ? {} : { targetModIds }),
    ...(targetValues.length === 0 ? {} : { targetValues }),
    ...(minimumTargetCount === undefined ? {} : { minimumTargetCount }),
    ...(targetImplicitValues.length === 0 ? {} : { targetImplicitValues }),
    ...(targetAlternatives.length === 0 ? {} : { targetAlternatives }),
    ...(targetFracturedModId === undefined ? {} : { targetFracturedModId }),
    ...(socketDeclaration === undefined ? {} : { importedSockets: [...socketDeclaration] }),
    ...(qualityDeclaration === undefined ? {} : { importedQuality: qualityDeclaration }),
  }
  const restoreProject = (restored: RestoredCraftProject) => {
    setPricing(restored.project.pricing)
    setStrategy(restored.project.strategy)
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
    setTargetModIds(restored.project.targetModIds ?? [])
    setTargetValues(restored.project.targetValues ?? [])
    setMinimumTargetCount(restored.project.minimumTargetCount)
    setTargetImplicitValues(restored.project.targetImplicitValues ?? [])
    setTargetAlternatives(restored.project.targetAlternatives ?? [])
    setTargetFracturedModId(restored.project.targetFracturedModId)
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
          {usesJewelEffect(catalog, current) ? (
            <p className="rehearsal-scope-note">
              制作步骤使用增效前基础值；数值目标可选择增效后的有效值，反侧增效与催化品质的合计效果见下方预览。
            </p>
          ) : current.catalyst ? (
            <p className="rehearsal-scope-note">
              制作步骤使用催化前基础值；数值目标可选择基础值或品质后的有效值口径，品质效果见下方预览。
            </p>
          ) : null}
          <p className="rehearsal-scope-note">
            支持普通攻击武器本地面板与三项防御估算；起点品质保留，技能与角色面板尚未计算。
          </p>
        </div>
        <div>
          <strong>{translations[base.name] ?? base.name}</strong>
          <span>{RARITIES[current.rarity]}</span>
        </div>
      </header>

      <ProjectControls
        catalog={catalog}
        project={project}
        onRestore={restoreProject}
        {...(dictionary === undefined ? {} : { dictionary })}
      />
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
      <CraftPricingPanel
        key={targetSession}
        catalog={catalog}
        pricing={pricing}
        costs={costResult}
        materialIds={costMaterials.map((m) => m.id)}
        onChange={setPricing}
        translations={translations}
      />
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
        goals={{
          targetModIds,
          targetValues,
          targetAlternatives,
          targetImplicitValues,
          ...(minimumTargetCount === undefined ? {} : { minimumTargetCount }),
          ...(targetFracturedModId === undefined ? {} : { targetFracturedModId }),
        }}
        appliedSteps={cursor}
        pending={Boolean(
          draft || removalCurrency || socketDraft || guaranteedDraft || boneDraft || fractureDraft,
        )}
        omenLabel={omenLabel}
        onChange={(value) => {
          clearTargetDrafts()
          setStrategy(value)
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
          targetModIds={targetModIds}
          targetValues={targetValues}
          targetAlternatives={targetAlternatives}
          {...(minimumTargetCount === undefined ? {} : { minimumTargetCount })}
          {...(targetFracturedModId === undefined ? {} : { targetFracturedModId })}
          {...(translateLine ? { translateLine } : {})}
          fractureLabel={fractureLabel}
          onPreview={(operation) => {
            setStrategyResultAction(null)
            startRoute(operation)
          }}
          onCancel={() => setStrategyResultAction(null)}
        />
      ) : null}
      <CraftTargets
        {...(minimumTargetCount === undefined ? {} : { minimumTargetCount })}
        onMinimumTargetCountChange={(value) => {
          clearTargetDrafts()
          setMinimumTargetCount(value)
        }}
        key={`${current.baseId}:${targetSession}`}
        catalog={catalog}
        state={current}
        targetImplicitValues={targetImplicitValues}
        onImplicitValuesChange={(values) => {
          clearTargetDrafts()
          setTargetImplicitValues(values)
        }}
        targetModIds={targetModIds}
        targetValues={targetValues}
        targetAlternatives={targetAlternatives}
        {...(targetFracturedModId === undefined ? {} : { targetFracturedModId })}
        onFracturedTargetChange={(id) => {
          clearTargetDrafts()
          setTargetFracturedModId(id)
        }}
        {...(omen === undefined ? {} : { omen })}
        onAlternativesChange={(alternatives) => {
          clearTargetDrafts()
          setTargetAlternatives(alternatives)
          const accepted = new Set([
            ...targetModIds,
            ...alternatives.flatMap((entry) => entry.modIds),
          ])
          setTargetValues((values) => values.filter((entry) => accepted.has(entry.modId)))
        }}
        onValuesChange={(values) => {
          clearTargetDrafts()
          setTargetValues(values)
        }}
        onChange={(ids) => {
          clearTargetDrafts()
          if (targetFracturedModId && !ids.includes(targetFracturedModId))
            setTargetFracturedModId(undefined)
          setTargetModIds(ids)
          if (minimumTargetCount !== undefined && minimumTargetCount > ids.length)
            setMinimumTargetCount(undefined)
          const alternatives = targetAlternatives.filter((entry) => ids.includes(entry.targetModId))
          setTargetAlternatives(alternatives)
          const accepted = new Set([...ids, ...alternatives.flatMap((entry) => entry.modIds)])
          setTargetValues((values) => values.filter((entry) => accepted.has(entry.modId)))
        }}
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
              current.pendingDesecration !== undefined
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
            {CRAFT_OMEN_RULES[omen].addCount === 2 ? '三档' : '基础'}
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
            current.pendingDesecration !== undefined
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
              current.pendingDesecration !== undefined
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
                <div className="rehearsal-removal-choice" key={affix.modId}>
                  {omen === 'whittling' && mod ? <p>目录词缀等级 {mod.level}</p> : null}
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
                    onClick={() => chooseRemoval(removalCurrency, affix.modId, omen)}
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
        <div className="rehearsal-costs">
          {costs.length > 0 ? (
            costs.map((cost) => <span key={cost}>{cost}</span>)
          ) : (
            <span>{costResult.ok ? '尚未消耗通货' : '材料计费失败'}</span>
          )}
        </div>
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
              {...(minimumTargetCount === undefined ? {} : { minimumTargetCount })}
              catalog={catalog}
              translations={translations}
              targetImplicitValues={targetImplicitValues}
              targetModIds={targetModIds}
              targetValues={targetValues}
              targetAlternatives={targetAlternatives}
              {...(targetFracturedModId === undefined ? {} : { targetFracturedModId })}
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
            {...(minimumTargetCount === undefined ? {} : { minimumTargetCount })}
            catalog={catalog}
            state={current}
            label={fractureLabel}
            targetModIds={targetModIds}
            targetValues={targetValues}
            targetAlternatives={targetAlternatives}
            {...(targetFracturedModId === undefined ? {} : { targetFracturedModId })}
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
            targetModIds={targetModIds}
            targetValues={targetValues}
            targetAlternatives={targetAlternatives}
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
          targetModIds={targetModIds}
          targetAlternatives={targetAlternatives}
          targetValues={targetValues}
          disabled={
            draft !== null ||
            removalCurrency !== null ||
            socketDraft !== null ||
            guaranteedDraft !== null ||
            boneDraft !== null ||
            fractureDraft !== null ||
            current.pendingDesecration !== undefined
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
          targetModIds={targetModIds}
          targetAlternatives={targetAlternatives}
          targetValues={targetValues}
          disabled={Boolean(
            draft ||
              removalCurrency ||
              socketDraft ||
              guaranteedDraft ||
              boneDraft ||
              fractureDraft ||
              current.pendingDesecration,
          )}
          {...(translateLine ? { translateLine } : {})}
          onPreview={startGuaranteed}
        />
      ) : null}
      {guaranteedDraft ? (
        <section
          ref={guaranteedDraftRef}
          tabIndex={-1}
          className="rehearsal-draft"
          aria-label={
            guaranteedDraft.kind === 'liquid-emotion' ? '液态情感待应用结果' : '精华待应用结果'
          }
        >
          <h3>{stepLabel(guaranteedDraft)}</h3>
          <EssenceResultDetails
            catalog={catalog}
            state={current}
            operation={guaranteedDraft}
            {...(translateLine ? { translateLine } : {})}
          />
          {preview?.ok ? (
            <p>
              {guaranteedDraft.kind === 'liquid-emotion'
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
            {guaranteedDraft.kind === 'liquid-emotion' ? '取消液态情感结果' : '取消精华结果'}
          </button>
          <button
            type="button"
            className="primary"
            disabled={!preview?.ok}
            onClick={() => applyStep(guaranteedDraft)}
          >
            {guaranteedDraft.kind === 'liquid-emotion' ? '应用液态情感结果' : '应用精华结果'}
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
        key={JSON.stringify(current.catalyst ?? null)}
        catalog={catalog}
        state={current}
        translations={translations}
        {...(translateLine ? { translateLine } : {})}
      />
      <SocketPanel
        key={`${targetSession}:${cursor}:${history[cursor]?.id}`}
        catalog={catalog}
        state={current}
        draft={socketDraft}
        busy={
          draft !== null ||
          removalCurrency !== null ||
          guaranteedDraft !== null ||
          boneDraft !== null ||
          fractureDraft !== null ||
          current.pendingDesecration !== undefined
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
          <p>可继续常规制作；亵渎组也可能被移除。再次施加骨骼前需先移除已有亵渎组。</p>
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
              key={affix.modId}
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
              key={affix.modId}
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

      {(current.implicitLines ?? base.implicit?.split('\n') ?? []).length > 0 ? (
        <section className="rehearsal-implicit" aria-label="当前固有属性">
          <h3>固有属性</h3>
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
              授予技能有等级时保留起点等级，无等级时保留名称；角色需求及全局技能加成尚未计算。带等级范围的授予技能暂不支持神圣石重掷。
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
          {draft.rolls?.map((roll) => {
            const mod = modById.get(roll.modId)
            if (!mod) return null
            return (
              <NumericControls
                key={roll.modId}
                label={mod.name || mod.id}
                patterns={mod.lines}
                values={roll.values}
                onChange={(values) =>
                  setDraft({
                    ...draft,
                    rolls: (draft.rolls ?? []).map((entry) =>
                      entry.modId === roll.modId ? { ...entry, values } : entry,
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
                const affix = current.affixes.find((entry) => entry.modId === draft.removeModId)
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
              {draft.modIds.map((modId) => {
                const affix = (preview?.ok ? preview.value : draft.state).affixes.find(
                  (entry) => entry.modId === modId,
                )
                return affix ? (
                  <AffixCard
                    key={modId}
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
