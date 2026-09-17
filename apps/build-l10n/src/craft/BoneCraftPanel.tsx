import {
  applyCraftStep,
  BONE_DIRECTION_OMEN_RULES,
  BONE_LICH_OMEN_RULES,
  BONE_RULES,
  type BoneCraftOperation,
  type BoneDirectionOmen,
  type BoneLichOmen,
  type BoneOmenConfig,
  boneRevealOmenError,
  type CatalogMod,
  type CraftAffixSelector,
  type CraftBone,
  type CraftCatalog,
  type CraftState,
  type CraftTargetDefinitions,
  craftAffixSpace,
  definitionTargetIdsForMods,
  desecrationCandidates,
  influenceRuneTags,
  inspectNumericLines,
  isCraftBone,
  matchesTargetInterval,
  prepareDesecration,
  preparePutrefaction,
  projectCraftTargetValues,
  renderNumericLines,
  resolveCraftAffix,
  targetDefinitionChanges,
} from '@poe2-tools/item-core'
import { useId, useMemo, useState } from 'react'
import { boneOmenLabels, boneRevealOmenLabel } from './boneOmenLabels'
import { ModStateBadges } from './ModStateBadges'
import { NumericControls } from './NumericControls'
import './essence-catalog.css'

interface BoneCraftPanelProps {
  configuration?: { boneId: CraftBone } & BoneOmenConfig
  catalog: CraftCatalog
  definitions: CraftTargetDefinitions
  state: CraftState
  translations: Record<string, string>
  translateLine?: (line: string) => string | null
  disabled: boolean
  onPreview: (step: BoneCraftOperation) => void
}
export function BoneCraftPanel(props: BoneCraftPanelProps) {
  return (
    <BoneCraftEditor
      key={JSON.stringify([
        props.catalog._meta,
        props.state,
        props.configuration,
        props.definitions,
      ])}
      {...props}
    />
  )
}

