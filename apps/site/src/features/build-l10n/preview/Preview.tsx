// 构筑主区（spec §6.4.2）：一扇 pt-frame，标题栏是构筑名；框内依次为信息行、待核对清单、构筑说明与来源、
// 吸顶页签行（金属页签 + 工具组）、视觉隐藏的列说明与 tabpanel。定位锚点、N/F 快捷键与筛选逻辑沿用改版前。
import type { Locale } from '@poe2-tools/build-core'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../../../shared/components/Icon'
import { PtForgeButton } from '../../../shared/components/PtForgeButton'
import { PtFrame } from '../../../shared/components/PtFrame'
import { PtPanel } from '../../../shared/components/PtPanel'
import { type PtTab, PtTabs, ptTabId } from '../../../shared/components/PtTabs'
import type { TranslatedFile } from '../translate/runTranslation'
import type { FieldWithRows } from './fields'
import { collectMisses, jumpTo, type MissEntry, type PreviewSection } from './locate'
import { NamePair } from './NamePair'
import { PairTable, type PreviewView, pairCaption } from './PairTable'
import { hasText, levelRange } from './plate'
import { isMissedRow } from './rows'
import { SkillCard } from './SkillCard'
import { SlotCard } from './SlotCard'
import { TooltipCard } from './TooltipCard'
import { useHotkeys } from './useHotkeys'
import { useMissFilter } from './useMissFilter'

export interface PreviewProps {
  file: TranslatedFile
  fields: readonly FieldWithRows[]
  locale: Locale
  bilingual: boolean
  onDownload(): void
  /** 从阶段看板进入时提供：回到看板 */
  onBack?: (() => void) | undefined
}

const SECTIONS: readonly PreviewSection[] = ['gear', 'skills', 'passives']
const SECTION_LABEL: Record<PreviewSection, string> = {
  gear: '装备',
  skills: '技能',
  passives: '天赋',
}
const ISSUE_LABEL = { mod: '词缀未命中', base: '基底名未收录', unique: '传奇名未收录' }
const VIEWS = [
  { value: 'compare', label: '中英对照' },
  { value: 'translated', label: '译文' },
] as const
// locate() 指向装备字段的行时，要先展开对应的 collapsed 条目再聚焦（spec §6.4.3）
const SLOT_FIELD = /^inventory_slots\[(\d+)\]\.additional_text$/

/** collapsed 的对照区默认折叠；字段里有未命中行时默认展开（spec §6.4.3） */
function openByDefault(entry: FieldWithRows): boolean {
  return entry.rows.some((row) => isMissedRow(row, entry.entry.baseName))
}

