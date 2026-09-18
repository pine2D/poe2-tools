import {
  CRAFT_PRICE_UNITS,
  type CraftCatalog,
  type CraftMaterial,
  type CraftMaterialCost,
  type CraftPricing,
  type CraftResult,
  craftMaterials,
  parseCraftPricing,
  quoteCraftCosts,
} from '@poe2-tools/item-core'
import { useEffect, useRef, useState } from 'react'
import './pricing.css'
import { craftMaterialLabels } from './craftMaterialLabels'

const amount = (value: number) => value.toLocaleString('zh-CN', { maximumFractionDigits: 6 })
export function CraftCostSummary({
  costs,
  pricing,
  title,
  includeBase = false,
  materialLabel,
}: {
  costs: CraftResult<CraftMaterialCost[]>
  pricing: CraftPricing | undefined
  title: string
  includeBase?: boolean
  materialLabel: (material: CraftMaterial) => string
}) {
  if (!pricing) return null
  if (!costs.ok)
    return (
      <p role="alert">
        {title}：{costs.error}
      </p>
    )
  const quote = quoteCraftCosts(costs.value, pricing, includeBase)
  if (!quote.ok)
    return (
      <p role="alert">
        {title}：{quote.error}
      </p>
    )
  const q = quote.value,
    unit = CRAFT_PRICE_UNITS[pricing.unit]
  const names = new Map(costs.value.map((m) => [m.id, materialLabel(m)]))
  return (
    <section className="craft-cost-quote" aria-label={title}>
      <p>
        <strong>
          {title}：{q.total === null ? '待补报价' : `${amount(q.total)} ${unit}`}
        </strong>
      </p>
      {q.total === null ? (
        <p>
          已知小计：{amount(q.knownSubtotal)} {unit}；缺少
          {[
            ...(q.missingBase ? ['起点成本'] : []),
            ...q.missing.map((id) => names.get(id) ?? id),
          ].join('、')}
          的报价。
        </p>
      ) : null}
      <p>按已应用的自填单价估算；不代表市场成交价或重复制作的期望成本。</p>
    </section>
  )
}

