import {
  type CraftCatalog,
  type CraftState,
  estimateWeaponStats,
  type WeaponEstimate,
} from '@poe2-tools/item-core'

const LABELS = { Physical: '物理', Fire: '火焰', Cold: '冰霜', Lightning: '闪电', Chaos: '混沌' }
const display = (value: number) =>
  Number(value.toFixed(3)).toLocaleString('zh-CN', { maximumFractionDigits: 3 })
function metrics(value: WeaponEstimate): [string, number, string][] {
  return [
    ['总武器 DPS', value.totalDps, ''],
    ['物理 DPS', value.physicalDps, ''],
    ['元素 DPS', value.elementalDps, ''],
    ['混沌 DPS', value.chaosDps, ''],
    ['攻击每秒', value.attackSpeed.value, '次/秒'],
    ['暴击几率', value.criticalChance.value, '百分点'],
    ...(value.reload ? [['装填时间', value.reload.value, '秒'] as [string, number, string]] : []),
  ]
}
/** 当前面板和草稿各自只读派生，取消不会修改当前值。 */
export function WeaponPanel({
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
  const result = estimateWeaponStats(catalog, current)
  const previous = before ? estimateWeaponStats(catalog, before) : null
  const next = after ? estimateWeaponStats(catalog, after) : null
  return (
    <section className="defence-panel" aria-label="武器面板估算">
      <h3>武器面板估算</h3>
      <p className="rehearsal-scope-note">
        装备本地估算，未计技能、命中、暴击期望和全局额外伤害；游戏取整待真机验收。弩的 DPS
        未计装填循环。
      </p>
      {catalog.bases.find((base) => base.id === current.baseId)?.type === 'Talisman' ? (
        <p className="rehearsal-scope-note">
          魔符形态与技能由角色选择，此处只估算武器本件伤害，不代表变形攻击的最终伤害。
        </p>
      ) : null}
      {importedQuality !== undefined ? (
        <p>品质来源：用户核对导入装备，起点已有 {importedQuality}%。</p>
      ) : null}
      {result.ok ? (
        <>
          <div className="defence-values">
            {metrics(result.value).map(([label, value, unit]) => (
              <article key={label}>
                <strong>
                  {label}：{display(value)}
                  {label === '暴击几率' ? '%' : unit}
                </strong>
              </article>
            ))}
          </div>
          <div className="defence-values">
            {Object.entries(result.value.damage).map(([type, entry]) => (
              <article key={type}>
                <h4>{LABELS[type as keyof typeof LABELS]}伤害</h4>
                <strong>
                  {entry.min}–{entry.max}
                </strong>
                <p>DPS：{display(entry.dps)}</p>
              </article>
            ))}
          </div>
          <details>
            <summary>查看基底、词缀、符文与品质贡献</summary>
            <p>起点已有品质 {result.value.quality}%，仅对物理伤害单独乘算。</p>
            {Object.entries(result.value.damage).map(([type, entry]) => (
              <p key={type}>
                {LABELS[type as keyof typeof LABELS]}：基底 {entry.baseMin}–{entry.baseMax}
                ；词缀平值 {entry.affixMin}–{entry.affixMax}；符文平值 {entry.runeMin}–
                {entry.runeMax}；词缀提高 {entry.affixIncreased}%；符文提高 {entry.runeIncreased}%。
                {entry.corruptionMin !== undefined
                  ? ` 腐化平值 ${entry.corruptionMin}–${entry.corruptionMax}。`
                  : ''}
                {entry.corruptionIncreased !== undefined
                  ? ` 腐化提高 ${entry.corruptionIncreased}%。`
                  : ''}
              </p>
            ))}
            <p>
              基础攻击每秒 {result.value.attackSpeed.base}，词缀提高{' '}
              {result.value.attackSpeed.increased - result.value.attackSpeed.runeIncreased}
              %，镶嵌物提高 {result.value.attackSpeed.runeIncreased}%。
            </p>
            <p>
              基础暴击率 {result.value.criticalChance.base}%，词缀增加{' '}
              {result.value.criticalChance.addedPoints} 个百分点。
            </p>
            {result.value.reload ? (
              <p>
                基础装填 {result.value.reload.base} 秒，攻速提高 {result.value.reload.increased}%
                同时缩短装填时间。
              </p>
            ) : null}
          </details>
        </>
      ) : (
        <p>暂无法估算：{result.error}</p>
      )}
      {before && after ? (
        <div className="defence-delta">
          <h4>{preview ? '应用后预计变化' : '本步武器变化'}</h4>
          {previous?.ok && next?.ok
            ? metrics(next.value).map(([label, value, unit]) => {
                const old = metrics(previous.value).find(([name]) => name === label)
                if (!old) return null
                const change = value - old[1]
                return (
                  <p key={label}>
                    {label}：
                    <span>
                      {display(old[1])} → {display(value)}（{change > 0 ? '+' : ''}
                      {display(change)}
                      {unit}）
                    </span>
                  </p>
                )
              })
            : null}
          {previous && !previous.ok ? <p>前值无法估算：{previous.error}</p> : null}
          {next && !next.ok ? <p>后值无法估算：{next.error}</p> : null}
        </div>
      ) : null}
    </section>
  )
}