export function Preview({ file, fields, locale, bilingual, onDownload, onBack }: PreviewProps) {
  const byPath = useMemo(() => new Map(fields.map((item) => [item.entry.path, item])), [fields])
  const misses = useMemo(() => collectMisses(fields, file.preview), [fields, file.preview])
  const { preview, report, input } = file
  const [section, setSection] = useState<PreviewSection>(
    preview.slots.length > 0
      ? 'gear'
      : preview.skills.length > 0
        ? 'skills'
        : preview.passives.length > 0
          ? 'passives'
          : 'gear',
  )
  const [view, setView] = useState<PreviewView>('compare')
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [pending, setPending] = useState<{ domId: string } | null>(null)
  // collapsed 装备的手动展开/收起；没有记录时按“有未命中行即默认展开”
  const [opened, setOpened] = useState<ReadonlyMap<number, boolean>>(() => new Map())
  const frame = useRef<HTMLElement>(null)
  const filter = useMissFilter(misses.length > 0)
  const only = filter.only && misses.length > 0
  const cursor = useRef(0)
  // biome-ignore lint/correctness/useExhaustiveDependencies: 清单变化时重置快捷键游标
  useEffect(() => {
    cursor.current = 0
  }, [misses])
  useLayoutEffect(() => {
    if (pending !== null) jumpTo(pending.domId)
  }, [pending])
  // 导入后自动滚到主区 pt-frame 顶部；scroll-margin-top 取 --main-pad-top，框顶角饰完整可见（spec §6.4.2）
  useEffect(() => {
    frame.current?.scrollIntoView({ block: 'start' })
  }, [])
  const locate = useCallback((issue: MissEntry) => {
    if (issue.path === 'description') setDetailsOpen(true)
    else setSection(issue.section)
    const slot = SLOT_FIELD.exec(issue.path)
    if (slot !== null) {
      const index = Number(slot[1])
      setOpened((current) =>
        current.get(index) === true ? current : new Map(current).set(index, true),
      )
    }
    setPending({ domId: issue.domId })
  }, [])
  const next = useCallback(() => {
    if (misses.length === 0) return
    const issue = misses[cursor.current % misses.length]
    cursor.current = (cursor.current + 1) % misses.length
    if (issue !== undefined) locate(issue)
  }, [misses, locate])
  const toggleFilter = useCallback(() => {
    if (!filter.only) {
      const first = misses.find((issue) => issue.path !== 'description')
      if (first !== undefined) setSection(first.section)
      if (misses.some((issue) => issue.path === 'description')) setDetailsOpen(true)
    }
    filter.toggle()
  }, [filter, misses])
  useHotkeys({ next, toggleFilter })
  const hasIssue = (prefix: string) => misses.some((issue) => issue.path.startsWith(prefix))
  const slots = preview.slots.filter(
    (slot) => !only || hasIssue(`inventory_slots[${slot.rawIndex}].`),
  )
  const skills = preview.skills
    .map((skill, i) => ({ skill, i }))
    .filter(({ i }) => !only || hasIssue(`skills[${i}].`))
  const passives = preview.passives
    .map((passive, i) => ({ passive, i }))
    .filter(({ i }) => !only || hasIssue(`passives[${i}].`))
  const description = byPath.get('description')
  const counts = {
    gear: preview.slots.length,
    skills: preview.skills.length,
    passives: preview.passives.length,
  }
  const visibleCounts = { gear: slots.length, skills: skills.length, passives: passives.length }
  const tabs = SECTIONS.map(
    (key): PtTab<PreviewSection> => ({ key, label: SECTION_LABEL[key], count: counts[key] }),
  )
  const names = misses.filter((issue) => issue.kind !== 'mod').length
  const ascendancy = preview.ascendancy
  const title = typeof input.name === 'string' && input.name !== '' ? input.name : file.name
  const hasDetails =
    description !== undefined || typeof input.author === 'string' || typeof input.link === 'string'
  const slotEntries = slots.flatMap((slot) => {
    const entry = byPath.get(`inventory_slots[${slot.rawIndex}].additional_text`)
    return entry === undefined ? [] : [{ slot, entry }]
  })
  return (
    // 不在主区框上挂 lang：页签、下载按钮、标题栏是站点固定文案，繁体模式下也用 SC 衬线栈（spec §4.4）；
    // lang 只挂在承载词典内容的升华、待核对清单、构筑说明区与 tabpanel 上
    <PtFrame
      ref={frame}
      className="app__build-frame"
      aria-labelledby="build-title"
      titlebar={{ title, id: 'build-title', fullText: title, userText: true }}
    >
      <div className="whead">
        <div className="whead-l">
          {onBack !== undefined && (
            <button
              type="button"
              className="pt-btn pt-btn--quiet pt-btn--xs whead-back"
              onClick={onBack}
            >
              <Icon name="chevron-down" size={14} className="whead-back__icon" />
              返回阶段对照
            </button>
          )}
          <span className="whead-file">{file.name}</span>
          {ascendancy !== null && (
            <span className="whead-class" lang={locale}>
              {`${ascendancy.classText ?? ascendancy.classCode} · ${ascendancy.text ?? ascendancy.code}`}
            </span>
          )}
          <ul className="stats">
            <li className="stats__ok">
              <Icon name="check" size={16} />
              <span>
                {report.modCandidates === 0 ? (
                  '无编号词缀'
                ) : (
                  <>
                    词缀命中{' '}
                    <b className="pt-num">
                      {report.modTranslated}/{report.modCandidates}
                    </b>
                  </>
                )}
              </span>
            </li>
            <li>
              {misses.length > 0 ? (
                <button
                  type="button"
                  className="stats__miss"
                  onClick={() => setReviewOpen((open) => !open)}
                  aria-expanded={reviewOpen}
                  aria-controls="review-list"
                >
                  <Icon name="warning" size={16} />
                  待核对 {misses.length}
                  {names > 0 ? `（名称 ${names}）` : ''}
                  <Icon name="chevron-down" size={14} className="stats__chev" />
                </button>
              ) : (
                <span>暂无待核对项</span>
              )}
            </li>
            <li className="stats__note">自由备注保留原文</li>
          </ul>
        </div>
        <div className="whead-r">
          <PtForgeButton aria-label={`下载 ${file.name}`} onClick={onDownload}>
            <Icon name="download" size={18} />
            <span>
              下载中文 <span className="pt-ext">.build</span>
            </span>
          </PtForgeButton>
          {hasDetails && (
            <button
              type="button"
              className="details-toggle"
              aria-expanded={detailsOpen}
              aria-controls="build-details"
              onClick={() => setDetailsOpen((open) => !open)}
            >
              构筑说明与来源
            </button>
          )}
        </div>
      </div>
      {misses.length > 0 && (
        <div
          className="review-list pt-l0-panel"
          id="review-list"
          lang={locale}
          hidden={!reviewOpen}
        >
          <p>未收录的名称与词缀保留原文，不计入已翻译内容。</p>
          <ul className="misslist">
            {misses.map((issue) => (
              <li key={issue.domId}>
                <span className="misslist__where">
                  {issue.where}
                  <small>{ISSUE_LABEL[issue.kind]}</small>
                </span>
                <span className="misslist__text" lang="en">
                  {issue.text}
                </span>
                <button
                  type="button"
                  className="pt-btn pt-btn--quiet pt-btn--sm misslist__go"
                  aria-label={`定位到 ${issue.where}`}
                  onClick={() => locate(issue)}
                >
                  定位
                  <Icon name="locate" size={12} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {hasDetails && (
        <section
          className="build-details"
          id="build-details"
          lang={locale}
          aria-label="构筑说明与来源"
          hidden={!detailsOpen}
        >
          {typeof input.author === 'string' && <p>作者：{input.author}</p>}
          {typeof input.link === 'string' && <p>来源：{input.link}</p>}
          {description !== undefined && (
            <PtPanel as="article" variant="card">
              <h3>构筑说明</h3>
              <PairTable
                path={description.entry.path}
                rows={description.rows}
                locale={locale}
                baseName={description.entry.baseName}
                bilingual={bilingual}
                view={view}
              />
            </PtPanel>
          )}
        </section>
      )}
      <div className="pt-tabs-row pt-tabs-row--sticky">
        <PtTabs
          tabs={tabs}
          selected={section}
          onSelect={(key) => setSection(key)}
          label="构筑内容"
          panelId="build-tabpanel"
        />
        <div className="pt-tabs-row__tools">
          {misses.length > 0 && (
            <button
              type="button"
              className="pt-btn pt-btn--quiet pt-btn--sm"
              onClick={next}
              aria-keyshortcuts="n"
              aria-label="下一项待核对"
              title="下一项待核对（N）"
            >
              下一项 <kbd className="pt-kbd">N</kbd>
            </button>
          )}
          <button
            type="button"
            className="pt-btn pt-btn--quiet pt-btn--sm"
            aria-label="仅看待核对"
            aria-pressed={only}
            aria-keyshortcuts="f"
            disabled={misses.length === 0}
            onClick={toggleFilter}
          >
            <Icon name="filter" size={18} />
            <span>
              <span className="pt-wide-only">仅看</span>待核对
            </span>{' '}
            <kbd className="pt-kbd">F</kbd>
          </button>
          <div className="pt-seg" role="radiogroup" aria-label="预览方式">
            {VIEWS.map((item) => (
              <label key={item.value} className="pt-seg__item">
                <input
                  type="radio"
                  className="visually-hidden"
                  name="preview-view"
                  checked={view === item.value}
                  onChange={() => setView(item.value)}
                />
                {item.label}
              </label>
            ))}
          </div>
        </div>
      </div>
      {section === 'gear' && <p className="visually-hidden">{pairCaption(view, locale)}</p>}
      <div
        id="build-tabpanel"
        role="tabpanel"
        aria-labelledby={ptTabId(section)}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: ARIA tabs 模式要求 tabpanel 可聚焦（spec §5.7）
        tabIndex={0}
        lang={locale}
      >
        {visibleCounts[section] === 0 && (
          <p className="app__tab-empty">
            {only ? '这一区没有待核对项，可切换其他区块或关闭筛选。' : '这份构筑没有这类内容。'}
          </p>
        )}
        {section === 'gear' && view === 'compare' && slotEntries.length > 0 && (
          <div className="pt-items">
            {slotEntries.map(({ slot, entry }) => (
              <SlotCard
                key={slot.rawIndex}
                slot={slot}
                entry={entry}
                level={levelRange(input.inventory_slots, slot.rawIndex)}
                locale={locale}
                bilingual={bilingual}
                open={opened.get(slot.rawIndex) ?? openByDefault(entry)}
                onToggle={() =>
                  setOpened((current) =>
                    new Map(current).set(
                      slot.rawIndex,
                      !(current.get(slot.rawIndex) ?? openByDefault(entry)),
                    ),
                  )
                }
              />
            ))}
          </div>
        )}
        {section === 'gear' && view === 'translated' && slotEntries.length > 0 && (
          <div className="pt-tooltip-wrap">
            <p className="pt-tooltip-note">
              只读预览：中文词缀用提亮的词缀蓝；
              <span className="pt-tooltip-note__tail">核对请切回“中英对照”</span>
            </p>
            <div className="pt-tooltips">
              {slotEntries.map(({ slot, entry }) => (
                <TooltipCard
                  key={slot.rawIndex}
                  slot={slot}
                  entry={entry}
                  level={levelRange(input.inventory_slots, slot.rawIndex)}
                  locale={locale}
                  bilingual={bilingual}
                />
              ))}
            </div>
          </div>
        )}
        {section === 'skills' && skills.length > 0 && (
          <div className="pt-items">
            {skills.map(({ skill, i }) => (
              <SkillCard
                key={`${skill.id}:${i}`}
                skill={skill}
                index={i}
                fields={byPath}
                level={levelRange(input.skills, i)}
                locale={locale}
                bilingual={bilingual}
                view={view}
              />
            ))}
          </div>
        )}
        {section === 'passives' && passives.length > 0 && (
          <div className="pt-items">
            <PtPanel as="article" variant="card">
              <ul className="passives">
                {passives.map(({ passive, i }) => {
                  const entry = byPath.get(`passives[${i}].additional_text`)
                  const noted = hasText(entry)
                  return (
                    <li
                      key={`${passive.id}:${i}`}
                      className={noted ? undefined : 'passive--name-only'}
                    >
                      <NamePair name={passive} kind="passive" />
                      {noted && (
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
            </PtPanel>
          </div>
        )}
      </div>
    </PtFrame>
  )
}
