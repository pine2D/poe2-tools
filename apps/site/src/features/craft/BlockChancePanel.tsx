import { type CraftCatalog, type CraftState, estimateBlockChance } from '@poe2-tools/item-core'

/** 本件格挡独立于防御品质公式，也不代表角色最终格挡率。 */
export function BlockChancePanel({
  catalog,
  current,
  before,
  after,
  preview,
}: {
  catalog: CraftCatalog
  current: CraftState
  before?: CraftState | undefined
  after?: CraftState | undefined
  preview: boolean
}) {
  const base = catalog.bases.find((entry) => entry.id === current.baseId)
  if (base?.type !== 'Shield') return null
  const result = estimateBlockChance(catalog, current)
  const previous = before ? estimateBlockChance(catalog, before) : null
  const next = after ? estimateBlockChance(catalog, after) : null
  return (
    <section className="defence-panel" aria-label="本件格挡率估算">
      <h3>本件格挡率估算</h3>
      <p className="rehearsal-scope-note">
        仅计算这件盾牌或圆盾的本地格挡。品质不参与；伙伴条件、角色其他来源和最大格挡率不计入。
        按固定 PoB 快照向下取整，游戏面板待真机验收。
      </p>
      {result.ok ? (
        <div className="defence-values">
          <article>
            <output className="defence-value" aria-label="当前本件格挡率">
              {result.value.value}%
            </output>
            <p>
              基底格挡 {result.value.base}% · 本地提高 {result.value.increased}%
            </p>
            <p>
              词缀提高 {result.value.increased - result.value.runeIncreased}% + 镶嵌提高{' '}
              {result.value.runeIncreased}%
            </p>
          </article>
        </div>
      ) : (
        <p>暂无法估算：{result.error}</p>
      )}
      {before && after ? (
        <div className="defence-delta">
          <h4>{preview ? '应用后预计格挡变化' : '本步格挡变化'}</h4>
          {previous?.ok && next?.ok ? (
            <p>
              {previous.value.value}% → {next.value.value}%
            </p>
          ) : null}
          {previous && !previous.ok ? <p>前值无法估算：{previous.error}</p> : null}
          {next && !next.ok ? <p>后值无法估算：{next.error}</p> : null}
        </div>
      ) : null}
    </section>
  )
}
