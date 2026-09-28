import { type CatalogBase, type CraftCatalog, inspectAlloys } from '@poe2-tools/item-core'
import { useMemo, useState } from 'react'
import { type AlloyCatalogResource, useAlloyCatalog } from './useAlloyCatalog'
import './essence-catalog.css'

interface Props {
  catalog: CraftCatalog
  base: CatalogBase
  locale?: 'zh-CN' | 'zh-TW'
  translateLine?: ((line: string) => string | null) | undefined
  fetchImpl?: typeof fetch
  resource?: AlloyCatalogResource
}

/** 可选 gray 表按需加载；同一解析结果用于查询与合金制作，失败不阻断主目录。 */
export function AlloyCatalog({
  catalog,
  base,
  locale = 'zh-CN',
  translateLine,
  fetchImpl = fetch,
  resource,
}: Props) {
  const [requested, setRequested] = useState(false)
  const [query, setQuery] = useState('')
  const ownResource = useAlloyCatalog(catalog, fetchImpl, !resource && requested)
  const current = resource ?? ownResource
  const entries = useMemo(
    () =>
      current?.table
        ? inspectAlloys(current.table, catalog, base).map((entry) => ({
            ...entry,
            localizedName: catalog.localizedNames?.[locale]?.[entry.alloy.name],
            lines:
              entry.mod?.lines.map((line) => ({
                english: line,
                translated: translateLine?.(line),
              })) ?? [],
          }))
        : [],
    [current, catalog, base, locale, translateLine],
  )
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const matches = entries.filter(({ alloy, localizedName, mod, lines }) => {
    const haystack = [
      alloy.id,
      alloy.name,
      localizedName,
      mod?.id,
      mod?.group,
      ...(mod?.tags ?? []),
      ...lines.flatMap(({ english, translated }) => [english, translated]),
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
      <summary>合金与保证属性</summary>
      <section aria-label="合金保证属性目录">
        <p>查看当前基底适用的合金与保证属性。下方合金制作可选择移除结果和数值，再预览应用。</p>
        {current.loading ? <p role="status">正在加载合金目录…</p> : null}
        {current?.error ? (
          <>
            <p role="status">{current.error}</p>
            <button type="button" onClick={current.retry}>
              重试合金目录
            </button>
          </>
        ) : null}
        {current?.table ? (
          <>
            <label>
              搜索合金与保证属性
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="中英文材料、属性、标签或 modId"
              />
            </label>
            <p className="essence-catalog-count" role="status">
              匹配 {matches.length} / {entries.length} 种材料
            </p>
            {!entries.length ? (
              <p>此装备类别暂无合金映射。</p>
            ) : !matches.length ? (
              <p>没有匹配的合金或保证属性。</p>
            ) : null}
            <div className="essence-catalog-list">
              {matches.map(({ alloy, localizedName, mod, reason, lines }) => (
                <article key={alloy.id}>
                  <header>
                    {localizedName ? <strong>{localizedName}</strong> : null}
                    <span>{alloy.name}</span>
                  </header>
                  {mod ? (
                    <>
                      <p>
                        {mod.kind === 'prefix' ? '前缀' : '后缀'} · 工艺属性 · 冲突组 {mod.group}
                      </p>
                      {lines.map(({ english, translated }, index) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: 属性行来自固定快照，允许重复且顺序固定。
                        <div className="essence-catalog-line" key={index}>
                          {translated ? <span>{translated}</span> : null}
                          <code>{english}</code>
                        </div>
                      ))}
                      {mod.tags.length ? <p>标签：{mod.tags.join('、')}</p> : null}
                      <code className="essence-catalog-id">{mod.id}</code>
                    </>
                  ) : null}
                  {reason ? <p className="essence-catalog-unresolved">{reason}</p> : null}
                </article>
              ))}
            </div>
            <p className="essence-catalog-count">
              对应关系人工核对于 {current.table._meta.reviewedAt}；属性数值来自固定 PoB2
              快照。制作条件与游戏交互仍需单独核实。
            </p>
          </>
        ) : null}
      </section>
    </details>
  )
}
