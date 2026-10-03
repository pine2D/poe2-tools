// 阶段并排对照（2026-10-03 方案 §3.2–3.3；方向约定见 apps/site/.impeccable/surfaces/）：
// 一扇 pt-frame 是本状态唯一的框，框内是 L0 对照表：列 = 阶段，行 = 栏位 / 宝石 / 天赋；
// 列头所在的阶段带是唯一的金属注意力落点。点格子在该行下方展开该件的名称牌与中英对照；
// “逐项核对”进入单阶段的 Preview（N/F 快捷键、定位都在那里）。
import type { Locale } from '@poe2-tools/build-core'
import {
  type CSSProperties,
  Fragment,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Icon } from '../../../shared/components/Icon'
import { cx } from '../../../shared/components/Motif'
import { PtForgeButton } from '../../../shared/components/PtForgeButton'
import { PtFrame } from '../../../shared/components/PtFrame'
import type { FieldWithRows } from '../preview/fields'
import { collectMisses } from '../preview/locate'
import { spanText } from '../preview/markup'
import { levelRange } from '../preview/plate'
import { SkillCard } from '../preview/SkillCard'
import { SlotCard } from '../preview/SlotCard'
import {
  type Change,
  gearRows,
  missPrefixes,
  passiveSummary,
  type Series,
  skillRows,
  slotCellName,
} from './stages'

export interface StageBoardProps {
  series: Series
  allSeries: readonly Series[]
  fieldsById: ReadonlyMap<string, readonly FieldWithRows[]>
  locale: Locale
  bilingual: boolean
  onSeries(key: string): void
  onDownload(): void
  onReview(fileId: string): void
}

// “新”“换”有标记字与刻痕；“改”（同一件改了词缀或辅助）不加标记字，只在 aria 与铜色词缀数上体现
const MARK: Record<'added' | 'changed', { text: string; label: string }> = {
  added: { text: '新', label: '本阶段新增' },
  changed: { text: '换', label: '换了另一件' },
}
const PASSIVE_TOP = 8

type Focus =
  | { id: string; rowKey: string; fileId: string; title: string; kind: 'slot'; rawIndex: number }
  | { id: string; rowKey: string; fileId: string; title: string; kind: 'skill'; index: number }

function markOf(change: Change | null) {
  return change === 'added' || change === 'changed' ? MARK[change] : null
}

function suffixOf(change: Change | null, modded: string): string {
  const mark = markOf(change)
  if (mark !== null) return `（${mark.label}）`
  return change === 'modded' ? modded : ''
}

function modCount(entry: FieldWithRows | undefined): number {
  return entry?.rows.filter((row) => row.kind === 'mod').length ?? 0
}

function slotPath(rawIndex: number): string {
  return `inventory_slots[${rawIndex}].additional_text`
}

// 天赋点数相对前一阶段的增减：非负写“+d”，负数写数学负号“−”加绝对值
function passiveDelta(delta: number): string {
  return delta >= 0 ? `（+${delta}）` : `（−${-delta}）`
}

function MarkTag({ change }: { change: Change | null }) {
  const mark = markOf(change)
  if (mark === null) return null
  return (
    <span className="stageboard__mark" aria-hidden="true">
      {mark.text}
    </span>
  )
}

