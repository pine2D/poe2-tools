import {
  type AlloyCatalog as AlloyTable,
  type CatalogBase,
  type CraftCatalog,
  inspectAlloys,
  parseAlloyCatalog,
} from '@poe2-tools/item-core'
import { useEffect, useMemo, useState } from 'react'
import './essence-catalog.css'

interface Props {
  catalog: CraftCatalog
  base: CatalogBase
  locale?: 'zh-CN' | 'zh-TW'
  translateLine?: ((line: string) => string | null) | undefined
  fetchImpl?: typeof fetch
}

/** 可选 gray 表按需加载；失败隔离在查询面板内，不改变主目录及制作资格。 */
export function AlloyCatalog({
  catalog,
  base,
  locale = 'zh-CN',
  translateLine,
  fetchImpl = fetch,
}: Props) {
  const [requested, setRequested] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [query, setQuery] = useState('')
  const [loaded, setLoaded] = useState<{
    catalog: CraftCatalog
    table?: AlloyTable
    error?: string
  } | null>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt 是显式重试触发器。
  useEffect(() => {
    if (!requested) return
    const controller = new AbortController()
    let active = true
    setLoaded(null)
    void fetchImpl(`${import.meta.env.BASE_URL}craft-data/alloys.json`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.status === 404) {
          if (active)
            setLoaded({ catalog, error: '当前站点未提供合金关系表，可继续使用其他制作功能。' })
          return
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const table = parseAlloyCatalog(await response.json(), catalog)
        if (active) setLoaded({ catalog, table })
      })
      .catch(() => {
        if (active && !controller.signal.aborted)
          setLoaded({
            catalog,
            error: '合金目录加载失败或属性快照不匹配，可重试；其他制作功能不受影响。',
          })
      })
    return () => {
      active = false
      controller.abort()
    }
  }, [attempt, catalog, fetchImpl, requested])
  const current = loaded?.catalog === catalog ? loaded : null
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
        <p>查看当前基底适用的合金与保证属性。合金替换模拟尚未接入，此处查询不会修改装备。</p>
        {requested && !current ? <p role="status">正在加载合金目录…</p> : null}
        {current?.error ? (
          <>
            <p role="status">{current.error}</p>
            <button type="button" onClick={() => setAttempt((value) => value + 1)}>
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