export function CraftPricingPanel({
  requestedMaterialIds,
  catalog,
  pricing,
  costs,
  materialIds,
  onChange,
  translations,
}: {
  requestedMaterialIds?: string[]
  catalog: CraftCatalog
  pricing: CraftPricing | undefined
  costs: CraftResult<CraftMaterialCost[]>
  materialIds: string[]
  onChange: (value: CraftPricing | undefined) => void
  translations: Record<string, string>
}) {
  const materialLabel = craftMaterialLabels(catalog, translations)
  const editor = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    if (!requestedMaterialIds?.length || !editor.current) return
    editor.current.open = true
    const inputs = [...editor.current.querySelectorAll<HTMLInputElement>('input[data-material-id]')]
    const requested = inputs.filter((input) =>
      requestedMaterialIds.includes(input.dataset.materialId ?? ''),
    )
    const input = requested.find((input) => input.value.trim() === '') ?? requested[0]
    input?.focus()
    input?.scrollIntoView?.({ block: 'center', behavior: 'auto' })
  }, [requestedMaterialIds])
  return (
    <section className="craft-pricing" aria-label="制作报价">
      <h3>制作报价</h3>
      <CraftCostSummary
        costs={costs}
        pricing={pricing}
        title="当前总成本"
        includeBase
        materialLabel={materialLabel}
      />
      <details ref={editor}>
        <summary>{pricing ? '编辑材料单价与起点成本' : '填写材料单价与起点成本'}</summary>
        <PricingForm
          key={JSON.stringify(pricing)}
          catalog={catalog}
          pricing={pricing}
          materialIds={[...new Set([...materialIds, ...(requestedMaterialIds ?? [])])]}
          onChange={onChange}
          materialLabel={materialLabel}
        />
      </details>
    </section>
  )
}
function PricingForm({
  catalog,
  pricing,
  materialIds,
  onChange,
  materialLabel,
}: {
  catalog: CraftCatalog
  pricing: CraftPricing | undefined
  materialIds: string[]
  onChange: (value: CraftPricing | undefined) => void
  materialLabel: (material: CraftMaterial) => string
}) {
  const [unit, setUnit] = useState<CraftPricing['unit']>(pricing?.unit ?? 'divine')
  const [baseCost, setBaseCost] = useState(
    pricing?.baseCost === undefined ? '' : String(pricing.baseCost),
  )
  const [fields, setFields] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(pricing?.prices ?? {}).map(([id, n]) => [id, String(n)])),
  )
  const [added, setAdded] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [message, setMessage] = useState('')
  const materials = craftMaterials(catalog),
    byId = new Map(materials.map((m) => [m.id, m]))
  const ids = [...new Set([...materialIds, ...Object.keys(fields), ...added])]
  const candidates = query.trim()
    ? materials
        .filter((m) =>
          `${m.name} ${materialLabel(m)}`.toLowerCase().includes(query.trim().toLowerCase()),
        )
        .slice(0, 30)
    : []
  const parseAmount = (raw: string) =>
    /^(?:\d+(?:\.\d{0,6})?|\.\d{1,6})$/.test(raw.trim()) ? Number(raw) : Number.NaN
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        const prices = Object.fromEntries(
          Object.entries(fields)
            .filter(([, v]) => v.trim() !== '')
            .map(([id, v]) => [id, parseAmount(v)]),
        )
        const result = parseCraftPricing(
          { unit, prices, ...(baseCost.trim() !== '' ? { baseCost: parseAmount(baseCost) } : {}) },
          catalog,
        )
        if (!result.ok) {
          setMessage(result.error)
          return
        }
        onChange(result.value)
      }}
    >
      <p>
        所有金额使用同一计价单位。留空表示未知，填 0
        表示零成本；填写后点“应用报价”。报价随演练项目保存，未应用的编辑不会保存。
      </p>
      <label>
        计价单位
        <select
          aria-label="计价单位"
          value={unit}
          onChange={(e) => {
            setUnit(e.target.value as CraftPricing['unit'])
            setFields({})
            setBaseCost('')
            setMessage('单位已切换，请重新填写报价；不会自动换算。')
          }}
        >
          {Object.entries(CRAFT_PRICE_UNITS).map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <label>
        起点成本
        <input
          aria-label="起点成本"
          inputMode="decimal"
          value={baseCost}
          onChange={(e) => setBaseCost(e.target.value)}
          placeholder="未知"
        />
      </label>
      <label>
        搜索报价材料
        <input
          aria-label="搜索报价材料"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="中文或英文名称"
        />
      </label>
      {candidates.length ? (
        <div className="craft-price-candidates">
          {candidates.map((m) => (
            <button
              key={m.id}
              type="button"
              disabled={ids.includes(m.id)}
              onClick={() => {
                setAdded([...added, m.id])
                setQuery('')
              }}
            >
              添加报价 {materialLabel(m)}
            </button>
          ))}
        </div>
      ) : null}
      <div className="craft-price-rows">
        {ids.map((id) => {
          const m = byId.get(id)
          if (!m) return null
          return (
            <label key={id}>
              {materialLabel(m)}
              <input
                aria-label={`${materialLabel(m)}单价`}
                data-material-id={id}
                inputMode="decimal"
                value={fields[id] ?? ''}
                placeholder="未知"
                onChange={(e) => setFields({ ...fields, [id]: e.target.value })}
              />
            </label>
          )
        })}
      </div>
      {message ? <p role="alert">{message}</p> : null}
      <button type="submit">应用报价</button>
      {pricing ? (
        <button type="button" onClick={() => onChange(undefined)}>
          清除本项目报价
        </button>
      ) : null}
    </form>
  )
}
