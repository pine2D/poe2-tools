// 展开行紧跟被点的行，整行跨列；详情内容吸左，宽度等于表格可见宽度
import type { Locale } from '@poe2-tools/build-core'
import type { ReactNode, Ref } from 'react'
import type { FieldWithRows } from '../../preview/fields'
import { levelRange } from '../../preview/plate'
import { SkillCard } from '../../preview/SkillCard'
import { SlotCard } from '../../preview/SlotCard'
import type { Stage } from '../stages'
import { type FieldMaps, type Focus, slotPath } from './board'

export interface BoardDetailRowProps {
  focus: Focus
  stages: readonly Stage[]
  fieldMaps: FieldMaps
  locale: Locale
  bilingual: boolean
  /** 装备名称牌的备注折叠状态 */
  detailOpen: boolean
  onToggleOpen(): void
  onCollapse(): void
  titleRef: Ref<HTMLHeadingElement>
}

export function BoardDetailRow({
  focus,
  stages,
  fieldMaps,
  locale,
  bilingual,
  detailOpen,
  onToggleOpen,
  onCollapse,
  titleRef,
}: BoardDetailRowProps) {
  let detail: ReactNode = null
  const stage = stages.find((item) => item.file.id === focus.fileId)
  const fields = fieldMaps.get(focus.fileId) ?? new Map<string, FieldWithRows>()
  if (stage !== undefined && focus.kind === 'slot') {
    const slot = stage.file.preview.slots.find((item) => item.rawIndex === focus.rawIndex)
    const entry = fields.get(slotPath(focus.rawIndex))
    if (slot !== undefined && entry !== undefined) {
      detail = (
        <SlotCard
          slot={slot}
          entry={entry}
          level={levelRange(stage.file.input.inventory_slots, slot.rawIndex)}
          locale={locale}
          bilingual={bilingual}
          open={detailOpen}
          onToggle={onToggleOpen}
        />
      )
    }
  }
  if (stage !== undefined && focus.kind === 'skill') {
    const skill = stage.file.preview.skills[focus.index]
    if (skill !== undefined) {
      detail = (
        <SkillCard
          skill={skill}
          index={focus.index}
          fields={fields}
          level={levelRange(stage.file.input.skills, focus.index)}
          locale={locale}
          bilingual={bilingual}
          view="compare"
        />
      )
    }
  }
  return (
    <tr className="stageboard__expand">
      <td colSpan={stages.length + 1}>
        <section
          id="stage-detail"
          className="stageboard__detail"
          aria-labelledby="stage-detail-title"
          lang={locale}
        >
          <div className="stageboard__detail-head">
            <h3 id="stage-detail-title" ref={titleRef} tabIndex={-1}>
              {focus.title}
            </h3>
            <button
              type="button"
              className="pt-btn pt-btn--quiet pt-btn--xs"
              aria-label="收起详情"
              onClick={onCollapse}
            >
              收起
            </button>
          </div>
          {detail}
        </section>
      </td>
    </tr>
  )
}
