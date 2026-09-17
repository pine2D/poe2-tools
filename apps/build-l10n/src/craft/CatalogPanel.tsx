import {
  type CatalogBase,
  type CatalogModMatch,
  type CraftCatalog,
  type InspectedMod,
  type InspectedRune,
  type InspectedSkill,
  type ItemDictionary,
  type ItemDocument,
  inspectModPool,
  isBasicJewel,
  isRadiusJewel,
  jewelSourceHash,
  matchCatalogMods,
  type PoolEntry,
  parseCraftCatalog,
  type RestoredTargetCraftProject,
  resolveCatalogBase,
  searchBases,
} from '@poe2-tools/item-core'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlloyCatalog } from './AlloyCatalog'
import { BaseImplicitPreview } from './BaseImplicitPreview'
import { CraftEntry } from './CraftEntry'
import { EssenceCatalog } from './EssenceCatalog'
import { FluxCatalog } from './FluxCatalog'
import { LiquidEmotionCatalog } from './LiquidEmotionCatalog'
import { ModStateBadges } from './ModStateBadges'
import { ProjectControls } from './ProjectControls'
import { RehearsalPanel } from './RehearsalPanel'
import { useAlloyCatalog } from './useAlloyCatalog'
import { useFluxCatalog } from './useFluxCatalog'
import { useRuneforgingCatalog } from './useRuneforgingCatalog'
import './catalog.css'

export interface CatalogPanelProps {
  onCatalogReady?: (catalog: CraftCatalog) => void
  translations: Record<string, string>
  locale?: 'zh-CN' | 'zh-TW'
  dictionary?: ItemDictionary
  initialBaseId?: string
  initialItemLevel?: number
  translateLine?: (line: string) => string | null
  imported?: {
    baseId: string
    mods: InspectedMod[]
    runes?: InspectedRune[]
    skills?: InspectedSkill[]
    implicitLines?: string[]
    item?: ItemDocument
    comparisonOnly?: boolean
  }
  fetchImpl?: typeof fetch
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; catalog: CraftCatalog }

const MOD_LIMIT = 80
const SPECIAL_TYPES = new Set(['flask', 'charm'])
const PROPERTY_LABELS: Record<string, string> = {
  level: '等级',
  int: '智慧',
  str: '力量',
  dex: '敏捷',
  energyshield: '能量护盾',
  armour: '护甲',
  evasion: '闪避值',
  ward: '结界',
}

function normalizeItemLevel(value: number | undefined) {
  if (!Number.isFinite(value)) return 1
  return Math.min(100, Math.max(1, Math.floor(value ?? 1)))
}

function displayName(name: string, translations: Record<string, string>) {
  return translations[name] ? `${translations[name]} · ${name}` : name
}

function VariantSummary({
  base,
  translations,
  translateLine,
}: {
  base: CatalogBase
  translations: Record<string, string>
  translateLine: ((line: string) => string | null) | undefined
}) {
  const translatedImplicit = base.implicit
    ?.split('\n')
    .map((line) => translateLine?.(line))
    .filter((line): line is string => line !== null && line !== undefined)
  return (
    <>
      <strong>{displayName(base.name, translations)}</strong>
      <span>{base.type}</span>
      {base.variant && (
        <>
          {translatedImplicit && translatedImplicit.length > 0 ? (
            <span className="catalog-variant-translation">{translatedImplicit.join('\n')}</span>
          ) : null}
          {base.implicit ? (
            <code className="catalog-variant-implicit">{base.implicit}</code>
          ) : (
            <span>无固有属性</span>
          )}
          <span>
            {Object.entries(base.properties)
              .map(([key, value]) => `${PROPERTY_LABELS[key.toLowerCase()] ?? key} ${value}`)
              .join(' · ') || '无基础属性'}
          </span>
          <span>
            {Object.entries(base.requirements)
              .map(([key, value]) => `${PROPERTY_LABELS[key.toLowerCase()] ?? key} ${value}`)
              .join(' · ') || '无需求'}
          </span>
          {base.variant.visibility === 'mixed' ? <em>来源含隐藏记录</em> : null}
        </>
      )}
    </>
  )
}

