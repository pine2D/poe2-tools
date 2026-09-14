import {
  type CraftCatalog,
  type CraftResult,
  type CraftState,
  estimateSkillLevelContributions,
} from '@poe2-tools/item-core'

const LABELS: Record<string, string> = {
  'all Skills': '所有技能',
  'all Minion Skills': '所有召唤生物技能',
  'all Spell Skills': '所有法术技能',
  'all Fire Spell Skills': '所有火焰法术技能',
  'all Cold Spell Skills': '所有冰霜法术技能',
  'all Lightning Spell Skills': '所有闪电法术技能',
  'all Physical Spell Skills': '所有物理法术技能',
  'all Chaos Spell Skills': '所有混沌法术技能',
  'all Attack Skills': '所有攻击技能',
  'all Melee Skills': '所有近战技能',
  'all Projectile Skills': '所有投射物技能',
  'all Mark Skills': '所有印记技能',
  'all Trap Skill Gems': '所有陷阱技能宝石',
  'Socketed Aura Gems': '插槽内光环宝石',
}
const display = (value: CraftResult<number>) =>
  value.ok ? (value.value > 0 ? `+${value.value}` : String(value.value)) : '未知'

export function SkillLevelPanel({
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
  const states = [current, before, after]
  if (
    !states.some((state) =>
      state?.affixes.some((affix) => affix.lines.some((line) => /to Level of/i.test(line))),
    )
  )
    return null
  const result = estimateSkillLevelContributions(catalog, current)
  const previous = before ? estimateSkillLevelContributions(catalog, before) : undefined
  const next = after ? estimateSkillLevelContributions(catalog, after) : undefined
  const scopes = [
    ...new Set(
      [result, previous, next].flatMap((entry) =>
        entry?.ok ? entry.value.map((value) => value.scope) : [],
      ),
    ),
  ]
  const read = (entry: typeof result, scope: string): CraftResult<number> =>
    entry.ok
      ? (entry.value.find((value) => value.scope === scope)?.value ?? { ok: true, value: 0 })
      : entry
  return (
    <section className="defence-panel" aria-label="技能等级词缀贡献">
      <h3>技能等级词缀贡献</h3>
      <p className="rehearsal-scope-note">
        仅统计本件显式词缀的有效值，计入已核对的品质与工艺增效。同一原文范围合计，不同范围分别列出；条件是否满足、技能标签与角色最终等级尚未计算。固有属性、腐化强化与符文不计入此表，授予技能保留起点等级。
      </p>
      {!result.ok ? <p role="status">{result.error}</p> : null}
      <div className="defence-values">
        {scopes.map((scope) => {
          const value = read(result, scope)
          return (
            <article key={scope}>
              <h4>{Object.hasOwn(LABELS, scope) ? LABELS[scope] : scope}</h4>
              <strong className="defence-value">{display(value)}</strong>
              {!value.ok ? <p>{value.error}</p> : null}
              {previous && next ? (
                <p>
                  {preview ? '应用后预计' : '本步变化'}：{display(read(previous, scope))} →{' '}
                  {display(read(next, scope))}
                </p>
              ) : null}
            </article>
          )
        })}
      </div>
    </section>
  )
}
