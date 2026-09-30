// 中英对照视图的装备卡（spec §6.4.2、§6.4.3）：pt-panel item + 名称牌 + L0 对照行。
// 名称牌吃掉字段首行的基底名与传奇名注入行；锚点 id、tabIndex=-1、role=note 语义与改版前相同。
import type { Locale, PreviewSlot } from '@poe2-tools/build-core'
import type { ReactNode } from 'react'
import { Icon } from '../../../shared/components/Icon'
import { PtNameplate, type PtNameplateProps } from '../../../shared/components/PtNameplate'
import { PtPanel } from '../../../shared/components/PtPanel'
import { type FieldWithRows, slotLabel } from './fields'
import { domIdFor, rowDomId } from './locate'
import { MarkupText } from './MarkupText'
import { spanText } from './markup'
import { PairTable } from './PairTable'
import {
  BASE_TITLE,
  LEVEL_TITLE,
  type ModStatus,
  modStatus,
  slotVariant,
  UNIQUE_TITLE,
} from './plate'
import { isMissedRow, type PairRow } from './rows'

type PlateName = Pick<PtNameplateProps, 'name' | 'nameAttrs' | 'en' | 'miss'>

/** 名称牌第一行（spec §6.4.3 第一行表，§6.4.4 同此规则）；英文回退时不渲染 Cinzel 英文名（R9） */
export function slotPlateName(slot: PreviewSlot, entry: FieldWithRows, locale: Locale): PlateName {
  const variant = slotVariant(slot, entry)
  if (variant === 'unique') {
    const id = domIdFor(`inventory_slots[${slot.rawIndex}].unique_name`)
    if (slot.uniqueText === null) {
      return {
        name: (
          <span id={id} tabIndex={-1} role="note" aria-label="传奇名未收录">
            {slot.uniqueName}
          </span>
        ),
        nameAttrs: { lang: 'en' },
        en: null,
        miss: '传奇名未收录',
      }
    }
    return {
      name: slot.uniqueText,
      nameAttrs: { lang: locale, id, tabIndex: -1 },
      en: slot.uniqueName,
      miss: null,
    }
  }
  const first = entry.rows[0]
  if (variant === 'base' && first !== undefined) {
    const id = rowDomId(entry.entry.path, first.index)
    const missed = isMissedRow(first, entry.entry.baseName)
    const fallback = missed || first.zh === null
    const text = <MarkupText spans={fallback ? first.en : (first.zh ?? first.en)} />
    if (missed) {
      return {
        name: (
          <span id={id} tabIndex={-1} role="note" aria-label="基底名未收录">
            {text}
          </span>
        ),
        nameAttrs: { lang: 'en', title: BASE_TITLE },
        en: null,
        miss: '基底名未收录',
      }
    }
    return {
      name: text,
      nameAttrs: { lang: fallback ? 'en' : locale, id, tabIndex: -1, title: BASE_TITLE },
      en: fallback ? null : spanText(first.en),
      miss: null,
    }
  }
  // collapsed：名称是槽位名，没有英文名，也不挂锚点
  return {
    name: slotLabel(slot),
    nameAttrs: { lang: slot.label === null ? 'en' : locale, title: slot.inventoryId },
    en: null,
    miss: null,
  }
}

/** unique 的“基底 <基底名>”（名称牌第二行、提示框属性行共用）；挂 rowDomId(path, 0) 锚点 */
export function UniqueBase(props: {
  row: PairRow
  path: string
  baseName: boolean
  locale: Locale
}) {
  const { row, path, baseName, locale } = props
  const missed = isMissedRow(row, baseName)
  const fallback = missed || row.zh === null
  const note = missed ? ({ role: 'note', 'aria-label': '基底名未收录' } as const) : {}
  return (
    <span>
      基底{' '}
      <span
        id={rowDomId(path, row.index)}
        tabIndex={-1}
        lang={fallback ? 'en' : locale}
        data-user-text=""
        {...note}
      >
        <MarkupText spans={fallback ? row.en : (row.zh ?? row.en)} />
      </span>
      {missed && (
        <>
          {' '}
          <span className="pt-nameplate__miss" aria-hidden="true">
            <Icon name="warning" size={14} />
            基底名未收录
          </span>
        </>
      )}
    </span>
  )
}

/** “适用等级 a–b”（B9），带说明 title */
export function LevelItem({ range }: { range: string }) {
  return (
    <span title={LEVEL_TITLE}>
      适用等级 <span className="pt-num">{range}</span>
    </span>
  )
}

