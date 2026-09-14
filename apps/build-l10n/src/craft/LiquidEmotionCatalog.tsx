import { type CatalogBase, type CraftCatalog, inspectLiquidEmotions } from '@poe2-tools/item-core'
import { useMemo, useState } from 'react'
import { matchesLiquidEmotion } from './liquidEmotionSearch'
import './essence-catalog.css'

interface Props {
  catalog: CraftCatalog
  base: CatalogBase
  locale?: 'zh-CN' | 'zh-TW'
  translateLine?: ((line: string) => string | null) | undefined
}

/** 基底资料查询不依赖当前稀有度；实际使用仍交给制作操作预检。 */
export function LiquidEmotionCatalog({ catalog, base, locale = 'zh-CN', translateLine }: Props) {
  const [query, setQuery] = useState('')
  const entries = useMemo(() => inspectLiquidEmotions(catalog, base), [catalog, base])
  const localize = (name: string) => catalog.localizedNames?.[locale]?.[name] ?? name
  const matches = entries.filter((entry) =>
    matchesLiquidEmotion(entry, query, localize, translateLine),
  )
  return (
    <details className="essence-catalog">
      <summary>液态情感与保证属性</summary>
      <section aria-label="液态保证属性目录">
        <p>
          先查看材料对应的完整保证属性，再从制作起点进入演练。液态结果带有工艺身份，与普通随机词缀池分开；实际使用还需核对稀有度、已有工艺与可移除词缀。
        </p>
        <label>
          搜索液态材料与保证属性
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
        {!entries.length ? <p>当前目录暂无液态情感数据。</p> : null}
        {entries.length > 0 && !matches.length ? <p>没有匹配的液态材料或保证属性。</p> : null}
        <div className="essence-catalog-list">
          {matches.map(({ emotion, outcomes, reason }) => (
            <article key={emotion.id}>
              <header>
                {localize(emotion.name) !== emotion.name ? (
                  <strong>{localize(emotion.name)}</strong>
                ) : null}
                <span>{emotion.name}</span>
              </header>
              {outcomes.length > 1 ? <p>以下是两种可能结果；选择方向仅用于指定结果演练。</p> : null}
              {outcomes.map((mod) => (
                <section key={mod.id} aria-label={`保证属性 ${mod.id}`}>
                  <p>
                    {mod.kind === 'prefix' ? '前缀' : '后缀'} · <span>工艺属性</span> · 冲突组{' '}
                    {mod.group}
                  </p>
                  {mod.lines.map((line, index) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: 同组来源可能有重复行，顺序固定。
                    <div className="essence-catalog-line" key={index}>
                      {translateLine?.(line) ? <span>{translateLine(line)}</span> : null}
                      <code>{line}</code>
                    </div>
                  ))}
                  {mod.tags.length ? <p>标签：{mod.tags.join('、')}</p> : null}
                  <code className="essence-catalog-id">{mod.id}</code>
                </section>
              ))}
              {reason ? <p className="essence-catalog-unresolved">{reason}</p> : null}
              <code className="essence-catalog-id">{emotion.id}</code>
            </article>
          ))}
        </div>
      </section>
    </details>
  )
}
