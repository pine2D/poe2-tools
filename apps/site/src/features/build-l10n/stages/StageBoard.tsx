// 阶段并排对照（2026-10-03 方案 §3.2–3.3；方向约定见 apps/site/.impeccable/surfaces/）：
// 一扇 pt-frame 是本状态唯一的框，框内是 L0 对照表：列 = 阶段，行 = 栏位 / 宝石 / 天赋；
// 列头所在的阶段带是唯一的金属注意力落点。点格子在该行下方展开该件的名称牌与中英对照；
// “逐项核对”进入单阶段的 Preview（N/F 快捷键、定位都在那里）。子件与版面测量见 ./board/。
import type { Locale } from '@poe2-tools/build-core'
import { type CSSProperties, Fragment, type MouseEvent, useEffect, useRef, useState } from 'react'
import { PtFrame } from '../../../shared/components/PtFrame'
import type { FieldWithRows } from '../preview/fields'
import { BoardDetailRow } from './board/BoardDetailRow'
import { BoardGearRow } from './board/BoardGearRow'
import { BoardFacts, SeriesSwitch, StageOrder } from './board/BoardHead'
import { SectionRow } from './board/BoardParts'
import { BoardPassiveRows } from './board/BoardPassiveRows'
import { BoardSkillRow } from './board/BoardSkillRow'
import { BoardTableHead } from './board/BoardTableHead'
import type { Focus } from './board/board'
import { useBoardData } from './board/useBoardData'
import { useBoardLayout } from './board/useBoardLayout'
import type { Series } from './stages'

export interface StageBoardProps {
  series: Series
  allSeries: readonly Series[]
  fieldsById: ReadonlyMap<string, readonly FieldWithRows[]>
  locale: Locale
  bilingual: boolean
  onSeries(key: string): void
  onDownload(): void
  onReview(fileId: string): void
  onOrder(ids: readonly string[] | null): void
}

export function StageBoard({
  series,
  allSeries,
  fieldsById,
  locale,
  bilingual,
  onSeries,
  onDownload,
  onReview,
  onOrder,
}: StageBoardProps) {
  const { stages } = series
  const frame = useRef<HTMLElement>(null)
  const detailTitle = useRef<HTMLHeadingElement>(null)
  const opener = useRef<HTMLButtonElement | null>(null)
  const [focus, setFocus] = useState<Focus | null>(null)
  const [detailOpen, setDetailOpen] = useState(true)
  const { gear, skills, fieldMaps, misses, prefixes, totalMisses } = useBoardData(
    stages,
    fieldsById,
  )
  // 导入后滚到主区框顶部，与 Preview 一致（scroll-margin-top 取 --main-pad-top）
  useEffect(() => {
    frame.current?.scrollIntoView({ block: 'start' })
  }, [])
  useEffect(() => {
    if (focus !== null) detailTitle.current?.focus()
  }, [focus])
  const { ghost, viewport, scroller, table, overflow, widths } = useBoardLayout(stages)

  const toggle = (event: MouseEvent<HTMLButtonElement>, next: Focus) => {
    opener.current = event.currentTarget
    setDetailOpen(true)
    setFocus((current) => (current?.id === next.id ? null : next))
  }
  const collapse = () => {
    setFocus(null)
    opener.current?.focus()
  }
  const style = { '--stages': String(stages.length) } as CSSProperties
  const focusId = focus?.id ?? null
  const columns = stages.length + 1

  // 展开行只跟在被点格子所在的行后面
  const detailRow = (rowKey: string) =>
    focus?.rowKey === rowKey && (
      <BoardDetailRow
        focus={focus}
        stages={stages}
        fieldMaps={fieldMaps}
        locale={locale}
        bilingual={bilingual}
        detailOpen={detailOpen}
        onToggleOpen={() => setDetailOpen((open) => !open)}
        onCollapse={collapse}
        titleRef={detailTitle}
      />
    )

  return (
    <PtFrame
      ref={frame}
      className="app__build-frame app__build-frame--board"
      aria-labelledby="board-title"
      titlebar={{ title: series.title, id: 'board-title', fullText: series.title, userText: true }}
    >
      <BoardFacts
        series={series}
        locale={locale}
        totalMisses={totalMisses}
        onDownload={onDownload}
      />
      {allSeries.length > 1 && (
        <SeriesSwitch allSeries={allSeries} currentKey={series.key} onSeries={onSeries} />
      )}
      {series.separated && (
        <p className="stageboard__groupnote">
          同一来源中作者或升华不同，已分开显示；信息不完整的文件单独保留。
        </p>
      )}
      {stages.length > 1 && (
        <StageOrder
          series={series}
          onOrder={(ids) => {
            setFocus(null)
            onOrder(ids)
          }}
        />
      )}
      <div ref={ghost} className="stageboard__ghost" data-show="false" aria-hidden="true">
        <div className="stageboard__ghost-bar">
          <span className="stageboard__ghost-corner" />
          <div className="stageboard__ghost-clip">
            <div className="stageboard__ghost-track pt-stagehead" lang={locale} data-user-text="">
              {stages.map((stage, i) => (
                <span key={stage.file.id} style={{ inlineSize: widths[i] }}>
                  {stage.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
      <p className="stageboard__scrollhint" hidden={!overflow}>
        共 <span className="pt-num">{stages.length}</span> 个阶段 · 左右滑动查看
      </p>
      <div ref={viewport} className="stageboard__viewport" data-start="false" data-end="false">
        <section
          ref={scroller}
          className="stageboard__scroll"
          aria-label="阶段对照表"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: 横向可滚动区域要能用键盘滚动
          tabIndex={0}
        >
          <table ref={table} className="stageboard__table" style={style} lang={locale}>
            <caption className="visually-hidden">
              各阶段的装备、技能与天赋对照；“新”表示本阶段新增，“换”表示换了另一件，“改”表示同一件改了词缀
            </caption>
            <BoardTableHead
              stages={stages}
              fieldMaps={fieldMaps}
              misses={misses}
              onReview={onReview}
            />
            <tbody>
              {gear.length > 0 && <SectionRow label="装备" colSpan={columns} />}
              {gear.map((row) => (
                <Fragment key={row.key}>
                  <BoardGearRow
                    row={row}
                    stages={stages}
                    fieldMaps={fieldMaps}
                    prefixes={prefixes}
                    locale={locale}
                    focusId={focusId}
                    onToggle={toggle}
                  />
                  {detailRow(row.key)}
                </Fragment>
              ))}
              {skills.length > 0 && <SectionRow label="技能" colSpan={columns} />}
              {skills.map((row) => (
                <Fragment key={row.key}>
                  <BoardSkillRow
                    row={row}
                    stages={stages}
                    prefixes={prefixes}
                    locale={locale}
                    focusId={focusId}
                    onToggle={toggle}
                  />
                  {detailRow(row.key)}
                </Fragment>
              ))}
              <BoardPassiveRows stages={stages} locale={locale} />
            </tbody>
          </table>
        </section>
      </div>
    </PtFrame>
  )
}