function NoneCell() {
  return (
    <span className="stageboard__none">
      <span aria-hidden="true">—</span>
      <span className="visually-hidden">本阶段无</span>
    </span>
  )
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
}: StageBoardProps) {
  const { stages } = series
  const frame = useRef<HTMLElement>(null)
  const detailTitle = useRef<HTMLHeadingElement>(null)
  const opener = useRef<HTMLButtonElement | null>(null)
  const ghost = useRef<HTMLDivElement>(null)
  const viewport = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLElement>(null)
  const table = useRef<HTMLTableElement>(null)
  const [focus, setFocus] = useState<Focus | null>(null)
  const [detailOpen, setDetailOpen] = useState(true)
  const [overflow, setOverflow] = useState(false)
  const [widths, setWidths] = useState<number[]>([])
  const gear = useMemo(() => gearRows(stages), [stages])
  const skills = useMemo(() => skillRows(stages), [stages])
  const fieldMaps = useMemo(
    () =>
      new Map(
        stages.map(({ file }) => [
          file.id,
          new Map((fieldsById.get(file.id) ?? []).map((item) => [item.entry.path, item])),
        ]),
      ),
    [stages, fieldsById],
  )
  const misses = useMemo(
    () =>
      new Map(
        stages.map(({ file }) => [
          file.id,
          collectMisses(fieldsById.get(file.id) ?? [], file.preview),
        ]),
      ),
    [stages, fieldsById],
  )
  const prefixes = useMemo(
    () => new Map([...misses].map(([id, list]) => [id, missPrefixes(list)])),
    [misses],
  )
  const totalMisses = [...misses.values()].reduce((sum, list) => sum + list.length, 0)
  // 导入后滚到主区框顶部，与 Preview 一致（scroll-margin-top 取 --main-pad-top）
  useEffect(() => {
    frame.current?.scrollIntoView({ block: 'start' })
  }, [])
  useEffect(() => {
    if (focus !== null) detailTitle.current?.focus()
  }, [focus])
  // 量列宽给吸顶阶段名条，按横向滚动位置写入左右缘阴影、滚动提示与阶段名条位移
  // biome-ignore lint/correctness/useExhaustiveDependencies: 换构筑或增减阶段时表格重排，需要立即重新量列宽（ResizeObserver 只在表格尺寸变化时触发）
  useLayoutEffect(() => {
    const sc = scroller.current
    const vp = viewport.current
    const tb = table.current
    const gh = ghost.current
    if (!sc || !vp || !tb || !gh) return
    const update = () => {
      const max = sc.scrollWidth - sc.clientWidth
      vp.dataset.start = String(sc.scrollLeft > 1)
      vp.dataset.end = String(sc.scrollLeft < max - 1)
      setOverflow(max > 1)
      gh.style.setProperty('--ghost-x', `${sc.scrollLeft}px`)
      const head = tb.querySelector('thead')?.getBoundingClientRect()
      gh.dataset.show = String(
        head !== undefined && head.bottom < 0 && tb.getBoundingClientRect().bottom > 96,
      )
    }
    const measure = () => {
      setWidths(
        // 用选择器而不是 tHead.rows：happy-dom 不实现 rows 集合
        [...tb.querySelectorAll('thead > tr:first-child > th')].map(
          (th) => th.getBoundingClientRect().width,
        ),
      )
      update()
    }
    // 浏览器对“部分可见”的焦点目标不滚动；按 scroll-padding / scroll-margin 滚到完整可见（WCAG 2.4.11）
    const onFocus = (event: FocusEvent) => {
      ;(event.target as Element)
        .closest('.stageboard__cell, .pt-btn')
        ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(tb)
    sc.addEventListener('scroll', update, { passive: true })
    sc.addEventListener('focusin', onFocus)
    window.addEventListener('scroll', update, { passive: true })
    measure()
    return () => {
      observer?.disconnect()
      sc.removeEventListener('scroll', update)
      sc.removeEventListener('focusin', onFocus)
      window.removeEventListener('scroll', update)
    }
  }, [stages])

  const toggle = (event: MouseEvent<HTMLButtonElement>, next: Focus) => {
    opener.current = event.currentTarget
    setDetailOpen(true)
    setFocus((current) => (current?.id === next.id ? null : next))
  }
  const collapse = () => {
    setFocus(null)
    opener.current?.focus()
  }
  const single = stages.length === 1 ? stages[0] : undefined
  const ascendancy = stages[0]?.file.preview.ascendancy ?? null
  const style = { '--stages': String(stages.length) } as CSSProperties

  let detail: ReactNode = null
  if (focus !== null) {
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
            onToggle={() => setDetailOpen((open) => !open)}
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
  }

  // 展开行紧跟被点的行，整行跨列；详情内容吸左，宽度等于表格可见宽度
  const expandRow = (rowKey: string) =>
    focus?.rowKey === rowKey && (
      <tr className="stageboard__expand">
        <td colSpan={stages.length + 1}>
          <section
            id="stage-detail"
            className="stageboard__detail"
            aria-labelledby="stage-detail-title"
            lang={locale}
          >
            <div className="stageboard__detail-head">
              <h3 id="stage-detail-title" ref={detailTitle} tabIndex={-1}>
                {focus.title}
              </h3>
              <button
                type="button"
                className="pt-btn pt-btn--quiet pt-btn--xs"
                aria-label="收起详情"
                onClick={collapse}
              >
                收起
              </button>
            </div>
            {detail}
          </section>
        </td>
      </tr>
    )

  return (
    <PtFrame
      ref={frame}
      className="app__build-frame app__build-frame--board"
      aria-labelledby="board-title"
      titlebar={{ title: series.title, id: 'board-title', fullText: series.title, userText: true }}
    >
      <div className="stageboard__head">
        <ul className="stageboard__facts">
          {ascendancy !== null && (
            <li
              lang={locale}
            >{`${ascendancy.classText ?? ascendancy.classCode} · ${ascendancy.text ?? ascendancy.code}`}</li>
          )}
          {series.author !== null && (
            <li>
              作者 <b data-user-text="">{series.author}</b>
            </li>
          )}
          <li>
            <b className="pt-num">{stages.length}</b> 个阶段
          </li>
          <li>
            {totalMisses > 0 ? (
              <span className="stageboard__miss">
                <Icon name="warning" size={16} />
                待核对 <b className="pt-num">{totalMisses}</b>
              </span>
            ) : (
              '暂无待核对项'
            )}
          </li>
          <li className="stageboard__hint">点格子看中英词缀；“逐项核对”可定位每一处待核对</li>
        </ul>
        <PtForgeButton
          aria-label={
            single === undefined ? `打包下载 ${stages.length} 个阶段` : `下载 ${single.file.name}`
          }
          onClick={onDownload}
        >
          <Icon name="download" size={18} />
          <span>
            下载中文 <span className="pt-ext">.build</span>
          </span>
        </PtForgeButton>
      </div>
      {allSeries.length > 1 && (
        <div className="pt-seg stageboard__switch" role="radiogroup" aria-label="切换构筑">
          {allSeries.map((item) => (
            <label key={item.key} className="pt-seg__item">
              <input
                type="radio"
                className="visually-hidden"
                name="stage-series"
                checked={item.key === series.key}
                onChange={() => onSeries(item.key)}
              />
              {item.title}
            </label>
          ))}
        </div>
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
            <thead>
              <tr>
                <td className="stageboard__corner" rowSpan={2} />
                {stages.map((stage) => (
                  <th key={stage.file.id} scope="col" className="stageboard__stage">
                    <span className="stageboard__stage-name pt-stagehead" data-user-text="">
                      {stage.label}
                    </span>
                  </th>
                ))}
              </tr>
              <tr>
                {stages.map((stage, column) => {
                  const count = stage.file.preview.passives.length
                  const previous =
                    column > 0 ? stages[column - 1]?.file.preview.passives.length : undefined
                  const missCount = misses.get(stage.file.id)?.length ?? 0
                  const description = fieldMaps.get(stage.file.id)?.get('description')
                  const note =
                    description?.rows.map((row) => spanText(row.zh ?? row.en)).join(' ') ?? ''
                  return (
                    <td key={stage.file.id} className="stageboard__stage-info">
                      <span className="stageboard__stage-meta">
                        <span>
                          天赋 {count} 点
                          {previous === undefined ? '' : passiveDelta(count - previous)}
                        </span>
                        {missCount > 0 && (
                          <span className="stageboard__miss">待核对 {missCount}</span>
                        )}
                      </span>
                      {note !== '' && (
                        <p className="stageboard__note" title={note}>
                          {note}
                        </p>
                      )}
                      <button
                        type="button"
                        className="pt-btn pt-btn--quiet pt-btn--xs"
                        aria-label={`逐项核对 ${stage.label}`}
                        onClick={() => onReview(stage.file.id)}
                      >
                        逐项核对
                      </button>
                    </td>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {gear.length > 0 && (
                <tr className="stageboard__section">
                  <th scope="rowgroup" colSpan={stages.length + 1}>
                    <span className="stageboard__section-label">装备</span>
                  </th>
                </tr>
              )}
              {gear.map((row) => (
                <Fragment key={row.key}>
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
                        prefixes
                          .get(stage.file.id)
                          ?.has(`inventory_slots[${cell.slot.rawIndex}]`) === true
                      let count: ReactNode = null
                      if (cell.change === 'modded') {
                        const prevCell = row.cells[column - 1]
                        const prevStage = stages[column - 1]
                        const prevMods =
                          prevCell != null && prevStage !== undefined
                            ? modCount(
                                fieldMaps
                                  .get(prevStage.file.id)
                                  ?.get(slotPath(prevCell.slot.rawIndex)),
                              )
                            : 0
                        count = (
                          <span className="stageboard__delta">
                            {prevMods === mods
                              ? mods === 0
                                ? '已改'
                                : `词缀 ${mods}（已改）`
                              : `词缀 ${prevMods}→${mods}`}
                          </span>
                        )
                      } else if (mods > 0) {
                        count = <span className="stageboard__count">{`词缀 ${mods}`}</span>
                      }
                      const id = `${stage.file.id}:slot:${cell.slot.rawIndex}`
                      return (
                        <td key={stage.file.id} data-change={cell.change ?? undefined}>
                          <button
                            type="button"
                            className={cx(
                              'stageboard__cell',
                              cell.change !== null &&
                                cell.change !== 'same' &&
                                `stageboard__cell--${cell.change}`,
                              missed && 'stageboard__cell--miss',
                            )}
                            aria-expanded={focus?.id === id}
                            aria-controls={focus?.id === id ? 'stage-detail' : undefined}
                            aria-label={`${stage.label} · ${row.label}：${name.zh}${suffixOf(cell.change, '（词缀有变化）')}${missed ? '，有待核对' : ''}`}
                            onClick={(event) =>
                              toggle(event, {
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
                              <span
                                className="stageboard__zh"
                                lang={name.translated ? locale : 'en'}
                              >
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
                                <span
                                  className={cx(
                                    'stageboard__meta',
                                    missed && 'stageboard__meta--miss',
                                  )}
                                >
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
                  {expandRow(row.key)}
                </Fragment>
              ))}
              {skills.length > 0 && (
                <tr className="stageboard__section">
                  <th scope="rowgroup" colSpan={stages.length + 1}>
                    <span className="stageboard__section-label">技能</span>
                  </th>
                </tr>
              )}
              {skills.map((row) => {
                const rowName = row.name.text ?? row.name.en ?? row.name.id
                return (
                  <Fragment key={row.key}>
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
                        const names = cell.skill.supports.map((s) => s.text ?? s.en ?? s.id)
                        const summary =
                          names.length > 0
                            ? `辅助 ${names.length}（${names.join('、')}）`
                            : '无辅助'
                        const missed =
                          prefixes.get(stage.file.id)?.has(`skills[${cell.index}]`) === true
                        const id = `${stage.file.id}:skill:${cell.index}`
                        // 技能行按宝石对齐，主宝石不变，只会是 新 / 改 / 同
                        return (
                          <td key={stage.file.id} data-change={cell.change ?? undefined}>
                            <button
                              type="button"
                              className={cx(
                                'stageboard__cell',
                                cell.change !== null &&
                                  cell.change !== 'same' &&
                                  `stageboard__cell--${cell.change}`,
                                missed && 'stageboard__cell--miss',
                              )}
                              aria-expanded={focus?.id === id}
                              aria-controls={focus?.id === id ? 'stage-detail' : undefined}
                              aria-label={`${stage.label} · ${rowName}：${summary}${suffixOf(cell.change, '（辅助有变化）')}${missed ? '，有待核对' : ''}`}
                              onClick={(event) =>
                                toggle(event, {
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
                              {missed && (
                                <span className="stageboard__meta stageboard__meta--miss">
                                  待核对
                                </span>
                              )}
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                    {expandRow(row.key)}
                  </Fragment>
                )
              })}
              {stages.some((stage) => stage.file.preview.passives.length > 0) && (
                <>
                  <tr className="stageboard__section">
                    <th scope="rowgroup" colSpan={stages.length + 1}>
                      <span className="stageboard__section-label">天赋</span>
                    </th>
                  </tr>
                  <tr className="stageboard__row">
                    <th scope="row">构成</th>
                    {stages.map((stage) => {
                      const summary = passiveSummary(stage.file.preview.passives)
                      const rest = summary.length - PASSIVE_TOP
                      return (
                        <td key={stage.file.id}>
                          <ul className="stageboard__passives">
                            {summary.slice(0, PASSIVE_TOP).map(({ name, count }) => (
                              <li key={name.text ?? name.en ?? name.id}>
                                <span lang={name.text === null ? 'en' : locale}>
                                  {name.text ?? name.en ?? name.id}
                                </span>
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
              )}
            </tbody>
          </table>
        </section>
      </div>
    </PtFrame>
  )
}