/** 第二行命中状态：✓ x/y、词缀 x/y（B1）、⚠ x/y · n 行待核对 */
export function StatusItem({ status }: { status: Exclude<ModStatus, { kind: 'none' }> }) {
  if (status.kind === 'ok') {
    return (
      <span className="pt-nameplate__ok">
        <Icon name="check" size={16} />
        <span className="pt-num">{`${status.hit}/${status.total}`}</span>
      </span>
    )
  }
  if (status.kind === 'count') {
    return (
      <span className="pt-nameplate__count pt-num">{`词缀 ${status.hit}/${status.total}`}</span>
    )
  }
  return (
    <span className="pt-nameplate__warn">
      <Icon name="warning" size={16} />
      <span className="pt-num">{`${status.hit}/${status.total} · ${status.missed} 行待核对`}</span>
    </span>
  )
}

export interface SlotCardProps {
  slot: PreviewSlot
  entry: FieldWithRows
  /** levelRange 的结果（如“16–100”），没有则 null */
  level: string | null
  locale: Locale
  bilingual: boolean
  /** collapsed 变体的对照区是否展开（spec §6.4.3） */
  open: boolean
  onToggle(): void
}

export function SlotCard({ slot, entry, level, locale, bilingual, open, onToggle }: SlotCardProps) {
  const variant = slotVariant(slot, entry)
  const { path, baseName } = entry.entry
  const first = entry.rows[0]
  const baseRow = first?.base === true ? first : null
  const baseMissed = baseRow !== null && isMissedRow(baseRow, baseName)
  const pairs = entry.rows.filter((row) => !(baseName && row.base))
  const collapsed = variant === 'collapsed'
  const expanded = !collapsed || open
  const rowsId = `slot-rows-${slot.rawIndex}`
  const nameMissed =
    variant === 'unique' ? slot.uniqueText === null || baseMissed : variant === 'base' && baseMissed
  const status = modStatus(entry.rows, baseName, nameMissed)
  // 第二行两组（spec §6.7 ≤600px 两组）：类型标签 · 基底名 · 槽位 | 适用等级 · 状态 · 双语 · 展开
  const lead: ReactNode[] = []
  if (variant === 'unique') {
    lead.push(
      <span key="type" className="pt-nameplate__tag" title={UNIQUE_TITLE}>
        传奇
      </span>,
    )
    if (baseRow !== null) {
      lead.push(
        <UniqueBase key="base" row={baseRow} path={path} baseName={baseName} locale={locale} />,
      )
    }
  }
  if (!collapsed) {
    lead.push(
      <span key="slot" title={slot.inventoryId}>
        {slotLabel(slot)}
      </span>,
    )
  }
  const tail: ReactNode[] = []
  if (level !== null) tail.push(<LevelItem key="level" range={level} />)
  if (status.kind !== 'none') tail.push(<StatusItem key="status" status={status} />)
  if (variant === 'unique' && entry.injected !== null) {
    tail.push(
      <span key="injected" className="pt-nameplate__ok">
        <Icon name="check" size={16} />
        传奇名已写入
      </span>,
    )
  }
  if (bilingual) {
    tail.push(
      <span key="bilingual" className="pt-nameplate__tag">
        双语
      </span>,
    )
  }
  if (collapsed && pairs.length > 0) {
    tail.push(
      <button
        key="toggle"
        type="button"
        className="pt-nameplate__toggle"
        aria-expanded={open}
        aria-controls={rowsId}
        onClick={onToggle}
      >
        {`备注 ${pairs.length} 行 · ${open ? '收起' : '展开'}`}
        <Icon name="chevron-down" size={16} />
      </button>,
    )
  }
  return (
    <PtPanel
      as="article"
      variant="item"
      {...(variant === 'unique' ? { edge: 'unique' as const } : {})}
    >
      <PtNameplate
        variant={variant}
        shut={pairs.length === 0 || !expanded}
        {...slotPlateName(slot, entry, locale)}
        meta={[lead, tail]}
      />
      {pairs.length > 0 && (
        <PairTable
          id={collapsed ? rowsId : undefined}
          hidden={!expanded}
          path={path}
          rows={entry.rows}
          locale={locale}
          baseName={baseName}
          bilingual={bilingual}
        />
      )}
    </PtPanel>
  )
}
