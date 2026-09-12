import {
  type CraftCatalog,
  type CraftState,
  estimateDefences,
  supportsItemQuality,
} from '@poe2-tools/item-core'

const LABELS = { Armour: '护甲', Evasion: '闪避', EnergyShield: '能量护盾' }

/** 面板只读派生；不将估算反写来源面板或历史状态。 */
export function DefencePanel({
  catalog,
  current,
  before,
  after,
  preview,
  importedQuality,
}: {
  catalog: CraftCatalog
  current: CraftState
  before?: CraftState
  after?: CraftState
  preview: boolean
  importedQuality?: number
}) {
  const result = estimateDefences(catalog, current)
  const base = catalog.bases.find((entry) => entry.id === current.baseId)
  const qualitySupported = base !== undefined && supportsItemQuality(base)
  const previous = before ? estimateDefences(catalog, before) : null
  const next = after ? estimateDefences(catalog, after) : null
  const delta =
    previous?.ok && next?.ok
      ? next.value
          .map((entry) => {
            const old = previous.value.find((candidate) => candidate.stat === entry.stat)
            return old
              ? {
                  stat: entry.stat,
                  before: old.value,
                  after: entry.value,
                  change: entry.value - old.value,
                }
              : null
          })
          .filter((entry) => entry !== null)
      : []
  return (
    <section className="defence-panel" aria-label="防御面板估算">
      <h3>防御面板估算</h3>
      <p className="rehearsal-scope-note">
        按当前 PoB 目录快照估算护甲、闪避、能量护盾；游戏取整待真机验收，原文面板仍作为独立对照。
      </p>
      <p>
        {current.quality === undefined
          ? qualitySupported
            ? '品质未知；请核对起点品质后重新开始。'
            : '该类别尚未提供防御面板模型。'
          : importedQuality !== undefined
            ? `品质来源：用户核对导入装备，起点已有 ${importedQuality}%。`
            : current.sourceText !== null
              ? `品质来源：复制原文，${current.quality}%。`
              : `品质来源：新建起点，已有 ${current.quality}%。`}
      </p>
      {result.ok ? (
        <div className="defence-values">
          {result.value.map((entry) => (
            <article key={entry.stat}>
              <h4>{LABELS[entry.stat]}</h4>
              <strong className="defence-value">{entry.value}</strong>
              <p>
                基底 {entry.base} + 本地平值 {entry.flat}
              </p>
              <p>
                本地提高 {entry.increased}% · 品质 {entry.quality}%
              </p>
              <p>
                词缀提高 {entry.increased - entry.runeIncreased}% + 符文提高 {entry.runeIncreased}%
              </p>
              <small>
                ({entry.base} + {entry.flat}) × {1 + entry.increased / 100} ×{' '}
                {1 + entry.quality / 100}，四舍五入
              </small>
            </article>
          ))}
        </div>
      ) : current.quality !== undefined || !qualitySupported ? (
        <p>暂无法估算：{result.error}</p>
      ) : null}
      {before && after ? (
        <div className="defence-delta">
          <h4>{preview ? '应用后预计变化' : '本步防御变化'}</h4>
          {delta.map((entry) => (
            <p key={entry.stat}>
              {LABELS[entry.stat]}：
              <span>
                {entry.before} → {entry.after}（{entry.change > 0 ? '+' : ''}
                {entry.change}）
              </span>
            </p>
          ))}
          {previous && !previous.ok ? <p>前值无法估算：{previous.error}</p> : null}
          {next && !next.ok ? <p>后值无法估算：{next.error}</p> : null}
        </div>
      ) : null}
    </section>
  )
}
