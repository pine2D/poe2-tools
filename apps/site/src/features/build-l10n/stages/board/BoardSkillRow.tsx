// 对照表技能行：行头是主宝石，每格是该阶段的辅助宝石，可点开技能卡
import type { Locale } from '@poe2-tools/build-core'
import type { MouseEvent } from 'react'
import { cx } from '../../../../shared/components/Motif'
import type { SkillRow, Stage } from '../stages'
import { MarkTag, NoneCell } from './BoardParts'
import { cellClass, displayName, type Focus, suffixOf } from './board'

export interface BoardSkillRowProps {
  row: SkillRow
  stages: readonly Stage[]
  prefixes: ReadonlyMap<string, ReadonlySet<string>>
  locale: Locale
  /** 当前展开格子的 id，没有则 null */
  focusId: string | null
  onToggle(event: MouseEvent<HTMLButtonElement>, next: Focus): void
}

export function BoardSkillRow({
  row,
  stages,
  prefixes,
  locale,
  focusId,
  onToggle,
}: BoardSkillRowProps) {
  const rowName = displayName(row.name)
  return (
    <tr className="stageboard__row stageboard__row--skill">
      <th scope="row" lang={row.name.text === null ? 'en' : locale}>
        {rowName}
      </th>
      {row.cells.map((cell, column) => {
        const stage = stages[column]
        if (cell === null || stage === undefined) {
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: 列位置就是阶段身份
            <td key={column}>
              <NoneCell />
            </td>
          )
        }
        const names = cell.skill.supports.map(displayName)
        const summary = names.length > 0 ? `辅助 ${names.length}（${names.join('、')}）` : '无辅助'
        const missed = prefixes.get(stage.file.id)?.has(`skills[${cell.index}]`) === true
        const id = `${stage.file.id}:skill:${cell.index}`
        // 技能行按宝石对齐，主宝石不变，只会是 新 / 改 / 同
        return (
          <td key={stage.file.id} data-change={cell.change ?? undefined}>
            <button
              type="button"
              className={cellClass(cell.change, missed)}
              aria-expanded={focusId === id}
              aria-controls={focusId === id ? 'stage-detail' : undefined}
              aria-label={`${stage.label} · ${rowName}：${summary}${suffixOf(cell.change, '（辅助有变化）')}${missed ? '，有待核对' : ''}`}
              onClick={(event) =>
                onToggle(event, {
                  id,
                  rowKey: row.key,
                  fileId: stage.file.id,
                  title: `${stage.label} · ${rowName}`,
                  kind: 'skill',
                  index: cell.index,
                })
              }
            >
              <span className="stageboard__title">
                <MarkTag change={cell.change} />
                <span
                  className={cx(
                    'stageboard__supports',
                    names.length === 0 && 'stageboard__supports--none',
                    cell.change === 'modded' && 'stageboard__supports--modded',
                  )}
                  lang={locale}
                >
                  {names.length > 0 ? names.join('、') : '无辅助'}
                </span>
              </span>
              {missed && <span className="stageboard__meta stageboard__meta--miss">待核对</span>}
            </button>
          </td>
        )
      })}
    </tr>
  )
}
