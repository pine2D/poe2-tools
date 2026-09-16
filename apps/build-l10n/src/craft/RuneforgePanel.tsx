import {
  type CraftCatalog,
  type CraftState,
  prepareRuneforgeCraft,
  type RuneforgeCraftOperation,
} from '@poe2-tools/item-core'
import type { Ref } from 'react'

export function RuneforgePanel({
  catalog,
  state,
  translations,
  disabled,
  onPreview,
  entryRef,
}: {
  catalog: CraftCatalog
  state: CraftState
  translations: Record<string, string>
  disabled: boolean
  onPreview: (operation: RuneforgeCraftOperation) => void
  entryRef?: Ref<HTMLElement>
}) {
  const prepared = prepareRuneforgeCraft(catalog, state)
  const local = (name: string) =>
    translations[name] ?? catalog.localizedNames?.['zh-CN']?.[name] ?? name
  return (
    <details className="essence-catalog essence-craft">
      <summary ref={entryRef}>防具锻造</summary>
      {prepared.ok ? (
        <>
          <p>
            {local(prepared.value.fromBase.name)} → {local(prepared.value.toBase.name)}
          </p>
          <p>应用后消耗 Verisium × {prepared.value.recipe.verisium}；预览、取消不消耗材料。</p>
          <p>保留词缀、品质与孔位。品质或孔位未知时仍保持未知，不按零估算。</p>
        </>
      ) : (
        <p>{prepared.error}</p>
      )}
      <button
        type="button"
        disabled={disabled || !prepared.ok}
        onClick={() => {
          if (prepared.ok)
            onPreview({
              kind: 'runeforge',
              fromBaseId: prepared.value.fromBase.id,
              toBaseId: prepared.value.toBase.id,
            })
        }}
      >
        预览锻造结果
      </button>
    </details>
  )
}
