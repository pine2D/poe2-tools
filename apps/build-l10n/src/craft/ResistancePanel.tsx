import {
  type CraftCatalog,
  type CraftState,
  estimateResistances,
  RESISTANCE_LABELS,
  type ResistanceProperty,
} from '@poe2-tools/item-core'

export function ResistancePanel({
  catalog,
  current,
  before,
  after,
  preview,
}: {
  catalog: CraftCatalog
  current: CraftState
  before?: CraftState
  after?: CraftState
  preview: boolean
}) {
  const result = estimateResistances(catalog, current)
  const previous = before ? estimateResistances(catalog, before) : undefined
  const next = after ? estimateResistances(catalog, after) : undefined
  return (
    <section className="defence-panel" aria-label="装备抗性合计">
      <h3>装备抗性合计</h3>
      <p className="rehearsal-scope-note">
        统计本件固有属性、词缀与当前符文提供的无条件抗性，计入已核对的催化品质。元素合计为火、冰、雷之和，全元素抗性计入三项。不包含角色其他来源、抗性上限、穿透、友军或条件效果。
      </p>
      <div className="defence-values">
        {(Object.keys(RESISTANCE_LABELS) as ResistanceProperty[]).map((property) => {
          const entry = result[property]
          const old = previous?.[property]
          const future = next?.[property]
          return (
            <article key={property}>
              <h4>{RESISTANCE_LABELS[property]}</h4>
              <strong className="defence-value">{entry.ok ? `${entry.value}%` : '未知'}</strong>
              {!entry.ok ? <p>{entry.error}</p> : null}
              {old && future ? (
                <p>
                  {preview ? '应用后预计' : '本步变化'}：{old.ok ? `${old.value}%` : '未知'} →{' '}
                  {future.ok ? `${future.value}%` : '未知'}
                </p>
              ) : null}
            </article>
          )
        })}
      </div>
    </section>
  )
}
