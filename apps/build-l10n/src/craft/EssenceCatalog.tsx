import { type CatalogBase, type CraftCatalog, inspectEssences } from '@poe2-tools/item-core'
import { useMemo, useState } from 'react'
import { essenceUnavailableMessage } from './essenceUnavailableMessage'
import './essence-catalog.css'

export interface EssenceCatalogProps {
  catalog: CraftCatalog
  base: CatalogBase
  locale?: 'zh-CN' | 'zh-TW'
  translateLine?: ((line: string) => string | null) | undefined
}

export function EssenceCatalog({
  catalog,
  base,
  locale = 'zh-CN',
  translateLine,
}: EssenceCatalogProps) {
  const [query, setQuery] = useState('')
  const entries = useMemo(
    () =>
      inspectEssences(catalog, base).map((inspection) => ({
        ...inspection,
        localizedName: catalog.localizedNames?.[locale]?.[inspection.essence.name],
        lines:
          inspection.mod?.lines.map((line) => ({
            english: line,
            translated: translateLine?.(line),
          })) ?? [],
      })),
    [catalog, base, locale, translateLine],
  )
  const normalizedQuery = query.trim().toLowerCase()
  const matches = entries.filter(({ essence, localizedName, modId, mod, lines }) =>
    [
      essence.name,
      localizedName,
      modId,
      mod?.group,
      ...lines.flatMap(({ english, translated }) => [english, translated]),
    ].some((text) => text?.toLowerCase().includes(normalizedQuery)),
  )

  return (
    <details className="essence-catalog">
      <summary>精华与保证属性</summary>
      <p className="essence-catalog-notice">
        显示该装备类别的来源映射；精华升级与稀有替换已接入，具体可用性以演练区为准。
      </p>
      {!catalog.essences ? (
        <p>当前目录暂无精华数据。</p>
      ) : entries.length === 0 ? (
        <p>此装备类别暂无精华映射。</p>
      ) : (
        <>
          <label>
            搜索精华与保证属性
            <input
              type="search"
              aria-label="搜索精华与保证属性"
              placeholder="中英文材料、属性或 modId"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <p className="essence-catalog-count" role="status">
            匹配 {matches.length} / {entries.length} 项精华结果
          </p>
          {matches.length === 0 ? (
            <p>没有匹配的精华或保证属性。</p>
          ) : (
            <div className="essence-catalog-list">
              {matches.map(({ essence, localizedName, category, modId, mod, lines }) => (
                <article key={`${essence.id}:${modId}`}>
                  <header>
                    {localizedName ? <strong>{localizedName}</strong> : null}
                    <span>{essence.name}</span>
                  </header>
                  <p className="essence-catalog-category">来源类别：{category}</p>
                  {mod ? (
                    <>
                      <p>
                        {mod.kind === 'prefix' ? '前缀' : '后缀'} · 冲突组 {mod.group}
                      </p>
                      {lines.map(({ english, translated }, index) => (
                        // 同一词缀可能包含重复的来源行，行序号仅用于稳定区分。
                        // biome-ignore lint/suspicious/noArrayIndexKey: 来源行顺序固定，不进行重排。
                        <div className="essence-catalog-line" key={index}>
                          {translated ? <span>{translated}</span> : null}
                          <code>{english}</code>
                        </div>
                      ))}
                    </>
                  ) : (
                    <p className="essence-catalog-unresolved">{essenceUnavailableMessage(modId)}</p>
                  )}
                  <code className="essence-catalog-id">{modId}</code>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </details>
  )
}
