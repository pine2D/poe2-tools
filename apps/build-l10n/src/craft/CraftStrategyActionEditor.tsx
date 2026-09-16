import {
  BONE_DIRECTION_OMEN_RULES,
  BONE_LICH_OMEN_RULES,
  BONE_RULES,
  type BoneDirectionOmen,
  type BoneLichOmen,
  CRAFT_CURRENCY_LABELS,
  CRAFT_OMEN_RULES,
  type CraftBone,
  type CraftCatalog,
  type CraftCurrency,
  type CraftOmen,
  type CraftState,
  type CraftStrategyAction,
  craftOmenError,
  ESSENCE_OMEN_RULES,
  type EssenceOmen,
  essenceCraftMode,
  FLUXES,
  fluxCatalogSignature,
  inspectCraftAlloys,
  inspectLiquidEmotions,
  inspectPerfectFluxCraft,
  preparePerfectFluxCraft,
  prepareRuneforgeCraft,
  runeforgingCatalogSignature,
  socketCandidates,
} from '@poe2-tools/item-core'
import { useMemo, useState } from 'react'

export function strategyActionLabel(
  action: CraftStrategyAction,
  catalog: CraftCatalog,
  translations: Record<string, string>,
  omenLabel: (id: CraftOmen) => string,
): string {
  const local = (name: string) =>
    translations[name] ?? catalog.localizedNames?.['zh-CN']?.[name] ?? name
  if (action.kind === 'runeforge') return '防具锻造'
  if (action.kind === 'perfect-flux')
    return `${local('Perfect Flux')}（操作前最高等级 ${action.previousMaxLevel} → 20）`
  if (action.kind === 'vaal') return local('Vaal Orb')
  if (action.kind === 'architect') return local("Architect's Orb")
  if (action.kind === 'extraction') return local('Orb of Extraction')
  if (action.kind === 'stop') return '停止'
  if (action.kind === 'jump') return '仅判断并跳转'
  if (action.kind === 'reveal') return '继续亵渎揭示'
  if (action.kind === 'fracture') return local('Fracturing Orb')
  if (action.kind === 'flux')
    return local(FLUXES.find((flux) => flux.id === action.fluxId)?.name ?? action.fluxId)
  if (action.kind === 'alloy')
    return local(
      catalog.alloys?.alloys.find((entry) => entry.id === action.alloyId)?.name ?? action.alloyId,
    )
  if (action.kind === 'liquid-emotion')
    return local(
      catalog.liquidEmotions?.find((e) => e.id === action.emotionId)?.name ?? action.emotionId,
    )
  if (action.kind === 'artificer') return '巧匠石：添加一个孔'
  if (action.kind === 'socket')
    return `${local(catalog.augments?.find((e) => e.id === action.augmentId)?.name ?? action.augmentId)} → ${action.socketIndex === 'first-empty' ? '第一空孔' : `孔位 ${action.socketIndex + 1}（覆盖旧符文）`}`
  if (action.kind === 'essence')
    return (
      local(catalog.essences?.find((e) => e.id === action.essenceId)?.name ?? action.essenceId) +
      (action.omen ? ` + ${local(ESSENCE_OMEN_RULES[action.omen].name)}` : '')
    )
  if (action.kind === 'desecrate')
    return [
      local(BONE_RULES[action.boneId].name),
      ...(action.directionOmen
        ? [local(BONE_DIRECTION_OMEN_RULES[action.directionOmen].name)]
        : []),
      ...(action.lichOmen ? [local(BONE_LICH_OMEN_RULES[action.lichOmen].name)] : []),
    ].join(' + ')
  return (
    CRAFT_CURRENCY_LABELS[action.currency] + (action.omen ? ` + ${omenLabel(action.omen)}` : '')
  )
}
interface Props {
  allowJump?: boolean
  number: number
  action: CraftStrategyAction
  catalog: CraftCatalog
  state: CraftState
  translations: Record<string, string>
  omenLabel: (id: CraftOmen) => string
  onChange: (action: CraftStrategyAction) => void
}
export function CraftStrategyActionEditor({
  allowJump = false,
  number,
  action,
  catalog,
  state,
  translations,
  omenLabel,
  onChange,
}: Props) {
  const local = (name: string) =>
    translations[name] ?? catalog.localizedNames?.['zh-CN']?.[name] ?? name
  const declarationContext = useMemo(() => ({ catalog, state, action }), [catalog, state, action])
  const [declarationDraft, setDeclarationDraft] = useState<{
    context: typeof declarationContext
    value: string
  } | null>(null)
  const declaration = declarationDraft?.context === declarationContext ? declarationDraft : null
  const runeforge = action.kind === 'runeforge' ? prepareRuneforgeCraft(catalog, state) : null
  const inspectedPerfect = inspectPerfectFluxCraft(catalog, state)
  const essences = (catalog.essences ?? []).filter((e) => essenceCraftMode(e.id) !== null)
  const base = catalog.bases.find((entry) => entry.id === state.baseId)
  const alloys = base
    ? inspectCraftAlloys(catalog, base)
        .filter((entry) => entry.mod !== null)
        .map((entry) => entry.alloy)
    : []
  // 指引可提前配置；只按基底映射筛选，不受当前稀有度、已有工艺或待揭示状态限制。
  const emotions = base
    ? inspectLiquidEmotions(catalog, base)
        .filter((entry) => entry.reason === null)
        .map((entry) => entry.emotion)
    : []
  // 配置允许早于打孔；开始时仍核对真实孔位和材料。
  const augments = socketCandidates(catalog, {
    ...state,
    sockets: state.sockets?.length ? state.sockets : [null],
  })
  const type = base?.type ?? ''
  const defaultBone: CraftBone = ['Ring', 'Amulet', 'Belt'].includes(type)
    ? 'preserved_collarbone'
    : ['Helmet', 'Gloves', 'Boots', 'Body Armour', 'Focus', 'Shield', 'Buckler'].includes(type)
      ? 'preserved_rib'
      : 'preserved_jawbone'
  return (
    <>
      <label>
        动作
        <select
          aria-label={`规则 ${number} 动作`}
          value={action.kind === 'currency' ? action.currency : action.kind}
          onChange={(event) => {
            const value = event.target.value
            setDeclarationDraft(null)
            if (value === 'perfect-flux') {
              if (inspectedPerfect.ok && inspectedPerfect.value.previousMaxLevel !== null) {
                onChange({
                  kind: 'perfect-flux',
                  previousMaxLevel: inspectedPerfect.value.previousMaxLevel,
                })
              } else {
                setDeclarationDraft({ context: declarationContext, value: '' })
              }
              return
            }
            if (
              value === 'runeforge' ||
              value === 'jump' ||
              value === 'stop' ||
              value === 'fracture' ||
              value === 'reveal' ||
              value === 'artificer' ||
              value === 'extraction' ||
              value === 'vaal' ||
              value === 'architect'
            )
              onChange({ kind: value })
            else if (value === 'socket') {
              const first = augments[0]
              if (first)
                onChange({ kind: 'socket', augmentId: first.id, socketIndex: 'first-empty' })
            } else if (value === 'desecrate') onChange({ kind: 'desecrate', boneId: defaultBone })
            else if (value === 'essence') {
              const first = essences[0]
              if (first) onChange({ kind: 'essence', essenceId: first.id })
            } else if (value === 'flux') onChange({ kind: 'flux', fluxId: FLUXES[0].id })
            else if (value === 'alloy') {
              const first = alloys[0]
              if (first) onChange({ kind: 'alloy', alloyId: first.id })
            } else if (value === 'liquid-emotion') {
              const first = emotions[0]
              if (first) onChange({ kind: 'liquid-emotion', emotionId: first.id })
            } else onChange({ kind: 'currency', currency: value as CraftCurrency })
          }}
        >
          <option value="stop">停止</option>
          <option value="jump" disabled={!allowJump}>
            仅判断并跳转
          </option>
          {(Object.keys(CRAFT_CURRENCY_LABELS) as CraftCurrency[]).map((id) => (
            <option key={id} value={id}>
              {CRAFT_CURRENCY_LABELS[id]}
            </option>
          ))}
          <option value="essence" disabled={!essences.length}>
            精华制作
          </option>
          <option value="alloy" disabled={!alloys.length}>
            合金制作
          </option>
          <option value="flux" disabled={fluxCatalogSignature(catalog) === null}>
            溶剂转换
          </option>
          <option value="runeforge" disabled={runeforgingCatalogSignature(catalog) === null}>
            防具锻造
          </option>
          <option value="perfect-flux">完美溶剂：装备技能升至 20</option>
          <option value="vaal">瓦尔石：选择本次腐化结果</option>
          <option value="architect">建筑师宝珠：选择二重腐化结果</option>
          <option value="extraction">萃取石：摧毁装备并返还镶嵌物</option>
          <option value="desecrate">骨骼施加</option>
          <option value="liquid-emotion" disabled={!emotions.length || type !== 'Jewel'}>
            液态情感制作
          </option>
          <option value="reveal">继续亵渎揭示</option>
          <option value="fracture">破裂制作</option>
          <option value="artificer">巧匠石打孔</option>
          <option value="socket" disabled={!augments.length}>
            符文镶嵌
          </option>
        </select>
      </label>
      {runeforge ? (
        <p>
          {runeforge.ok
            ? `${local(runeforge.value.fromBase.name)} → ${local(runeforge.value.toBase.name)}；Verisium × ${runeforge.value.recipe.verisium}`
            : runeforge.error}
        </p>
      ) : null}
      {action.kind === 'perfect-flux' || declaration ? (
        <label>
          操作前装备技能最高等级
          <input
            aria-label={`规则 ${number} 操作前装备技能最高等级`}
            type="number"
            min={inspectedPerfect.ok ? inspectedPerfect.value.minimumPreviousMaxLevel : 1}
            max={19}
            step={1}
            readOnly={inspectedPerfect.ok && inspectedPerfect.value.previousMaxLevel !== null}
            value={
              declaration?.value ?? (action.kind === 'perfect-flux' ? action.previousMaxLevel : '')
            }
            onChange={(event) => {
              const value = event.target.value
              const checked =
                value === '' ? null : preparePerfectFluxCraft(catalog, state, Number(value))
              if (checked?.ok) {
                setDeclarationDraft(null)
                onChange({ kind: 'perfect-flux', previousMaxLevel: checked.value.previousMaxLevel })
              } else setDeclarationDraft({ context: declarationContext, value })
            }}
          />
          {declaration ? (
            <span>声明有效最高等级后才设置完美溶剂动作；现有规则尚未更改。</span>
          ) : (
            <span>装备技能最高等级声明；角色当前使用等级未计算。</span>
          )}
        </label>
      ) : null}
      {action.kind === 'socket' ? (
        <>
          <label>
            符文
            <select
              aria-label={`规则 ${number} 符文`}
              value={action.augmentId}
              onChange={(event) => onChange({ ...action, augmentId: event.target.value })}
            >
              {!augments.some((entry) => entry.id === action.augmentId) ? (
                <option value={action.augmentId}>
                  {local(
                    catalog.augments?.find((entry) => entry.id === action.augmentId)?.name ??
                      action.augmentId,
                  )}
                  （当前不可用）
                </option>
              ) : null}
              {augments.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {local(entry.name)}
                </option>
              ))}
            </select>
          </label>
          <label>
            镶嵌孔位
            <select
              aria-label={`规则 ${number} 镶嵌孔位`}
              value={action.socketIndex}
              onChange={(event) =>
                onChange({
                  ...action,
                  socketIndex:
                    event.target.value === 'first-empty'
                      ? 'first-empty'
                      : Number(event.target.value),
                })
              }
            >
              <option value="first-empty">第一空孔（不覆盖）</option>
              {[0, 1, 2].map((index) => (
                <option key={index} value={index}>
                  孔位 {index + 1}（可覆盖）
                </option>
              ))}
            </select>
          </label>
          <p>指定孔位会覆盖旧符文且不返还；第一空孔只填已确认的空孔。请设置停止条件或步骤上限。</p>
        </>
      ) : null}
      {action.kind === 'currency' ? (
        <label>
          搭配预兆
          <select
            aria-label={`规则 ${number} 预兆`}
            value={action.omen ?? ''}
            onChange={(event) =>
              onChange({
                kind: 'currency',
                currency: action.currency,
                ...(event.target.value ? { omen: event.target.value as CraftOmen } : {}),
              })
            }
          >
            <option value="">不使用预兆</option>
            {(Object.keys(CRAFT_OMEN_RULES) as CraftOmen[])
              .filter((id) => craftOmenError(id, action.currency) === null)
              .map((id) => (
                <option key={id} value={id}>
                  {omenLabel(id)}
                </option>
              ))}
          </select>
        </label>
      ) : null}
      {action.kind === 'flux' ? (
        <label>
          溶剂
          <select
            aria-label={`规则 ${number} 溶剂`}
            value={action.fluxId}
            onChange={(event) => onChange({ kind: 'flux', fluxId: event.target.value })}
          >
            {!FLUXES.some((flux) => flux.id === action.fluxId) ? (
              <option value={action.fluxId} disabled>
                {action.fluxId}（当前不支持）
              </option>
            ) : null}
            {FLUXES.map((flux) => (
              <option key={flux.id} value={flux.id}>
                {local(flux.name)}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {action.kind === 'alloy' ? (
        <label>
          合金
          <select
            aria-label={`规则 ${number} 合金`}
            value={action.alloyId}
            onChange={(event) => onChange({ kind: 'alloy', alloyId: event.target.value })}
          >
            {!alloys.some((entry) => entry.id === action.alloyId) ? (
              <option value={action.alloyId} disabled>
                {action.alloyId}（当前基底映射不可用）
              </option>
            ) : null}
            {alloys.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {local(entry.name)}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {action.kind === 'liquid-emotion' ? (
        <label>
          液态情感
          <select
            aria-label={`规则 ${number} 液态情感`}
            value={action.emotionId}
            onChange={(event) =>
              onChange({ kind: 'liquid-emotion', emotionId: event.target.value })
            }
          >
            {!emotions.some((emotion) => emotion.id === action.emotionId) ? (
              <option value={action.emotionId} disabled>
                {local(
                  catalog.liquidEmotions?.find((emotion) => emotion.id === action.emotionId)
                    ?.name ?? action.emotionId,
                )}
                （当前基底映射不可用）
              </option>
            ) : null}
            {emotions.map((emotion) => (
              <option key={emotion.id} value={emotion.id}>
                {local(emotion.name)}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {action.kind === 'essence' ? (
        <>
          <label>
            精华
            <select
              aria-label={`规则 ${number} 精华`}
              value={action.essenceId}
              onChange={(event) => onChange({ kind: 'essence', essenceId: event.target.value })}
            >
              {essences.map((e) => (
                <option key={e.id} value={e.id}>
                  {local(e.name)}
                </option>
              ))}
            </select>
          </label>
          <label>
            精华预兆
            <select
              aria-label={`规则 ${number} 精华预兆`}
              value={action.omen ?? ''}
              onChange={(event) =>
                onChange({
                  kind: 'essence',
                  essenceId: action.essenceId,
                  ...(event.target.value ? { omen: event.target.value as EssenceOmen } : {}),
                })
              }
            >
              <option value="">不使用精华预兆</option>
              {essenceCraftMode(action.essenceId) === 'replace'
                ? Object.entries(ESSENCE_OMEN_RULES).map(([id, rule]) => (
                    <option key={id} value={id}>
                      {local(rule.name)}
                    </option>
                  ))
                : null}
            </select>
          </label>
        </>
      ) : null}
      {action.kind === 'desecrate' ? (
        <>
          <label>
            骨骼
            <select
              aria-label={`规则 ${number} 骨骼`}
              value={action.boneId}
              onChange={(event) =>
                onChange({ kind: 'desecrate', boneId: event.target.value as CraftBone })
              }
            >
              {Object.entries(BONE_RULES).map(([id, rule]) => (
                <option key={id} value={id}>
                  {local(rule.name)}
                </option>
              ))}
            </select>
          </label>
          <label>
            方向预兆
            <select
              aria-label={`规则 ${number} 骨骼方向预兆`}
              value={action.directionOmen ?? ''}
              onChange={(event) =>
                onChange({
                  kind: 'desecrate',
                  boneId: action.boneId,
                  ...(action.lichOmen ? { lichOmen: action.lichOmen } : {}),
                  ...(event.target.value
                    ? { directionOmen: event.target.value as BoneDirectionOmen }
                    : {}),
                })
              }
            >
              <option value="">不使用方向预兆</option>
              {Object.entries(BONE_DIRECTION_OMEN_RULES).map(([id, rule]) => (
                <option key={id} value={id}>
                  {local(rule.name)}
                </option>
              ))}
            </select>
          </label>
          <label>
            巫妖预兆
            <select
              aria-label={`规则 ${number} 骨骼巫妖预兆`}
              value={action.lichOmen ?? ''}
              onChange={(event) =>
                onChange({
                  kind: 'desecrate',
                  boneId: action.boneId,
                  ...(action.directionOmen ? { directionOmen: action.directionOmen } : {}),
                  ...(event.target.value ? { lichOmen: event.target.value as BoneLichOmen } : {}),
                })
              }
            >
              <option value="">不使用巫妖预兆</option>
              {!action.boneId.endsWith('_rib')
                ? Object.entries(BONE_LICH_OMEN_RULES).map(([id, rule]) => (
                    <option key={id} value={id}>
                      {local(rule.name)}
                    </option>
                  ))
                : null}
            </select>
          </label>
        </>
      ) : null}
    </>
  )
}
