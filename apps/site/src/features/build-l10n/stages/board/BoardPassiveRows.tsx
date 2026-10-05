// 对照表天赋分组：按名称合并计数，每阶段列出前几种，其余写总数
import type { Locale } from '@poe2-tools/build-core'
import { passiveSummary, type Stage } from '../stages'
import { SectionRow } from './BoardParts'
import { displayName, PASSIVE_TOP } from './board'

export function BoardPassiveRows({ stages, locale }: { stages: readonly Stage[]; locale: Locale }) {
  if (!stages.some((stage) => stage.file.preview.passives.length > 0)) return null
  return (
    <>
      <SectionRow label="天赋" colSpan={stages.length + 1} />
      <tr className="stageboard__row">
        <th scope="row">构成</th>
        {stages.map((stage) => {
          const summary = passiveSummary(stage.file.preview.passives)
          const rest = summary.length - PASSIVE_TOP
          return (
            <td key={stage.file.id}>
              <ul className="stageboard__passives">
                {summary.slice(0, PASSIVE_TOP).map(({ name, count }) => (
                  <li key={displayName(name)}>
                    <span lang={name.text === null ? 'en' : locale}>{displayName(name)}</span>
                    <span className="pt-num">×{count}</span>
                  </li>
                ))}
              </ul>
              {rest > 0 && <p className="stageboard__more">其余 {rest} 种</p>}
            </td>
          )
        })}
      </tr>
    </>
  )
}
