// 译文视图的只读提示框（spec §6.4.4，只用于装备页签）：名称牌提示框形态 + 属性行 + 稀有度色分隔线 + 中文词缀。
// 锚点与中英对照视图相同（两种视图不同时渲染，id 不会重复）；collapsed 条目在这里不折叠，显示全部行。
import type { Locale, PreviewSlot } from '@poe2-tools/build-core'
import { Fragment, type ReactNode } from 'react'
import { Icon } from '../../../shared/components/Icon'
import { PtDivider } from '../../../shared/components/PtDivider'
import { PtNameplate } from '../../../shared/components/PtNameplate'
import { PtPanel } from '../../../shared/components/PtPanel'
import { type FieldWithRows, slotLabel } from './fields'
import { rowDomId } from './locate'
import { MarkupText } from './MarkupText'
import { slotVariant, UNIQUE_TITLE } from './plate'
import { isMissedRow } from './rows'
import { LevelItem, slotPlateName, UniqueBase } from './SlotCard'

export interface TooltipCardProps {
  slot: PreviewSlot
  entry: FieldWithRows
  level: string | null
  locale: Locale
  /** 开启“导出时保留英文原行”时为 true：属性行末尾加“双语”标签（附录 B.10） */
  bilingual?: boolean
}

export function TooltipCard({ slot, entry, level, locale, bilingual = false }: TooltipCardProps) {
  const variant = slotVariant(slot, entry)
  const { path, baseName } = entry.entry
  const first = entry.rows[0]
  // 属性行：槽位 · 适用等级 · 类型标签（只有 unique 的“传奇”）· 基底 <基底名> · 双语；缺的项省略，collapsed 的槽位已作名称
  const props: ReactNode[] = []
  if (variant !== 'collapsed') {
    props.push(
      <span key="slot" title={slot.inventoryId}>
        {slotLabel(slot)}
      </span>,
    )
  }
  if (level !== null) props.push(<LevelItem key="level" range={level} />)
  if (variant === 'unique') {
    props.push(
      <span key="type" className="pt-nameplate__tag" title={UNIQUE_TITLE}>
        传奇
      </span>,
    )
    if (first?.base === true) {
      props.push(
        <UniqueBase key="base" row={first} path={path} baseName={baseName} locale={locale} />,
      )
    }
  }
  // 双语：与对照视图名称牌第二行的“双语”标签同一形态（SlotCard）；保留的英文原行本身不在提示框显示
  if (bilingual) {
    props.push(
      <span key="bilingual" className="pt-nameplate__tag">
        双语
      </span>,
    )
  }
  const pairs = entry.rows.filter((row) => !(baseName && row.base))
  return (
    <PtPanel
      as="article"
      variant="item"
      {...(variant === 'unique' ? { edge: 'unique' as const } : {})}
    >
      <PtNameplate variant={variant} tooltip {...slotPlateName(slot, entry, locale)} />
      <div className="pt-tooltip__body">
        {props.length > 0 && (
          <p className="pt-tooltip__prop">
            {props.map((item, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: 属性项按固定顺序生成，位置就是身份
              <Fragment key={i}>
                {i > 0 && (
                  <i className="pt-tooltip__dot" aria-hidden="true">
                    ·
                  </i>
                )}
                {item}
              </Fragment>
            ))}
          </p>
        )}
        {pairs.length > 0 && <PtDivider />}
        {pairs.map((row) => {
          const id = rowDomId(path, row.index)
          const text = <MarkupText spans={row.zh ?? row.en} />
          if (isMissedRow(row, baseName)) {
            return (
              <Fragment key={row.index}>
                <p
                  className="pt-tooltip__mod pt-tooltip__mod--kept"
                  id={id}
                  tabIndex={-1}
                  lang="en"
                  role="note"
                  aria-label="未命中"
                >
                  {text}
                </p>
                <span className="pt-tag-miss" lang="zh-CN">
                  <Icon name="warning" size={14} />
                  未命中 · 保留原文
                </span>
              </Fragment>
            )
          }
          if (row.status === 'kept') {
            return (
              <p
                key={row.index}
                className="pt-tooltip__mod pt-tooltip__mod--as-is"
                id={id}
                tabIndex={-1}
                lang="en"
              >
                {text}
              </p>
            )
          }
          return (
            <p key={row.index} className="pt-tooltip__mod" id={id} tabIndex={-1} lang={locale}>
              {text}
            </p>
          )
        })}
      </div>
    </PtPanel>
  )
}
