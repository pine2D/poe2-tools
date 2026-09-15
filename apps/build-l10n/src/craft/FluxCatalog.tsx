import {
  type CatalogBase,
  type CatalogMod,
  type CraftCatalog,
  inspectFluxes,
} from '@poe2-tools/item-core'
import { useMemo, useState } from 'react'
import { useFluxCatalog } from './useFluxCatalog'
import './essence-catalog.css'

interface Props {
  catalog: CraftCatalog
  base: CatalogBase
  locale?: 'zh-CN' | 'zh-TW'
  translateLine?: ((line: string) => string | null) | undefined
  fetchImpl?: typeof fetch
}

const ELEMENTS = { fire: '火焰', cold: '冰霜', lightning: '闪电', chaos: '混沌' }

function FluxAttribute({
  title,
  mod,
  lines,
}: {
  title: string
  mod: CatalogMod | null
  lines: { english: string; translated: string | null | undefined }[]
}) {
  return (
    <div>
      <p>
        <strong>{title}</strong>
      </p>
      {mod ? (
        <>
          <p>
            {mod.kind === 'prefix' ? '前缀' : '后缀'} · <span>词缀等级 {mod.level}</span>
          </p>
          {lines.map(({ english, translated }, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: 快照属性行允许重复且顺序固定。
            <div className="essence-catalog-line" key={index}>
              {translated ? <span>{translated}</span> : null}
              <code>{english}</code>
            </div>
          ))}
        </>
      ) : (
        <p className="essence-catalog-unresolved">
          {title === '转换前' ? '原属性缺失' : '目标属性缺失'}
        </p>
      )}
    </div>
  )
}

/** 转换关系仅供查表，不将解析或普通生成资格当作制作许可。 */
export function FluxCatalog({
  catalog,
  base,
  locale = 'zh-CN',
  translateLine,
  fetchImpl = fetch,
}: Props) {
  const [requested, setRequested] = useState(false)
  const [query, setQuery] = useState('')
  const current = useFluxCatalog(catalog, fetchImpl, requested)
  const entries = useMemo(
    () =>
      current.table
        ? inspectFluxes(current.table, catalog, base).map((entry) => ({
            ...entry,
            localizedName: catalog.localizedNames?.[locale]?.[entry.flux.name],
            fromLines:
              entry.fromMod?.lines.map((english) => ({
                english,
                translated: translateLine?.(english),
              })) ?? [],
            toLines:
              entry.toMod?.lines.map((english) => ({
                english,
                translated: translateLine?.(english),
              })) ?? [],
          }))
        : [],
    [current.table, catalog, base, locale, translateLine],
  )
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const matches = entries.filter(({ flux, localizedName, fromLines, toLines }) => {
    const haystack = [
      flux.name,
      localizedName,
      ...[...fromLines, ...toLines].flatMap(({ english, translated }) => [english, translated]),
    ]
      .join(' ')
      .toLowerCase()
    return words.every((word) => haystack.includes(word))
  })
  return (
    <details
      className="essence-catalog"
      onToggle={(event) => {
        if (event.currentTarget.open) setRequested(true)
      }}
    >
      <summary>溶剂与抗性转换</summary>
      <section aria-label="溶剂抗性转换目录">
        <p className="essence-catalog-notice">当前仅支持转换关系查询，尚未接入制作演练。</p>
        <p>查看当前装备类别的抗性转换关系。已解析表示找到了对应属性，实际制作条件仍需核实。</p>
        {current.loading ? <p role="status">正在加载溶剂目录…</p> : null}
        {current.error ? (
          <>
            <p role="status">{current.error}</p>
            <button type="button" onClick={current.retry}>
              重试溶剂目录
            </button>
          </>
        ) : null}
        {current.table ? (
          <>
            <label>
              搜索溶剂与转换属性
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="中英文材料名或抗性属性"
              />
            </label>
            <p className="essence-catalog-count" role="status">
              匹配 {matches.length} / {entries.length} 条关系
            </p>
            {!entries.length ? (
              <p>此装备类别暂无溶剂转换关系。</p>
            ) : !matches.length ? (
              <p>没有匹配的溶剂或转换属性。</p>
            ) : null}
            <div className="essence-catalog-list">
              {matches.map(
                ({
                  rowId,
                  flux,
                  localizedName,
                  fromElement,
                  fromMod,
                  toMod,
                  fromLines,
                  toLines,
                  reason,
                }) => (
                  <article key={`${rowId}:${flux.id}:${fromElement}`}>
                    <header>
                      {localizedName ? <strong>{localizedName}</strong> : null}
                      <span>{flux.name}</span>
                    </header>
                    <p>
                      <strong>
                        {ELEMENTS[fromElement]} → {ELEMENTS[flux.target]}
                      </strong>
                    </p>
                    {fromMod && toMod ? (
                      <p>已解析</p>
                    ) : (
                      <p className="essence-catalog-unresolved">属性缺失</p>
                    )}
                    <FluxAttribute title="转换前" mod={fromMod} lines={fromLines} />
                    <FluxAttribute title="转换后" mod={toMod} lines={toLines} />
                    {reason ? <p className="essence-catalog-unresolved">{reason}</p> : null}
                  </article>
                ),
              )}
            </div>
            <p className="essence-catalog-count">
              对应关系人工核对于 {current.table._meta.reviewedAt}；属性数值来自固定快照。
            </p>
          </>
        ) : null}
      </section>
    </details>
  )
}