function BoneCraftEditor({
  catalog,
  definitions,
  configuration,
  state,
  translations,
  translateLine,
  disabled,
  onPreview,
}: BoneCraftPanelProps) {
  const id = useId()
  const influence = influenceRuneTags(catalog, state)
  const hasInfluence = influence.ok && influence.value.length > 0
  const [boneId, setBoneId] = useState<CraftBone | null>(configuration?.boneId ?? null)
  const [directionOmen, setDirectionOmen] = useState<BoneDirectionOmen | null>(
    configuration?.directionOmen ?? null,
  )
  const [lichOmen, setLichOmen] = useState<BoneLichOmen | null>(configuration?.lichOmen ?? null)
  const [putrefaction, setPutrefaction] = useState(false)
  const config: BoneOmenConfig = {
    ...(directionOmen ? { directionOmen } : {}),
    ...(lichOmen ? { lichOmen } : {}),
  }
  const [kind, setKind] = useState<'prefix' | 'suffix' | null>(null)
  const [removeSelector, setRemoveSelector] = useState<CraftAffixSelector | null>(null)
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<string[]>([])
  const [echoes, setEchoes] = useState(false)
  const [selectingReroll, setSelectingReroll] = useState(false)
  const [reveal, setReveal] = useState<{
    modId: string
    values: number[]
    group: 'first' | 'second'
  } | null>(null)
  const pending = state.pendingDesecration
  const echoesError = hasInfluence
    ? '影响符文与深渊回响的交互待核实，暂不支持此组合。'
    : pending
      ? boneRevealOmenError(pending, 'abyssal_echoes')
      : null
  const echoesLabel = boneRevealOmenLabel('abyssal_echoes', catalog, translations)
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
  const prepared = useMemo(
    () =>
      boneId && !putrefaction
        ? prepareDesecration(catalog, state, boneId, {
            ...(directionOmen ? { directionOmen } : {}),
            ...(lichOmen ? { lichOmen } : {}),
          })
        : undefined,
    [catalog, state, boneId, directionOmen, lichOmen, putrefaction],
  )
  const putrefactionResult = useMemo(
    () => (boneId && putrefaction ? preparePutrefaction(catalog, state, boneId) : null),
    [catalog, state, boneId, putrefaction],
  )
  const influencePutrefaction = useMemo(
    () =>
      hasInfluence && !pending
        ? preparePutrefaction(catalog, state, boneId ?? 'preserved_rib')
        : null,
    [catalog, state, boneId, hasInfluence, pending],
  )
  const putrefactionError =
    influencePutrefaction && !influencePutrefaction.ok ? influencePutrefaction.error : null
  const selectedOmenLabels = boneOmenLabels(pending ?? config, catalog, translations)
  const resetResult = () => {
    setKind(null)
    setRemoveSelector(null)
  }
  const localize = (name: string) =>
    translations[name] ?? catalog.localizedNames?.['zh-CN']?.[name] ?? name
  const removal = removeSelector ? resolveCraftAffix(state, removeSelector) : null
  const removalSpace = removal?.ok
    ? craftAffixSpace(catalog, {
        ...state,
        affixes: state.affixes.filter((_, index) => index !== removal.value.index),
      })
    : null
  const requiresRemoval = prepared?.ok && prepared.value.requiresRemoval
  const kinds = prepared?.ok
    ? requiresRemoval
      ? removal?.ok
        ? prepared.value.kinds.filter((kind) => (removalSpace?.[kind] ?? 0) > 0)
        : []
      : prepared.value.kinds
    : []
  const targetLabels = (ids: string[]) =>
    definitions.targets
      .filter((target) => ids.includes(target.targetId))
      .map((target) => target.modId)
  const affected = (modId: string) => targetLabels(definitionTargetIdsForMods(definitions, [modId]))
  const lostTargets = removal?.ok
    ? targetLabels(
        targetDefinitionChanges(
          catalog,
          state,
          {
            ...state,
            affixes: state.affixes.filter((_, index) => index !== removal.value.index),
          },
          definitions,
        ).lostTargetIds,
      )
    : []
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
  const goal = definitions.values.find((entry) => entry.modId === reveal?.modId)
  const bounds = goal?.bounds
  const revealed = reveal
    ? applyCraftStep(catalog, state, {
        kind: 'desecration-reveal',
        modId: reveal.modId,
        values: reveal.values,
      })
    : null
  const projected = selected
    ? projectCraftTargetValues(catalog, revealed?.ok ? revealed.value : state, selected, goal)
    : null
  const targetText = selected && reveal ? renderNumericLines(selected.lines, reveal.values) : null
  const actualTargetValues =
    projected?.ok && targetText?.ok ? projected.value.read(targetText.value) : null
  const meetsBounds =
    actualTargetValues?.ok &&
    bounds?.every((bound) => matchesTargetInterval(actualTargetValues.value[bound.index], bound))

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

  const candidatePicker = (second: boolean) => {
    const label = second ? '第二组合法候选' : '合法揭示候选'
    return (
      <>
        <p>
          {second
            ? '指定第二组三项；首组仍保留，重选不额外计费。'
            : '从合法候选中指定恰好三项；只固定选项，不会立即获得其中属性。'}
        </p>
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
        <section className="essence-catalog-list" aria-label={label} tabIndex={0}>
          {matches.slice(0, 60).map((mod) => (
            <article key={mod.id}>
              <label>
                <input
                  type="checkbox"
                  aria-label={`${second ? '第二组候选' : '候选'} ${mod.id}`}
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
        {matches.length > 60 ? <p>显示前60项，请搜索缩小范围；已选候选不会因筛选丢失。</p> : null}
        {!matches.length ? <p>没有匹配的候选。</p> : null}
        <button
          type="button"
          disabled={disabled || options.length !== 3 || (!second && echoes && Boolean(echoesError))}
          onClick={() =>
            onPreview(
              second
                ? { kind: 'desecration-reroll', modIds: [...options] }
                : {
                    kind: 'desecration-offer',
                    modIds: [...options],
                    ...(echoes ? { revealOmen: 'abyssal_echoes' as const } : {}),
                  },
            )
          }
        >
          {second ? '预览第二组三项' : '预览三项候选'}
        </button>
      </>
    )
  }
  const fixedGroup = (ids: string[], second: boolean) => (
    <section
      aria-label={
        second ? '第二组揭示选项' : pending?.rerollOptions ? '首组揭示选项' : '固定揭示选项'
      }
      className="essence-catalog-list"
    >
      {ids.map((modId) => {
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
              aria-pressed={
                reveal?.modId === mod.id && reveal.group === (second ? 'second' : 'first')
              }
              disabled={disabled}
              onClick={() => {
                setSelectingReroll(false)
                setOptions([])
                const numeric = inspectNumericLines(mod.lines)
                if (numeric.ok)
                  setReveal({
                    group: second ? 'second' : 'first',
                    modId: mod.id,
                    values: numeric.value.map((range) => range.min),
                  })
              }}
            >
              {second ? '第二组：' : pending?.rerollOptions ? '首组：' : ''}选择揭示 {mod.id}
            </button>
          </article>
        )
      })}
    </section>
  )
  return (
    <section
      className="essence-catalog essence-craft"
      aria-label="骨骼与揭示"
      data-craft-tool="bone"
    >
      <h3>骨骼与揭示</h3>
      <p>
        指定结果演练，不代表真实概率。施加时消耗一份骨骼及各一份施加预兆；回响在固定首组时另计一份，重选与最终揭示不重复计费。
      </p>
      {hasInfluence ? (
        <p>
          影响符文的骨骼候选按目录与规则推导，尚未逐项游戏实测；Uhtred、Kolr、Thrud、Medved、Katla、Vorana
          均支持普通骨骼，Vorana
          另支持保存完好的肋骨与腐烂预兆。影响符文的巫妖、回响及其他腐烂组合待核实。
        </p>
      ) : null}
      {disabled ? <p>请先应用或取消当前草稿。</p> : null}
      {!pending ? (
        <>
          <label>
            骨骼材料
            <select
              aria-label="骨骼材料"
              disabled={disabled || configuration !== undefined}
              value={boneId ?? ''}
              onChange={(event) => {
                const value = event.target.value
                setBoneId(isCraftBone(value) ? value : null)
                resetResult()
                setDirectionOmen(null)
                setLichOmen(null)
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
                      : rule.category === 'jewel'
                        ? '稀有珠宝'
                        : '项链、戒指与腰带'}
                  {rule.maxItemLevel === 64 ? ' · 物等不高于64' : ''}
                  {rule.minModLevel === 40 ? ' · 物等至少40，最低词缀等级40' : ''}
                  {!result.ok ? ` · ${result.error}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              aria-label="使用腐烂预兆"
              checked={putrefaction}
              disabled={
                disabled ||
                configuration !== undefined ||
                (!putrefaction && Boolean(putrefactionError))
              }
              onChange={(event) => {
                setPutrefaction(event.target.checked)
                resetResult()
                setDirectionOmen(null)
                setLichOmen(null)
              }}
            />
            使用{localize('Omen of Putrefaction')}
          </label>
          {putrefactionError ? <p role="status">{putrefactionError}</p> : null}
          {putrefaction ? (
            <>
              <p>替换非破裂词缀并腐化装备，随后逐槽从普通候选中选择。请先完成品质与插槽准备。</p>
              {putrefactionResult ? (
                <p role="status">
                  {putrefactionResult.ok
                    ? `保留 ${putrefactionResult.value.retainedAffixes.length} 组破裂词缀，移除 ${putrefactionResult.value.removedAffixes.length} 组词缀；产生前缀 ${putrefactionResult.value.slots.prefix}、后缀 ${putrefactionResult.value.slots.suffix} 个隐藏槽位。`
                    : putrefactionResult.error}
                </p>
              ) : null}
              <button
                type="button"
                disabled={disabled || !putrefactionResult?.ok}
                onClick={() => {
                  if (boneId && putrefactionResult?.ok) onPreview({ kind: 'putrefy', boneId })
                }}
              >
                预览腐烂预兆结果
              </button>
            </>
          ) : null}
          {!putrefaction ? (
            <>
              <label>
                骨骼方向预兆
                <select
                  aria-label="骨骼方向预兆"
                  disabled={disabled || configuration !== undefined}
                  value={directionOmen ?? ''}
                  onChange={(event) => {
                    setDirectionOmen(
                      (Object.keys(BONE_DIRECTION_OMEN_RULES) as BoneDirectionOmen[]).find(
                        (key) => key === event.target.value,
                      ) ?? null,
                    )
                    resetResult()
                  }}
                >
                  <option value="">不使用方向预兆</option>
                  {Object.entries(BONE_DIRECTION_OMEN_RULES).map(([key, rule]) => (
                    <option key={key} value={key}>
                      {localize(rule.name)} · 仅{rule.kind === 'prefix' ? '前缀' : '后缀'}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                骨骼巫妖预兆
                <select
                  aria-label="骨骼巫妖预兆"
                  disabled={disabled || configuration !== undefined || hasInfluence}
                  value={lichOmen ?? ''}
                  onChange={(event) => {
                    setLichOmen(
                      (Object.keys(BONE_LICH_OMEN_RULES) as BoneLichOmen[]).find(
                        (key) => key === event.target.value,
                      ) ?? null,
                    )
                    resetResult()
                  }}
                >
                  <option value="">不使用巫妖预兆</option>
                  {Object.entries(BONE_LICH_OMEN_RULES).map(([key, rule]) => (
                    <option key={key} value={key}>
                      {localize(rule.name)}
                    </option>
                  ))}
                </select>
              </label>
              {lichOmen ? (
                <p>
                  巫妖预兆仅用于武器与首饰。本工具只支持同一指定巫妖的三候选演练；不足三项的情形暂不支持，不会用普通或其他巫妖填充。
                </p>
              ) : null}
              {boneId && prepared ? (
                <p role="status">
                  {prepared.ok ? '当前骨骼与预兆配置可用于本工具演练。' : prepared.error}
                </p>
              ) : null}
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
                  <p>
                    词缀容量已满时游戏会随机移除一组词缀；这里指定结果用于演练，不能控制游戏中的移除。
                  </p>
                  {directionOmen || lichOmen ? (
                    <p>
                      这里只列出本工具能够完成三候选演练的移除结果，不代表其他游戏结果不可能，也不保证目标受到保护。
                    </p>
                  ) : null}
                  {riskTargets.length ? (
                    <p>随机移除风险中的对应目标词缀：{riskTargets.join('、')}。</p>
                  ) : null}
                  <fieldset disabled={disabled}>
                    <legend>骨骼移除结果</legend>
                    {prepared.value.removableAffixes.map((affix) => {
                      const mod = byId.get(affix.modId)
                      return (
                        <label
                          className="essence-removal-option"
                          key={affix.affixId ?? affix.modId}
                        >
                          <input
                            type="radio"
                            name={`${id}-remove`}
                            value={affix.affixId ?? affix.modId}
                            aria-label={`骨骼移除 ${affix.modId}`}
                            checked={
                              removal?.ok === true &&
                              removal.value.affix.modId === affix.modId &&
                              removal.value.affix.affixId === affix.affixId
                            }
                            onChange={() => {
                              setRemoveSelector({
                                modId: affix.modId,
                                ...(affix.affixId === undefined ? {} : { affixId: affix.affixId }),
                              })
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
                    <p>
                      本次指定移除将移除对应目标词缀：{lostTargets.join('、')}；移除整组全部属性。
                    </p>
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
                      {!kinds.includes(side) ? '（当前配置不可用或须先选择移除）' : ''}
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
                  (requiresRemoval && !removal?.ok)
                }
                onClick={() => {
                  if (boneId && kind)
                    onPreview({
                      kind: 'desecrate',
                      ...config,
                      boneId,
                      affixKind: kind,
                      ...(removal?.ok
                        ? {
                            removeModId: removal.value.affix.modId,
                            ...(removal.value.affix.affixId === undefined
                              ? {}
                              : { removeAffixId: removal.value.affix.affixId }),
                          }
                        : {}),
                    })
                }}
              >
                预览骨骼结果
              </button>
            </>
          ) : null}
        </>
      ) : (
        <>
          {pending.putrefaction ? (
            <>
              <p>
                剩余隐藏槽位：前缀 {pending.putrefaction.prefix}，后缀 {pending.putrefaction.suffix}
                。
              </p>
              <p>
                当前揭示{pending.kind === 'prefix' ? '前缀' : '后缀'}
                ；每次只选择一条，下一槽重新固定候选。装备已腐化。
              </p>
            </>
          ) : (
            <p>待揭示期间可在破裂区演练锁定；其他制作请先完成揭示。</p>
          )}
          <p>
            已固化骨骼预兆：
            {selectedOmenLabels.length
              ? selectedOmenLabels.map((entry) => entry.label).join('、')
              : '未使用'}
            ；此时不能更换。
          </p>
          {pending.lichOmen ? (
            <p>三项候选均须属于指定巫妖；不足三项的情形本工具暂不支持。</p>
          ) : null}
          {!pending.options ? (
            <>
              <label>
                <input
                  type="checkbox"
                  aria-label="首次揭示使用深渊回响"
                  checked={echoes}
                  disabled={disabled || Boolean(echoesError)}
                  onChange={(event) => setEchoes(event.target.checked)}
                />
                首次揭示使用{echoesLabel}
              </label>
              <p>
                必须在看到首组选项前声明；成功固定首组即消耗一份，之后不重选也不退还。预览或取消不计费。
              </p>
              {echoesError ? <p role="status">{echoesError}</p> : null}
              {candidatePicker(false)}
            </>
          ) : (
            <>
              <h4>{pending.rerollOptions ? '首组三项候选' : '已固定三项候选'}</h4>
              <p>首组选项随项目保存；不能在看到首组后补用深渊回响。</p>
              {pending.revealOmen ? (
                <p>{echoesLabel}已在首组固定时消耗；重选和最终揭示不额外计费。</p>
              ) : null}
              {fixedGroup(pending.options, false)}
              {pending.rerollOptions ? (
                <>
                  <h4>第二组三项候选</h4>
                  <p>两组均可选择；跨组同一词缀只会获得一条实际属性。每组独立，不代表概率分布。</p>
                  {fixedGroup(pending.rerollOptions, true)}
                </>
              ) : null}
              {pending.revealOmen && !pending.rerollOptions ? (
                <>
                  <p>已购买一次重选机会；可以直接揭示首组，或指定第二组三项，首组仍保留。</p>
                  {!selectingReroll ? (
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        setSelectingReroll(true)
                        setOptions([])
                        setQuery('')
                        setReveal(null)
                      }}
                    >
                      指定第二组三项
                    </button>
                  ) : (
                    <>
                      <h4>指定第二组三项</h4>
                      {candidatePicker(true)}
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          setSelectingReroll(false)
                          setOptions([])
                        }}
                      >
                        取消第二组选项
                      </button>
                    </>
                  )}
                </>
              ) : null}

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