function PropertyList({ title, values }: { title: string; values: Record<string, number> }) {
  const entries = Object.entries(values)
  if (entries.length === 0) return null
  return (
    <section className="catalog-facts">
      <h4>{title}</h4>
      <dl>
        {entries.map(([name, value]) => (
          <div key={name}>
            <dt>{PROPERTY_LABELS[name.toLowerCase()] ?? name}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function ModGroup({
  entries,
  translateLine,
}: {
  entries: PoolEntry[]
  translateLine: ((line: string) => string | null) | undefined
}) {
  const first = entries[0]
  if (!first) return null
  const firstTranslation = translateLine?.(first.mod.lines[0] ?? '')
  return (
    <details className="catalog-mod-group">
      <summary>
        <span>
          {first.mod.group}
          {firstTranslation ? <small>{firstTranslation}</small> : null}
        </span>
        <span>{entries.length} 条</span>
      </summary>
      <div className="catalog-mod-list">
        {entries.map(({ mod }) => (
          <article key={mod.id}>
            <header>
              <strong>{mod.name || mod.id}</strong>
              <span>需求等级 {mod.level}</span>
            </header>
            {mod.lines.map((line) => {
              const translated = translateLine?.(line)
              return (
                <div className="catalog-mod-line" key={line}>
                  {translated ? <span className="catalog-mod-zh">{translated}</span> : null}
                  <code className="catalog-mod-en">{line}</code>
                </div>
              )
            })}
          </article>
        ))}
      </div>
    </details>
  )
}

function groupEntries(entries: PoolEntry[]) {
  const grouped = new Map<string, PoolEntry[]>()
  for (const entry of entries) {
    const group = grouped.get(entry.mod.group)
    if (group) group.push(entry)
    else grouped.set(entry.mod.group, [entry])
  }
  return grouped
}

const MATCH_LABELS: Record<CatalogModMatch['status'], string> = {
  matched: '已对应',
  ambiguous: '多个候选',
  unmatched: '未对应',
  untranslated: '待翻译',
  unsupported: '特殊属性保留',
}

function ImportedMods({
  matches,
  mods,
  fractured,
}: {
  matches: CatalogModMatch[]
  mods: InspectedMod[]
  fractured: boolean
}) {
  const prefixes = mods.filter(({ mod }) => mod.kind === 'prefix').length
  const suffixes = mods.filter(({ mod }) => mod.kind === 'suffix').length
  return (
    <section className="catalog-imported" aria-label="当前装备词缀">
      <header className="catalog-imported-heading">
        <div>
          <h4>当前装备词缀</h4>
          {fractured && <span className="craft-fractured-item">破裂物品</span>}
          <p className="catalog-imported-note">
            目录对应仅用于标记已有同组，尚未验证这件装备能够执行具体制作操作。
          </p>
        </div>
        <p className="catalog-imported-counts">
          <span>前缀 · {prefixes} 组</span>
          <span>后缀 · {suffixes} 组</span>
        </p>
      </header>
      <div className="catalog-imported-list">
        {matches.map((match) => {
          const source = mods[match.sourceIndex]
          if (!source) return null
          return (
            <article key={match.sourceIndex}>
              <header className="catalog-imported-item-heading">
                <strong>{MATCH_LABELS[match.status]}</strong>
                <span className="catalog-imported-kind">
                  {source.mod.kind === 'prefix'
                    ? '前缀'
                    : source.mod.kind === 'suffix'
                      ? '后缀'
                      : '特殊'}
                </span>
              </header>
              <ModStateBadges states={source.mod.states} />
              {source.stats.map(({ source: stat }) => (
                <code key={stat.line}>{stat.raw}</code>
              ))}
              {match.candidates.length > 0 && (
                <ul>
                  {match.candidates.map((candidate) => (
                    <li key={candidate.id}>
                      {candidate.name} · {candidate.group} · 需求等级 {candidate.level}
                    </li>
                  ))}
                </ul>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}

export function CatalogPanel({
  translations: baseTranslations,
  locale = 'zh-CN',
  dictionary,
  initialBaseId,
  initialItemLevel = 1,
  translateLine,
  imported,
  fetchImpl = fetch,
  onCatalogReady,
}: CatalogPanelProps) {
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [baseQuery, setBaseQuery] = useState('')
  const [modQuery, setModQuery] = useState('')
  const [kind, setKind] = useState<'all' | 'prefix' | 'suffix'>('all')
  const [selectedBaseId, setSelectedBaseId] = useState<string>()
  const [itemLevel, setItemLevel] = useState(() => normalizeItemLevel(initialItemLevel))
  const [visibleLimit, setVisibleLimit] = useState(MOD_LIMIT)
  const inputKey = JSON.stringify([
    imported?.item?.rawText,
    imported?.baseId,
    imported?.mods.map(({ stats }) => stats.map(({ resolution }) => resolution.english)),
    imported?.runes?.map(({ resolution }) => resolution.english),
  ])
  const [restoredSession, setRestoredSession] = useState<{
    value: RestoredTargetCraftProject
    id: number
    inputKey: string
  } | null>(null)
  const restored = restoredSession?.inputKey === inputKey ? restoredSession : null
  useEffect(() => {
    setRestoredSession((previous) => (previous?.inputKey === inputKey ? previous : null))
  }, [inputKey])
  const restoreProject = (value: RestoredTargetCraftProject) => {
    // 显式恢复优先于目录刚加载时尚未执行的初始定位。
    appliedImport.current = importSignature
    setSelectedBaseId(value.project.initialState.baseId)
    setItemLevel(value.project.initialState.itemLevel)
    setBaseQuery('')
    setRestoredSession((previous) => ({ value, id: (previous?.id ?? 0) + 1, inputKey }))
  }
  const importSignature = `${initialBaseId ?? ''}\u0000${initialItemLevel}\u0000${JSON.stringify(imported?.implicitLines ?? [])}`
  const appliedImport = useRef<string | undefined>(undefined)

  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt 是显式重试触发器。
  useEffect(() => {
    const controller = new AbortController()
    let active = true
    setLoadState({ status: 'loading' })
    void fetchImpl(`${import.meta.env.BASE_URL}craft-data/catalog.json`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const parsed = parseCraftCatalog(await response.json())
        if (active) setLoadState({ status: 'ready', catalog: parsed })
      })
      .catch(() => {
        if (active && !controller.signal.aborted) setLoadState({ status: 'error' })
      })
    return () => {
      active = false
      controller.abort()
    }
  }, [attempt, fetchImpl])

  const primaryCatalog = loadState.status === 'ready' ? loadState.catalog : undefined
  const alloyResource = useAlloyCatalog(primaryCatalog, fetchImpl, true)
  const alloyTable = alloyResource.table
  const runeforgingResource = useRuneforgingCatalog(primaryCatalog, fetchImpl, true)
  const runeforgingTable = runeforgingResource.table
  const [fluxRequested, setFluxRequested] = useState(false)
  const fluxResource = useFluxCatalog(primaryCatalog, fetchImpl, fluxRequested)
  const fluxTable = fluxResource.table
  const catalog = useMemo(
    () =>
      primaryCatalog && (alloyTable || fluxTable || runeforgingTable)
        ? {
            ...primaryCatalog,
            ...(alloyTable ? { alloys: alloyTable } : {}),
            ...(fluxTable ? { fluxes: fluxTable } : {}),
            ...(runeforgingTable ? { runeforging: runeforgingTable } : {}),
          }
        : primaryCatalog,
    [primaryCatalog, alloyTable, fluxTable, runeforgingTable],
  )
  useEffect(() => {
    if (catalog) onCatalogReady?.(catalog)
  }, [catalog, onCatalogReady])
  const translations = useMemo(
    () => ({ ...catalog?.localizedNames?.[locale], ...baseTranslations }),
    [baseTranslations, catalog, locale],
  )
  useEffect(() => {
    if (!catalog || appliedImport.current === importSignature) return
    appliedImport.current = importSignature
    setRestoredSession(null)
    const resolution = resolveCatalogBase(
      catalog.bases,
      initialBaseId ?? '',
      imported?.implicitLines,
    )
    setSelectedBaseId(resolution.selected?.id)
    setItemLevel(normalizeItemLevel(initialItemLevel))
    setBaseQuery('')
  }, [catalog, importSignature, imported?.implicitLines, initialBaseId, initialItemLevel])

  const retry = useCallback(() => setAttempt((value) => value + 1), [])
  const bases = useMemo(
    () => (catalog ? searchBases(catalog.bases, baseQuery, translations, 40) : []),
    [baseQuery, catalog, translations],
  )
  const selectedBase = catalog?.bases.find((base) => base.id === selectedBaseId)
  const unresolvedVariants = useMemo(
    () =>
      catalog && !selectedBase && initialBaseId
        ? resolveCatalogBase(catalog.bases, initialBaseId, imported?.implicitLines).candidates
        : [],
    [catalog, imported?.implicitLines, initialBaseId, selectedBase],
  )
  const unavailablePoolReason = !selectedBase
    ? null
    : SPECIAL_TYPES.has(selectedBase.type.trim().toLowerCase())
      ? '药剂与咒符的专属词缀池尚未收录，因此不展示词缀结果。'
      : selectedBase.type === 'Jewel'
        ? !isBasicJewel(selectedBase) && !isRadiusJewel(selectedBase)
          ? '特殊珠宝的制作词缀池尚未开放。'
          : !catalog || jewelSourceHash(catalog) === null
            ? '当前目录缺少已核验的珠宝词缀来源。'
            : null
        : null
  const importedMatches = useMemo(
    () =>
      selectedBase &&
      catalog &&
      imported &&
      (imported.baseId === selectedBase.id || imported.baseId === selectedBase.name)
        ? matchCatalogMods(selectedBase, catalog.modifiers, imported.mods)
        : [],
    [catalog, imported, selectedBase],
  )
  const occupiedGroups = useMemo(
    () =>
      importedMatches.flatMap((match) =>
        match.status === 'matched' && match.candidates.length === 1
          ? [match.candidates[0]?.group].filter((group): group is string => group !== undefined)
          : [],
      ),
    [importedMatches],
  )
  const inspected = useMemo(
    () =>
      selectedBase && catalog && !unavailablePoolReason
        ? inspectModPool(selectedBase, catalog.modifiers, itemLevel, occupiedGroups)
        : [],
    [catalog, itemLevel, occupiedGroups, selectedBase, unavailablePoolReason],
  )
  const filtered = useMemo(() => {
    const needle = modQuery.trim().toLowerCase()
    return inspected.filter(({ mod }) => {
      if (kind !== 'all' && mod.kind !== kind) return false
      const translatedLines = mod.lines.map((line) => translateLine?.(line) ?? '').join(' ')
      const content = `${mod.id} ${mod.name} ${mod.group} ${mod.lines.join(' ')} ${translatedLines}`
      return content.toLowerCase().includes(needle)
    })
  }, [inspected, kind, modQuery, translateLine])
  const visible = filtered.slice(0, visibleLimit)
  const available = visible.filter((entry) => entry.reasons.length === 0)
  const conflicts = visible.filter((entry) => entry.reasons.includes('conflict'))
  const levelBlocked = visible.filter(
    (entry) => entry.reasons.includes('level') && !entry.reasons.includes('conflict'),
  )
  if (loadState.status === 'loading')
    return (
      <section className="catalog-panel" aria-busy="true">
        正在加载制作目录…
      </section>
    )
  if (loadState.status === 'error')
    return (
      <section className="catalog-panel catalog-error" role="status">
        <h2>制作目录加载失败</h2>
        <p>现有装备解析与中英对照不受影响。</p>
        <button type="button" onClick={retry}>
          重试制作目录
        </button>
      </section>
    )

  const readyCatalog = catalog ?? loadState.catalog

  return (
    <section className="catalog-panel">
      {fluxResource.table ? (
        <p role="status">溶剂关系已加载，可恢复包含转换历史的项目。</p>
      ) : fluxResource.loading ? (
        <p role="status">正在加载溶剂关系，其他制作可继续使用。</p>
      ) : fluxResource.error ? (
        <p role="status">
          {fluxResource.error}{' '}
          <button type="button" onClick={fluxResource.retry}>
            重载溶剂关系
          </button>
        </p>
      ) : (
        <button type="button" onClick={() => setFluxRequested(true)}>
          加载溶剂关系
        </button>
      )}
      {runeforgingResource.loading ? (
        <p role="status">正在加载可选锻造关系，其他制作可继续使用。</p>
      ) : null}
      {runeforgingResource.error ? (
        <p role="status">
          {runeforgingResource.error}{' '}
          <button type="button" onClick={runeforgingResource.retry}>
            重载锻造关系
          </button>
        </p>
      ) : null}
      {alloyResource.loading ? (
        <p role="status">正在加载可选合金关系，普通制作可继续使用。</p>
      ) : null}
      {alloyResource.error ? (
        <p role="status">
          {alloyResource.error}{' '}
          <button type="button" onClick={alloyResource.retry}>
            重载合金关系
          </button>
        </p>
      ) : null}
      <header className="catalog-heading">
        <div>
          <h2>基底目录</h2>
          <p>按基底和物品等级查看常规词缀；导入后标明已对应的冲突组。</p>
        </div>
        <dl>
          <div>
            <dt>PoB2 快照</dt>
            <dd>
              <code>{readyCatalog._meta.sourceCommit.slice(0, 8)}</code>
            </dd>
          </div>
          <div>
            <dt>游戏版本</dt>
            <dd>{readyCatalog._meta.gameVersion ?? '未核对'}</dd>
          </div>
        </dl>
      </header>
      <p className="catalog-notice">
        基底与属性来自 PoB2
        固定提交快照，通货和符文显示名另用三服官方静态数据对齐。源数据没有真实概率权重，因此这里不显示概率，也不推断词缀阶级。
        <a href={`${import.meta.env.BASE_URL}craft-data/NOTICE.md`}>数据来源与许可</a>
      </p>
      {!selectedBase && (
        <ProjectControls
          catalog={readyCatalog}
          {...(dictionary ? { dictionary } : {})}
          onRestore={restoreProject}
        />
      )}
      {readyCatalog._meta.excludedBases.length > 0 && (
        <details className="catalog-excluded">
          <summary>已隔离基底 · {readyCatalog._meta.excludedBases.length}</summary>
          <ul>
            {readyCatalog._meta.excludedBases.map((base) => (
              <li key={base.id}>
                <code>{base.id}</code>：{base.reason}
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="catalog-layout">
        <aside className="catalog-browser">
          <label>
            搜索基底
            <input
              aria-label="搜索基底"
              type="search"
              value={baseQuery}
              onChange={(event) => {
                setBaseQuery(event.target.value)
                setVisibleLimit(MOD_LIMIT)
              }}
              placeholder="中文、英文或类别"
            />
          </label>
          <p className="catalog-count">显示 {bases.length} 条，最多 40 条；隐藏基底已排除。</p>
          <div className="catalog-base-list">
            {bases.map((base) => (
              <button
                className={base.id === selectedBase?.id ? 'is-selected' : ''}
                type="button"
                key={base.id}
                onClick={() => {
                  // 显式选择优先于目录刚加载时尚未执行的初始定位。
                  appliedImport.current = importSignature
                  setRestoredSession(null)
                  setSelectedBaseId(base.id)
                  setVisibleLimit(MOD_LIMIT)
                }}
              >
                <VariantSummary
                  base={base}
                  translations={translations}
                  translateLine={translateLine}
                />
              </button>
            ))}
          </div>
        </aside>

        <div className="catalog-detail">
          {!selectedBase && unresolvedVariants.length > 1 && (
            <section className="catalog-variant-chooser" aria-label="选择基底变体">
              <h3>请选择具体变体</h3>
              <p>同名基底有不同属性；选择只确定目录身份，不代表获得制作权限。</p>
              <div className="catalog-variant-options">
                {unresolvedVariants.map((base) => (
                  <button
                    type="button"
                    key={base.id}
                    onClick={() => {
                      appliedImport.current = importSignature
                      setRestoredSession(null)
                      setSelectedBaseId(base.id)
                      setVisibleLimit(MOD_LIMIT)
                    }}
                  >
                    <VariantSummary
                      base={base}
                      translations={translations}
                      translateLine={translateLine}
                    />
                  </button>
                ))}
              </div>
            </section>
          )}
          {selectedBase ? (
            <>
              <header className="catalog-base-heading">
                <div>
                  <h3>{displayName(selectedBase.name, translations)}</h3>
                  <p>{selectedBase.type}</p>
                </div>
                <label>
                  物品等级
                  <input
                    aria-label="物品等级"
                    type="number"
                    min="1"
                    max="100"
                    value={itemLevel}
                    onChange={(event) => {
                      setRestoredSession(null)
                      setItemLevel(normalizeItemLevel(Number(event.target.value)))
                    }}
                  />
                </label>
              </header>
              <div className="catalog-base-facts">
                <PropertyList title="基础属性" values={selectedBase.properties} />
                <PropertyList title="需求" values={selectedBase.requirements} />
                <BaseImplicitPreview
                  key={JSON.stringify([selectedBase.id, selectedBase.implicit])}
                  base={selectedBase}
                  translateLine={translateLine}
                />
                {selectedBase.socketLimit !== null && (
                  <section className="catalog-facts">
                    <h4>来源插槽容量</h4>
                    <p>{selectedBase.socketLimit}</p>
                    <small>来源容量不代表已有孔数或普通打孔上限。</small>
                  </section>
                )}
              </div>
              {selectedBase.runeforged && (
                <p className="catalog-runeforged">
                  这是 runeforged 基底，后续制作操作需要考虑其特殊机制。
                </p>
              )}
              {selectedBase.variant?.visibility === 'mixed' && (
                <p className="catalog-variant-note">此变体来源含隐藏记录。</p>
              )}
              {selectedBase.type === 'Jewel' ? (
                <LiquidEmotionCatalog
                  catalog={readyCatalog}
                  base={selectedBase}
                  locale={locale}
                  translateLine={translateLine}
                />
              ) : (
                <EssenceCatalog
                  catalog={readyCatalog}
                  base={selectedBase}
                  locale={locale}
                  translateLine={translateLine}
                />
              )}
              <AlloyCatalog
                catalog={loadState.catalog}
                resource={alloyResource}
                base={selectedBase}
                locale={locale}
                translateLine={translateLine}
                fetchImpl={fetchImpl}
              />
              <FluxCatalog
                catalog={loadState.catalog}
                resource={fluxResource}
                onRequest={() => setFluxRequested(true)}
                base={selectedBase}
                locale={locale}
                translateLine={translateLine}
                fetchImpl={fetchImpl}
              />
              {restored ? (
                <RehearsalPanel
                  key={restored.id}
                  catalog={readyCatalog}
                  initialState={restored.value.project.initialState}
                  initialProject={restored.value}
                  translations={translations}
                  {...(dictionary ? { dictionary } : {})}
                  {...(translateLine ? { translateLine } : {})}
                />
              ) : (
                <CraftEntry
                  key={JSON.stringify([
                    selectedBase.id,
                    itemLevel,
                    imported?.item?.rawText,
                    imported?.mods.map(({ stats }) =>
                      stats.map(({ resolution }) => resolution.english),
                    ),
                    imported?.comparisonOnly,
                    imported?.runes?.map(({ resolution }) => resolution.english),
                    imported?.skills?.map(({ resolution }) => resolution.english),
                  ])}
                  catalog={readyCatalog}
                  base={selectedBase}
                  itemLevel={itemLevel}
                  imported={imported}
                  translations={translations}
                  translateLine={translateLine}
                  dictionary={dictionary}
                  onRestore={restoreProject}
                />
              )}
              {imported &&
                (imported.baseId === selectedBase.id || imported.baseId === selectedBase.name) &&
                (importedMatches.length > 0 || imported.item?.fractured) && (
                  <ImportedMods
                    matches={importedMatches}
                    mods={imported.mods}
                    fractured={imported.item?.fractured === true}
                  />
                )}
              {unavailablePoolReason ? (
                <p className="catalog-empty">{unavailablePoolReason}</p>
              ) : (
                <section className="catalog-pool" aria-label="词缀池">
                  {isRadiusJewel(selectedBase) ? (
                    <p>
                      范围珠宝词缀按完整天赋范围显示，作用于指定天赋。支持常规通货和远古液态情感演练，可比较半径与词缀变化；树上覆盖计算及真实权重尚未接入。
                    </p>
                  ) : null}
                  {isBasicJewel(selectedBase) ? (
                    <p>
                      普通常规词缀池；液态保证属性请查看上方材料目录。目录等级用于核对生成资格，不代表游戏词缀阶级；当前没有真实权重。
                    </p>
                  ) : null}
                  <div className="catalog-pool-controls">
                    <label>
                      搜索词缀
                      <input
                        type="search"
                        aria-label="搜索词缀"
                        value={modQuery}
                        onChange={(event) => {
                          setModQuery(event.target.value)
                          setVisibleLimit(MOD_LIMIT)
                        }}
                        placeholder="名称、组或中英文属性"
                      />
                    </label>
                    <label>
                      位置
                      <select
                        aria-label="词缀位置"
                        value={kind}
                        onChange={(event) => {
                          setKind(event.target.value as typeof kind)
                          setVisibleLimit(MOD_LIMIT)
                        }}
                      >
                        <option value="all">全部</option>
                        <option value="prefix">前缀</option>
                        <option value="suffix">后缀</option>
                      </select>
                    </label>
                  </div>
                  <p className="catalog-count">
                    匹配 {filtered.length} 条，当前展示 {visible.length} 条。
                  </p>
                  {available.length > 0 && (
                    <section>
                      <h4 className="catalog-pool-heading">可出现 · {available.length}</h4>
                      {[...groupEntries(available)].map(([group, entries]) => (
                        <ModGroup key={group} entries={entries} translateLine={translateLine} />
                      ))}
                    </section>
                  )}
                  {levelBlocked.length > 0 && (
                    <section className="catalog-blocked">
                      <h4 className="catalog-pool-heading catalog-blocked-title">
                        等级不足 · {levelBlocked.length}
                      </h4>
                      {[...groupEntries(levelBlocked)].map(([group, entries]) => (
                        <ModGroup key={group} entries={entries} translateLine={translateLine} />
                      ))}
                    </section>
                  )}
                  {conflicts.length > 0 && (
                    <section className="catalog-conflicts">
                      <h4 className="catalog-pool-heading catalog-conflicts-title">
                        已有同组 · {conflicts.length}
                      </h4>
                      {conflicts.some((entry) => entry.reasons.includes('level')) && (
                        <p className="catalog-conflicts-note">其中部分词缀同时等级不足。</p>
                      )}
                      {[...groupEntries(conflicts)].map(([group, entries]) => (
                        <ModGroup key={group} entries={entries} translateLine={translateLine} />
                      ))}
                    </section>
                  )}
                  {filtered.length === 0 && <p className="catalog-empty">没有匹配的词缀。</p>}
                  {visible.length < filtered.length && (
                    <button
                      className="catalog-more"
                      type="button"
                      onClick={() => setVisibleLimit((limit) => limit + MOD_LIMIT)}
                    >
                      显示更多词缀
                    </button>
                  )}
                </section>
              )}
            </>
          ) : unresolvedVariants.length <= 1 ? (
            <p className="catalog-empty">选择一个基底查看基础信息与词缀池。</p>
          ) : null}
        </div>
      </div>
    </section>
  )
}
