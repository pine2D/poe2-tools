import type { InspectedRune, InspectedSkill, ItemLocale } from '@poe2-tools/item-core'

interface SourcePanelProps {
  locale: ItemLocale
  selections: Record<number, string>
  onSelect: (line: number, candidate: string) => void
  disabled: boolean
}

export function RuneSourcePanel({
  runes,
  ...props
}: SourcePanelProps & { runes: InspectedRune[] }) {
  return <SourceEffectPanel entries={runes} kind="rune" {...props} />
}

export function SkillSourcePanel({
  skills,
  ...props
}: SourcePanelProps & { skills: InspectedSkill[] }) {
  return <SourceEffectPanel entries={skills} kind="skill" {...props} />
}

function SourceEffectPanel({
  entries,
  kind,
  locale,
  selections,
  onSelect,
  disabled,
}: SourcePanelProps & { entries: InspectedRune[]; kind: 'rune' | 'skill' }) {
  if (entries.length === 0) return null
  const label = kind === 'rune' ? '符文' : '技能'
  return (
    <section className="mod-group" aria-label={kind === 'rune' ? '符文效果对照' : '授予技能对照'}>
      <h3>{kind === 'rune' ? '符文效果' : '授予技能'}</h3>
      <p>
        {kind === 'rune'
          ? '以下效果来自镶嵌物，不占前后缀；孔内身份与顺序仍需核对。'
          : '有等级时保留技能等级和最高等级，无等级时保留技能名称，不占前后缀；角色需求及全局技能加成尚未计算。'}
      </p>
      {entries.map(({ source, resolution }) => (
        <div className="stat-pair" key={source.line}>
          <span lang={locale}>{source.raw}</span>
          {resolution.candidates.length > 1 ? (
            <label>
              {label}英文候选
              <select
                aria-label={`第 ${source.line} 行${label}英文候选`}
                disabled={disabled}
                value={selections[source.line] ?? ''}
                onChange={(event) => onSelect(source.line, event.target.value)}
              >
                <option value="">请选择</option>
                {resolution.candidates.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.english}
                  </option>
                ))}
              </select>
            </label>
          ) : resolution.english !== null ? (
            <strong className="stat-english" lang="en">
              {resolution.english}
            </strong>
          ) : locale === 'en' ? (
            <span>英文原文，将与{label}目录核对</span>
          ) : (
            <strong className="unresolved">未识别</strong>
          )}
        </div>
      ))}
    </section>
  )
}
