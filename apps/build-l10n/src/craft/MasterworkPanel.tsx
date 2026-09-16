import {
  type CraftCatalog,
  type CraftState,
  type MasterworkCraftOperation,
  prepareMasterworkCraft,
} from '@poe2-tools/item-core'
import { type Ref, useState } from 'react'
export function MasterworkPanel({
  catalog,
  state,
  translations,
  disabled,
  onPreview,
  configuration,
  entryRef,
}: {
  catalog: CraftCatalog
  state: CraftState
  translations: Record<string, string>
  disabled: boolean
  onPreview: (operation: MasterworkCraftOperation) => void
  configuration?: { socketIndex: number }
  entryRef?: Ref<HTMLElement>
}) {
  const [selected, setSelected] = useState(0)
  const index = configuration?.socketIndex ?? selected
  const prepared = prepareMasterworkCraft(catalog, state, index)
  const local = (name: string) =>
    translations[name] ?? catalog.localizedNames?.['zh-CN']?.[name] ?? name
  return (
    <details className="essence-catalog essence-craft" open={configuration !== undefined}>
      <summary ref={entryRef}>符文升级</summary>
      <p>
        {local('Masterwork Rune')}{' '}
        将已镶嵌的高级符文升级为对应完美档，应用后只计一枚升级材料。当前不支持低档升级、腐化装备及特殊孔位。
      </p>
      <label>
        升级孔位
        <select
          aria-label="符文升级孔位"
          value={index}
          disabled={disabled || configuration !== undefined}
          onChange={(event) => setSelected(Number(event.target.value))}
        >
          {Array.from({ length: state.sockets?.length ?? 0 }, (_, index) => index).map((i) => (
            <option key={i} value={i}>
              孔 {i + 1}
            </option>
          ))}
        </select>
      </label>
      {prepared.ok ? (
        <>
          <p>
            {local(prepared.value.from.name)} → {local(prepared.value.to.name)}
          </p>
          <p>
            {prepared.value.from.lines.join('；')} → {prepared.value.to.lines.join('；')}
          </p>
        </>
      ) : (
        <p>{prepared.error}</p>
      )}
      <button
        type="button"
        disabled={disabled || !prepared.ok}
        onClick={() => {
          if (prepared.ok) onPreview(prepared.value.operation)
        }}
      >
        预览符文升级结果
      </button>
    </details>
  )
}
