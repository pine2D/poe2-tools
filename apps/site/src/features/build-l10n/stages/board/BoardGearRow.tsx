// 对照表装备行：每格是该阶段这一栏位的装备，可点开详情
import type { Locale } from '@poe2-tools/build-core'
import type { MouseEvent } from 'react'
import { cx } from '../../../../shared/components/Motif'
import { type GearRow, type Stage, slotCellName } from '../stages'
import { MarkTag, NoneCell } from './BoardParts'
import {
  cellClass,
  type FieldMaps,
  type Focus,
  modCount,
  modsNote,
  slotPath,
  suffixOf,
} from './board'

export interface BoardGearRowProps {
  row: GearRow
  stages: readonly Stage[]
  fieldMaps: FieldMaps
  prefixes: ReadonlyMap<string, ReadonlySet<string>>
  locale: Locale
  /** 当前展开格子的 id，没有则 null */
  focusId: string | null
  onToggle(event: MouseEvent<HTMLButtonElement>, next: Focus): void
}

export function BoardGearRow({
  row,
  stages,
  fieldMaps,
  prefixes,
  locale,
  focusId,
  onToggle,
}: BoardGearRowProps) {
  return (
    <tr className="stageboard__row">
      <th scope="row">{row.label}</th>
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
        const entry = fieldMaps.get(stage.file.id)?.get(slotPath(cell.slot.rawIndex))
        const name = slotCellName(cell.slot, entry)
        const mods = modCount(entry)
        const missed =
          prefixes.get(stage.file.id)?.has(`inventory_slots[${cell.slot.rawIndex}]`) === true
        let prevMods = 0
        if (cell.change === 'modded') {
          const prevCell = row.cells[column - 1]
          const prevStage = stages[column - 1]
          if (prevCell != null && prevStage !== undefined) {
            prevMods = modCount(
              fieldMaps.get(prevStage.file.id)?.get(slotPath(prevCell.slot.rawIndex)),
            )
          }
        }
        const note = modsNote(cell.change, prevMods, mods)
        const count = note === null ? null : <span className={note.className}>{note.text}</span>
        const id = `${stage.file.id}:slot:${cell.slot.rawIndex}`
        return (
          <td key={stage.file.id} data-change={cell.change ?? undefined}>
            <button
              type="button"
              className={cellClass(cell.change, missed)}
              aria-expanded={focusId === id}
              aria-controls={focusId === id ? 'stage-detail' : undefined}
              aria-label={`${stage.label} · ${row.label}：${name.zh}${suffixOf(cell.change, '（词缀有变化）')}${missed ? '，有待核对' : ''}`}
              onClick={(event) =>
                onToggle(event, {
                  id,
                  rowKey: row.key,
                  fileId: stage.file.id,
                  title: `${stage.label} · ${row.label}`,
                  kind: 'slot',
                  rawIndex: cell.slot.rawIndex,
                })
              }
            >
              <span className="stageboard__title">
                <MarkTag change={cell.change} />
                <span className="stageboard__zh" lang={name.translated ? locale : 'en'}>
                  {name.zh}
                </span>
              </span>
              {name.en !== null ? (
                <span className="stageboard__en">
                  <span lang="en">{name.en}</span>
                  {count !== null && <> · {count}</>}
                  {missed && (
                    <>
                      {' · '}
                      <span className="stageboard__meta--miss">待核对</span>
                    </>
                  )}
                </span>
              ) : (
                (count !== null || missed) && (
                  <span className={cx('stageboard__meta', missed && 'stageboard__meta--miss')}>
                    {count}
                    {count !== null && missed && ' · '}
                    {missed && '待核对'}
                  </span>
                )
              )}
            </button>
          </td>
        )
      })}
    </tr>
  )
}
