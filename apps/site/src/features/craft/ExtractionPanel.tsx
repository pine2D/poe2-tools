import {
  type CraftCatalog,
  type CraftState,
  type ExtractionCraftOperation,
  type ExtractionReturn,
  prepareExtractionCraft,
} from '@poe2-tools/item-core'
import type { Ref } from 'react'

/** 仅显示从已核对前态派生的物品数量，不将返还估算为收入。 */
export function ExtractionReturns({
  returns,
  catalog,
  translations,
}: {
  returns: ExtractionReturn[]
  catalog: CraftCatalog
  translations: Record<string, string>
}) {
  const local = (name: string) =>
    translations[name] ?? catalog.localizedNames?.['zh-CN']?.[name] ?? name
  return (
    <section aria-label="萃取返还清单">
      <h4>返还镶嵌物</h4>
      <ul>
        {returns.map((entry) => (
          <li key={entry.augmentId}>
            <strong>
              {local(entry.name)} × {entry.count}
            </strong>
            <span> · 孔位 {entry.socketIndices.map((index) => index + 1).join('、')}</span>
          </li>
        ))}
      </ul>
      <p>返还物不折算为售价，也不抵扣制作支出。</p>
    </section>
  )
}

interface Props {
  catalog: CraftCatalog
  state: CraftState
  translations: Record<string, string>
  disabled: boolean
  entryRef?: Ref<HTMLElement>
  configuration?: ExtractionCraftOperation
  onPreview: (operation: ExtractionCraftOperation) => void
}

export function ExtractionPanel({
  catalog,
  state,
  translations,
  disabled,
  entryRef,
  configuration,
  onPreview,
}: Props) {
  const prepared = prepareExtractionCraft(catalog, state)
  return (
    <details
      data-craft-tool="extraction"
      className="essence-catalog essence-craft"
      open={configuration ? true : undefined}
    >
      <summary ref={entryRef}>萃取石制作</summary>
      <p>消耗 1 颗萃取石，摧毁装备并返还已核对的非绑定镶嵌物；可用于腐化装备。</p>
      <p>只支持已完整核对的孔位和镶嵌物。未知孔位、全空孔及当前不支持的绑定镶嵌物不能萃取。</p>
      {prepared.ok ? (
        <ExtractionReturns
          returns={prepared.value.returns}
          catalog={catalog}
          translations={translations}
        />
      ) : (
        <p role="status">{prepared.error}</p>
      )}
      <button
        type="button"
        disabled={disabled || !prepared.ok}
        onClick={() => {
          if (!disabled && prepared.ok) onPreview({ kind: 'extraction' })
        }}
      >
        预览萃取石结果
      </button>
    </details>
  )
}
