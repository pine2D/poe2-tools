import {
  type CraftCatalog,
  type CraftState,
  estimateJewelRadius,
  JEWEL_RADIUS_LABELS,
} from '@poe2-tools/item-core'

export function JewelRadiusPanel({
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
  const radius = estimateJewelRadius(catalog, current)
  if (radius.ok && radius.value === null) return null
  const display = (state: CraftState) => {
    const value = estimateJewelRadius(catalog, state)
    return value.ok && value.value !== null ? JEWEL_RADIUS_LABELS[value.value] : '未知'
  }
  return (
    <section className="defence-panel" aria-label="珠宝半径">
      <h3>珠宝半径</h3>
      <strong className="defence-value">
        {radius.ok && radius.value !== null ? JEWEL_RADIUS_LABELS[radius.value] : '未知'}
      </strong>
      {!radius.ok ? <p role="status">{radius.error}</p> : null}
      {before && after ? (
        <p>
          {preview ? '应用后预计' : '本步变化'}：{display(before)} → {display(after)}
        </p>
      ) : null}
      <p className="rehearsal-scope-note">
        半径随当前词缀更新。范围词缀作用于指定天赋，不直接计入角色属性；实际覆盖的天赋数量及角色总收益尚未计算。
      </p>
    </section>
  )
}
