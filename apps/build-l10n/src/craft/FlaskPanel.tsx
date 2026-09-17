import {
  type CraftCatalog,
  type CraftState,
  estimateFlaskProperties,
  type FlaskEstimate,
} from '@poe2-tools/item-core'

const FIELDS = [
  ['amountRecovered', '总回复量'],
  ['duration', '持续时间（秒）'],
  ['instantRecovered', '立即回复'],
  ['gradualRecovered', '持续回复'],
  ['chargesMax', '最大充能'],
  ['chargesUsed', '每次消耗充能'],
  ['chargesGainedIncreased', '获得充能提高（%）'],
  ['chargesPerSecond', '每秒获得充能'],
] as const
const display = (value: number | null) =>
  value === null ? '未知' : Number(value.toFixed(2)).toString()

/** 仅派生当前药剂自身效果；原文面板和角色加成独立保留。 */
export function FlaskPanel({
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
  importedQuality?: number
}) {
  const result = estimateFlaskProperties(catalog, current)
  const previous = before ? estimateFlaskProperties(catalog, before) : null
  const next = after ? estimateFlaskProperties(catalog, after) : null
  const changes =
    previous?.ok && next?.ok
      ? FIELDS.filter(([key]) => previous.value[key] !== next.value[key])
      : []
  const read = (value: FlaskEstimate, key: (typeof FIELDS)[number][0]) => display(value[key])
  return (
    <section className="defence-panel" aria-label="药剂效果估算">
      <h3>药剂效果估算</h3>
      <p className="rehearsal-scope-note">
        只计算本件药剂，角色天赋、装备加成与条件效果另列；按固定来源模型估算，游戏显示与取整待真机验收。
      </p>
      {result.ok ? (
        <>
          <p>
            {result.value.resource === 'life' ? '生命' : '魔力'}药剂 · 已有品质：
            {result.value.quality === null ? '未知' : `${result.value.quality}%`}
          </p>
          {result.value.instantPercent === 100 ? (
            <p>全部立即回复，无持续回复；基础持续时间仅作模型参照。</p>
          ) : null}
          <dl className="defence-values">
            {FIELDS.map(([key, label]) => (
              <div key={key}>
                <dt>{label}</dt>
                <dd>{read(result.value, key)}</dd>
              </div>
            ))}
          </dl>
          {result.value.unknown.map((note) => (
            <p key={note}>{note}</p>
          ))}
          {result.value.notes.length ? (
            <>
              <h4>独立条件与其他效果</h4>
              <ul>
                {[...new Set(result.value.notes)].map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </>
          ) : null}
        </>
      ) : (
        <p>暂无法估算：{result.error}</p>
      )}
      {previous?.ok && next?.ok && changes.length ? (
        <div className="defence-delta">
          <h4>{preview ? '应用后预计变化' : '本步药剂变化'}</h4>
          {changes.map(([key, label]) => (
            <p key={key}>
              {label}：{read(previous.value, key)} → {read(next.value, key)}
            </p>
          ))}
        </div>
      ) : null}
    </section>
  )
}
