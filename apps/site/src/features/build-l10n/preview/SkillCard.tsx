// 技能卡（spec §6.4.2）：每个主动宝石一张 pt-panel item（gem 边）+ gem 名称牌（扣保持琥珀，§5.8）；
// 辅助宝石沿用行内 NamePair 与各自的对照行，放在同一张卡内。
import type { Locale, PreviewSkill } from '@poe2-tools/build-core'
import type { ReactNode } from 'react'
import { PtNameplate } from '../../../shared/components/PtNameplate'
import { PtPanel } from '../../../shared/components/PtPanel'
import type { FieldWithRows } from './fields'
import { NamePair } from './NamePair'
import { PairTable, type PreviewView } from './PairTable'
import { hasText, type ModStatus, modStatus } from './plate'
import { LevelItem, StatusItem } from './SlotCard'

export interface SkillCardProps {
  skill: PreviewSkill
  index: number
  fields: ReadonlyMap<string, FieldWithRows>
  /** levelRange 的结果，没有则 null */
  level: string | null
  locale: Locale
  bilingual: boolean
  view: PreviewView
}

export function SkillCard({
  skill,
  index,
  fields,
  level,
  locale,
  bilingual,
  view,
}: SkillCardProps) {
  const own = fields.get(`skills[${index}].additional_text`)
  const status: ModStatus =
    own === undefined ? { kind: 'none' } : modStatus(own.rows, own.entry.baseName, false)
  const tail: ReactNode[] = []
  if (level !== null) tail.push(<LevelItem key="level" range={level} />)
  if (status.kind !== 'none') tail.push(<StatusItem key="status" status={status} />)
  if (bilingual) {
    tail.push(
      <span key="bilingual" className="pt-nameplate__tag">
        双语
      </span>,
    )
  }
  const noted = own !== undefined && own.rows.length > 0
  const supported = skill.supports.length > 0
  return (
    <PtPanel as="article" variant="item" edge="gem">
      <PtNameplate
        variant="gem"
        shut={!noted && !supported}
        nameAttrs={{ lang: locale }}
        name={skill.text ?? <span className="app__gem-miss">未命中</span>}
        en={skill.en ?? skill.id}
        meta={[[], tail]}
      />
      {noted && (
        <PairTable
          path={own.entry.path}
          rows={own.rows}
          locale={locale}
          baseName={own.entry.baseName}
          bilingual={bilingual}
          view={view}
        />
      )}
      {supported && (
        <ul className="supports">
          {skill.supports.map((support, j) => {
            const entry = fields.get(`skills[${index}].support_skills[${j}].additional_text`)
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: 同一宝石可重复出现，位置是身份的一部分
              <li key={`${support.id}:${j}`}>
                <NamePair name={support} kind="gem" />
                {hasText(entry) && (
                  <PairTable
                    path={entry.entry.path}
                    rows={entry.rows}
                    locale={locale}
                    baseName={entry.entry.baseName}
                    bilingual={bilingual}
                    view={view}
                  />
                )}
              </li>
            )
          })}
        </ul>
      )}
    </PtPanel>
  )
}
