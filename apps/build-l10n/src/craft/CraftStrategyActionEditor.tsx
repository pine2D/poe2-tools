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
} from '@poe2-tools/item-core'

export function strategyActionLabel(
  action: CraftStrategyAction,
  catalog: CraftCatalog,
  translations: Record<string, string>,
  omenLabel: (id: CraftOmen) => string,
): string {
  const local = (name: string) =>
    translations[name] ?? catalog.localizedNames?.['zh-CN']?.[name] ?? name
  if (action.kind === 'stop') return '停止'
  if (action.kind === 'reveal') return '继续亵渎揭示'
  if (action.kind === 'fracture') return local('Fracturing Orb')
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
  number: number
  action: CraftStrategyAction
  catalog: CraftCatalog
  state: CraftState
  translations: Record<string, string>
  omenLabel: (id: CraftOmen) => string
  onChange: (action: CraftStrategyAction) => void
}
export function CraftStrategyActionEditor({
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
  const essences = (catalog.essences ?? []).filter((e) => essenceCraftMode(e.id) !== null)
  const type = catalog.bases.find((b) => b.id === state.baseId)?.type ?? ''
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
            if (value === 'stop' || value === 'fracture' || value === 'reveal')
              onChange({ kind: value })
            else if (value === 'desecrate') onChange({ kind: 'desecrate', boneId: defaultBone })
            else if (value === 'essence') {
              const first = essences[0]
              if (first) onChange({ kind: 'essence', essenceId: first.id })
            } else onChange({ kind: 'currency', currency: value as CraftCurrency })
          }}
        >
          <option value="stop">停止</option>
          {(Object.keys(CRAFT_CURRENCY_LABELS) as CraftCurrency[]).map((id) => (
            <option key={id} value={id}>
              {CRAFT_CURRENCY_LABELS[id]}
            </option>
          ))}
          <option value="essence" disabled={!essences.length}>
            精华制作
          </option>
          <option value="desecrate">骨骼施加</option>
          <option value="reveal">继续亵渎揭示</option>
          <option value="fracture">破裂制作</option>
        </select>
      </label>
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
