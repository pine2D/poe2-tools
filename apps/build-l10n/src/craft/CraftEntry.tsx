import {
  buildInitialBeltImplicitLines,
  buildInitialSkillLines,
  CATALYSTS,
  type CatalogBase,
  type CraftCatalog,
  type CraftState,
  catalystStoredQualityLimit,
  createCraftState,
  fluxCatalogSignature,
  type ItemDictionary,
  importCraftState,
  importIdentifiedCraftState,
  type RestoredTargetCraftProject,
  readBaseGrantedSkills,
  readCatalystQuality,
  readItemQuality,
  resolveCraftImplicitPatterns,
  socketCapacity,
  supportsItemQuality,
  supportsWeaponQuality,
} from '@poe2-tools/item-core'
import { useState } from 'react'
import type { CatalogPanelProps } from './CatalogPanel'
import { ImportSocketSetup } from './ImportSocketSetup'
import { ProjectControls } from './ProjectControls'
import { RehearsalPanel } from './RehearsalPanel'

/** 父级按输入上下文重新挂载，旧历史不会被复用于另一件装备。 */
export function CraftEntry({
  catalog,
  base,
  itemLevel,
  imported,
  translations,
  translateLine,
  dictionary,
  onRestore,
}: {
  catalog: CraftCatalog
  base: CatalogBase
  itemLevel: number
  imported: CatalogPanelProps['imported']
  translations: Record<string, string>
  translateLine: CatalogPanelProps['translateLine']
  dictionary: ItemDictionary | undefined
  onRestore: (project: RestoredTargetCraftProject) => void
}) {
  const [session, setSession] = useState<{
    state: CraftState
    id: number
    importedSockets?: (string | null)[]
    importedQuality?: number
  } | null>(null)
  const [blankCatalyst, setBlankCatalyst] = useState('')
  const [blankCatalystQuality, setBlankCatalystQuality] = useState('20')
  const [catalystDeclaration, setCatalystDeclaration] = useState('')
  const [catalystConfirmed, setCatalystConfirmed] = useState(false)
  const catalystLimit = catalystStoredQualityLimit(catalog, base)
  const [emptySockets, setEmptySockets] = useState(0)
  const [blankQuality, setBlankQuality] = useState(0)
  const [qualityDeclaration, setQualityDeclaration] = useState('')
  const [skillLevels, setSkillLevels] = useState<Record<number, string>>({})
  const [charmSlots, setCharmSlots] = useState(1)
  const beltChoices = [1, 2, 3].filter(
    (slots) => buildInitialBeltImplicitLines(base, itemLevel, slots).ok,
  )
  const selectedCharmSlots = beltChoices.includes(charmSlots) ? charmSlots : 1
  const beltStart =
    base.type === 'Belt' && base.charmLimit !== undefined
      ? buildInitialBeltImplicitLines(base, itemLevel, selectedCharmSlots)
      : null
  const baseSkills = readBaseGrantedSkills(base)
  const skillStart = buildInitialSkillLines(
    base,
    Object.entries(skillLevels)
      .filter(([, value]) => value !== '')
      .map(([lineIndex, displayedLevel]) => ({
        lineIndex: Number(lineIndex),
        displayedLevel: Number(displayedLevel),
      })),
  )
  const matchingImport = imported && (imported.baseId === base.name || imported.baseId === base.id)
  const qualityFromText = matchingImport && imported.item ? readItemQuality(imported.item) : null
  const importedQuality =
    qualityFromText?.ok && qualityFromText.value === undefined && qualityDeclaration !== ''
      ? Number(qualityDeclaration)
      : undefined
  const catalystFromText =
    matchingImport && imported.item ? readCatalystQuality(imported.item) : null
  const declaredCatalystId =
    catalystFromText?.ok &&
    catalystFromText.value?.id === null &&
    catalystDeclaration &&
    catalystConfirmed
      ? catalystDeclaration
      : undefined
  const fromImport =
    matchingImport && imported.item
      ? (fluxCatalogSignature(catalog) ? importIdentifiedCraftState : importCraftState)(
          catalog,
          base.id,
          imported.item,
          {
            base: { english: imported.baseId, candidates: [] },
            mods: imported.mods,
            runes: imported.runes ?? [],
            skills: imported.skills ?? [],
            comparisonOnly: imported.comparisonOnly ?? false,
          },
          undefined,
          importedQuality,
          dictionary?.stats?.entries,
          declaredCatalystId,
        )
      : null
  const blankInput: CraftState = {
    baseId: base.id,
    itemLevel,
    rarity: 'normal',
    affixes: [],
    sourceText: null,
    ...(blankCatalyst && !matchingImport
      ? {
          catalyst: {
            id: blankCatalyst,
            quality: blankCatalystQuality === '' ? Number.NaN : Number(blankCatalystQuality),
            declared: true as const,
          },
        }
      : {}),
    ...(supportsItemQuality(base) || supportsWeaponQuality(base) ? { quality: blankQuality } : {}),
  }
  const capacity =
    catalog.augments !== undefined &&
    catalog._meta.sources.some(
      (source) => source.path === 'src/Data/ModRunes.lua' && /^[a-f0-9]{64}$/.test(source.sha256),
    )
      ? socketCapacity(catalog, blankInput)
      : 0
  // 搜索起点始终未腐化；导入孔位容量独立使用原文状态。
  const importSocketState: CraftState = {
    ...blankInput,
    ...(matchingImport && imported.item?.corrupted ? { corrupted: true } : {}),
  }
  const importCapacity = capacity > 0 ? socketCapacity(catalog, importSocketState) : 0
  const implicitStart = beltStart ?? skillStart
  const blank = implicitStart.ok
    ? createCraftState(catalog, {
        ...blankInput,
        ...((beltStart !== null || baseSkills.length > 0) && implicitStart.value !== undefined
          ? { implicitLines: implicitStart.value }
          : {}),
        ...(capacity > 0 ? { sockets: Array.from({ length: emptySockets }, () => null) } : {}),
      })
    : implicitStart
  const blankImplicit = blank.ok ? resolveCraftImplicitPatterns(base, blank.value) : null
  const startCharm = blankImplicit?.ok ? blankImplicit.value.charm : null
  const readOnlyImport =
    matchingImport && (imported.comparisonOnly || imported.item?.rarity === 'unique')
  function begin(state: CraftState, importedSockets?: (string | null)[], importedQuality?: number) {
    setSession((previous) => ({
      state,
      id: (previous?.id ?? 0) + 1,
      ...(importedSockets === undefined ? {} : { importedSockets: [...importedSockets] }),
      ...(importedQuality === undefined ? {} : { importedQuality }),
    }))
  }
  return (
    <section className="catalog-craft-entry" aria-label="进入通货演练">
      <h4>制作起点</h4>
      <p>
        新建普通基底，或保留当前装备的已知词缀开始演练。改变基底、物等或导入文本会结束当前演练。
      </p>
      {!matchingImport && !readOnlyImport && catalystLimit !== null ? (
        <section aria-label="起点已有催化品质">
          <div className="catalyst-fields">
            <label>
              起点催化品质类型
              <select
                aria-label="起点催化品质类型"
                value={blankCatalyst}
                onChange={(event) => setBlankCatalyst(event.target.value)}
              >
                <option value="">无催化品质</option>
                {CATALYSTS.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </label>
            {blankCatalyst ? (
              <label>
                起点催化品质（%）
                <input
                  aria-label="起点催化品质（%）"
                  type="number"
                  min={0}
                  max={catalystLimit}
                  step={1}
                  value={blankCatalystQuality}
                  onChange={(event) => setBlankCatalystQuality(event.target.value)}
                />
              </label>
            ) : null}
          </div>
          <small>声明起点已有品质，不计材料费用；修改后需重新开始演练。</small>
        </section>
      ) : null}
      {catalystFromText?.ok &&
      catalystFromText.value?.id === null &&
      !readOnlyImport &&
      catalystLimit !== null ? (
        <section aria-label="核对导入催化品质">
          <p>
            原文：{catalystFromText.value.raw}。此品质类型的国服标题尚未核对，请按游戏显示选择。
          </p>
          <label>
            核对催化品质类型
            <select
              aria-label="核对催化品质类型"
              value={catalystDeclaration}
              onChange={(event) => {
                setCatalystDeclaration(event.target.value)
                setCatalystConfirmed(false)
              }}
            >
              <option value="">尚未核对</option>
              {CATALYSTS.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={catalystConfirmed}
              onChange={(event) => setCatalystConfirmed(event.target.checked)}
            />
            已核对类型，且原文数值为高级基础值
          </label>
          <small>使用 Ctrl+Alt+C 的完整范围文本；交易站已增效数值不能作为基础值再次放大。</small>
        </section>
      ) : null}
      {startCharm && !readOnlyImport ? (
        startCharm.fixed ? (
          <p>起点咒符栏：固定 1 栏，不随物品等级增加。</p>
        ) : (
          <label>
            起点咒符栏数
            <select
              aria-label="起点咒符栏数"
              value={selectedCharmSlots}
              onChange={(event) => setCharmSlots(Number(event.target.value))}
            >
              {beltChoices.map((slots) => (
                <option key={slots} value={slots}>
                  {slots} 栏
                </option>
              ))}
            </select>
            <small>
              仅声明搜索起点的已有栏数，不消耗通货；不会修改导入装备。修改后需重新开始演练。
            </small>
          </label>
        )
      ) : null}
      {baseSkills.length > 0 && !readOnlyImport ? (
        <section aria-label="起点授予技能">
          <h4>起点授予技能</h4>
          <p>
            仅声明搜索起点的已有技能等级，不是通货操作；修改后需重新开始。目录范围不代表已核对的掉落概率。
          </p>
          {baseSkills.map((skill, index) => (
            <label key={skill.lineIndex}>
              {translateLine?.(
                `Grants Skill: Level (${skill.minLevel}-${skill.maxLevel}) ${skill.name}`,
              ) ?? skill.name}
              <select
                aria-label={`起点技能等级 ${index + 1}`}
                value={skillLevels[skill.lineIndex] ?? ''}
                onChange={(event) =>
                  setSkillLevels((previous) => ({
                    ...previous,
                    [skill.lineIndex]: event.target.value,
                  }))
                }
              >
                <option value="">尚未核对</option>
                {Array.from(
                  { length: skill.maxLevel - skill.minLevel + 1 },
                  (_, offset) => skill.minLevel + offset,
                ).map((level) => (
                  <option key={level} value={level}>
                    等级 {level}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </section>
      ) : null}
      {(supportsItemQuality(base) || supportsWeaponQuality(base)) && !readOnlyImport ? (
        <label>
          起点已有品质
          <select
            aria-label="起点已有品质"
            value={blankQuality}
            onChange={(event) => setBlankQuality(Number(event.target.value))}
          >
            {Array.from({ length: 31 }, (_, value) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: 数值即固定选项身份。
              <option key={`quality-${value}`} value={value}>
                {value}%
              </option>
            ))}
          </select>
          <small>
            仅用于新建普通基底；声明已有品质，不计品质通货费用。开始后修改需重新开始才生效。
          </small>
        </label>
      ) : null}
      {qualityFromText && !readOnlyImport ? (
        !qualityFromText.ok ? (
          <p>{qualityFromText.error}</p>
        ) : qualityFromText.value !== undefined ? (
          <p>原文品质：{qualityFromText.value}%。</p>
        ) : supportsItemQuality(base) || supportsWeaponQuality(base) ? (
          <label>
            导入装备品质
            <select
              aria-label="导入装备品质"
              value={qualityDeclaration}
              onChange={(event) => setQualityDeclaration(event.target.value)}
            >
              <option value="">尚未核对</option>
              {Array.from({ length: 31 }, (_, value) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: 数值即固定选项身份。
                <option key={`quality-${value}`} value={value}>
                  {value}%
                </option>
              ))}
            </select>
            <small>原文没有品质；请在游戏中核对。补充信息独立保存，重新开始演练后生效。</small>
          </label>
        ) : null
      ) : null}
      {capacity > 0 && !readOnlyImport ? (
        <label>
          起点已有空孔数
          <select
            aria-label="起点已有空孔数"
            value={emptySockets}
            onChange={(event) => setEmptySockets(Number(event.target.value))}
          >
            {Array.from({ length: capacity + 1 }, (_, count) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: 选项数值即身份，固定计数列表。
              <option key={`count-${count}`} value={count}>
                {count}
              </option>
            ))}
          </select>
          <small>仅用于新建普通基底；声明已有空孔，不消耗通货打孔，也不修改导入装备。</small>
        </label>
      ) : null}
      <div className="catalog-craft-actions">
        {blank.ok && !readOnlyImport ? (
          <button type="button" onClick={() => begin(blank.value)}>
            从空白基底开始
          </button>
        ) : !blank.ok && !readOnlyImport ? (
          <p>{blank.error}</p>
        ) : null}
        {fromImport?.ok && imported?.item?.itemLevel === itemLevel && (
          <button type="button" onClick={() => begin(fromImport.value, undefined, importedQuality)}>
            从当前装备开始
          </button>
        )}
      </div>
      {fromImport && !fromImport.ok && <p>{fromImport.error}</p>}
      {fromImport?.ok && imported?.item?.itemLevel !== itemLevel && (
        <p>物等已改变；要从当前装备开始，请恢复原物等 {imported?.item?.itemLevel}。</p>
      )}
      {matchingImport &&
      imported.item &&
      importCapacity > 0 &&
      !readOnlyImport &&
      imported.item.itemLevel === itemLevel ? (
        <ImportSocketSetup
          skillEntries={dictionary?.stats?.entries}
          catalog={catalog}
          state={importSocketState}
          item={imported.item}
          inspection={{
            base: { english: imported.baseId, candidates: [] },
            mods: imported.mods,
            runes: imported.runes ?? [],
            skills: imported.skills ?? [],
            comparisonOnly: imported.comparisonOnly ?? false,
          }}
          capacity={importCapacity}
          translations={translations}
          translateLine={translateLine}
          onBegin={begin}
          {...(importedQuality === undefined ? {} : { importedQuality })}
        />
      ) : null}
      {!session && (
        <ProjectControls
          catalog={catalog}
          {...(dictionary ? { dictionary } : {})}
          onRestore={onRestore}
        />
      )}
      {session && (
        <RehearsalPanel
          key={session.id}
          catalog={catalog}
          initialState={session.state}
          {...(session.importedQuality === undefined
            ? {}
            : { importedQuality: session.importedQuality })}
          {...(session.importedSockets === undefined
            ? {}
            : { importedSockets: session.importedSockets })}
          translations={translations}
          {...(dictionary ? { dictionary } : {})}
          {...(translateLine ? { translateLine } : {})}
        />
      )}
    </section>
  )
}
