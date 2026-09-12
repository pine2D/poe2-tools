import type { Locale, PreviewName, PreviewSkill, PreviewSlot } from '@poe2-tools/build-core'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../components/Icon'
import type { TranslatedFile } from '../translate/runTranslation'
import { type FieldWithRows, slotLabel } from './fields'
import { collectMisses, domIdFor, jumpTo, type MissEntry, type PreviewSection } from './locate'
import { PairTable, type PreviewView } from './PairTable'
import type { PairRow } from './rows'
import { useHotkeys } from './useHotkeys'
import { useMissFilter } from './useMissFilter'

export interface PreviewProps {
  file: TranslatedFile
  fields: readonly FieldWithRows[]
  locale: Locale
  bilingual: boolean
  onDownload(): void
}

function nameText(name: PreviewName): string {
  return name.text ?? name.en ?? name.id
}

function CardCount({ rows }: { rows: readonly PairRow[] }) {
  const mods = rows.filter((row) => row.kind === 'mod')
  if (mods.length === 0) return null
  const hit = mods.filter((row) => row.status === 'translated').length
  return (
    <span className={hit < mods.length ? 'card__count card__count--short' : 'card__count'}>
      {hit} / {mods.length}
    </span>
  )
}

const SECTIONS: readonly { id: PreviewSection; label: string }[] = [
  { id: 'gear', label: '装备' },
  { id: 'skills', label: '技能' },
  { id: 'passives', label: '天赋' },
]
const ISSUE_LABEL = { mod: '词缀未命中', base: '基底名未收录', unique: '传奇名未收录' }

function hasText(entry: FieldWithRows | undefined): entry is FieldWithRows {
  return entry !== undefined && (entry.rows.length > 0 || entry.injected !== null)
}

function SlotCard(props: {
  slot: PreviewSlot
  entry: FieldWithRows
  locale: Locale
  bilingual: boolean
  view: PreviewView
}) {
  const { slot, entry, locale, bilingual, view } = props
  return (
    <article className={slot.uniqueName === null ? 'card' : 'card card--unique'}>
      <div
        className="card__head"
        id={domIdFor(`inventory_slots[${slot.rawIndex}].unique_name`)}
        tabIndex={-1}
      >
        <h3 title={slot.inventoryId}>{slotLabel(slot)}</h3>
        {slot.uniqueName !== null && (
          <>
            <span className="chip chip--unique">传奇</span>

            <span className="namepair">
              <span className="namepair__en" lang="en">
                {slot.uniqueName}
              </span>
              {slot.uniqueText === null ? (
                <span
                  className="namepair__zh namepair__zh--miss"
                  role="note"
                  aria-label="传奇名未收录"
                >
                  名称未收录
                </span>
              ) : (
                <span className="namepair__zh">{slot.uniqueText}</span>
              )}
            </span>
          </>
        )}
        {bilingual && <span className="chip chip--bi">双语</span>}
        <CardCount rows={entry.rows} />
      </div>
      {hasText(entry) && (
        <PairTable
          path={entry.entry.path}
          rows={entry.rows}
          injected={entry.injected}
          locale={locale}
          baseName={entry.entry.baseName}
          bilingual={bilingual}
          view={view}
          emptyText="这个槽位没有备注"
        />
      )}
    </article>
  )
}

function NamePair({ name, kind }: { name: PreviewName; kind: 'gem' | 'passive' }) {
  const zh = kind === 'gem' ? name.text : nameText(name)
  const missed = kind === 'gem' && name.text === null
  return (
    <span className="namepair">
      <span className="namepair__en" lang="en">
        {name.en ?? name.id}
      </span>
      {(kind === 'gem' || name.text !== null) && (
        <span
          className={[
            'namepair__zh',
            kind === 'gem' ? 'namepair__zh--gem' : '',
            missed ? 'namepair__zh--miss' : '',
          ]
            .filter((c) => c !== '')
            .join(' ')}
        >
          {zh ?? '未命中'}
        </span>
      )}
    </span>
  )
}

function levelRange(list: unknown, i: number): string | null {
  if (!Array.isArray(list)) return null
  const entry: unknown = list[i]
  if (entry === null || typeof entry !== 'object') return null
  const interval = (entry as { level_interval?: unknown }).level_interval
  if (!Array.isArray(interval)) return null
  const [from, to] = interval
  if (typeof from !== 'number' || typeof to !== 'number') return null
  return `Lv ${from}–${to}`
}

function SkillCard(props: {
  skill: PreviewSkill
  index: number
  fields: ReadonlyMap<string, FieldWithRows>
  levels: string | null
  locale: Locale
  bilingual: boolean
  view: PreviewView
}) {
  const { skill, index, fields, levels, locale, bilingual, view } = props
  const own = fields.get(`skills[${index}].additional_text`)
  return (
    <article className="card card--gem">
      <div className="card__head">
        <h3>
          <NamePair name={skill} kind="gem" />
        </h3>
        {bilingual && <span className="chip chip--bi">双语</span>}
        {own !== undefined && <CardCount rows={own.rows} />}
        {levels !== null && (
          <span className="card__id" lang="en">
            {levels}
          </span>
        )}
      </div>
      {hasText(own) && (
        <PairTable
          path={own.entry.path}
          rows={own.rows}
          injected={own.injected}
          locale={locale}
          baseName={own.entry.baseName}
          bilingual={bilingual}
          view={view}
          emptyText="这个宝石没有备注"
        />
      )}
      {skill.supports.length > 0 && (
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
                    injected={entry.injected}
                    locale={locale}
                    baseName={entry.entry.baseName}
                    bilingual={bilingual}
                    view={view}
                    emptyText="这个支援宝石没有备注"
                  />
                )}
              </li>
            )
          })}
        </ul>
      )}
    </article>
  )
}

export function Preview({ file, fields, locale, bilingual, onDownload }: PreviewProps) {
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
  const header = useRef<HTMLElement>(null)
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
  useEffect(() => {
    header.current?.scrollIntoView({ block: 'start' })
  }, [])
  const locate = useCallback((issue: MissEntry) => {
    if (issue.path === 'description') setDetailsOpen(true)
    else setSection(issue.section)
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
  const names = misses.filter((issue) => issue.kind !== 'mod').length
  const ascendancy = preview.ascendancy
  const pair = (entry: FieldWithRows, emptyText: string) => (
    <PairTable
      path={entry.entry.path}
      rows={entry.rows}
      injected={entry.injected}
      locale={locale}
      baseName={entry.entry.baseName}
      bilingual={bilingual}
      view={view}
      emptyText={emptyText}
    />
  )
  return (
    <div className="preview" lang={locale} data-view={view}>
      <header className="build-header" ref={header}>
        <div className="build-header__identity">
          <small>{file.name}</small>
          <h2>{input.name}</h2>
          {ascendancy !== null && (
            <p>
              {ascendancy.classText ?? ascendancy.classCode} · {ascendancy.text ?? ascendancy.code}
            </p>
          )}
        </div>
        <button type="button" className="cta" aria-label={`下载 ${file.name}`} onClick={onDownload}>
          <Icon name="download" />
          下载中文 .build
        </button>
      </header>
      <div className="review-summary">
        <span>
          <Icon name="check" size={14} />
          {report.modCandidates === 0
            ? '无编号词缀'
            : `词缀命中 ${report.modTranslated}/${report.modCandidates}`}
        </span>
        {misses.length > 0 ? (
          <button
            type="button"
            onClick={() => setReviewOpen((open) => !open)}
            aria-expanded={reviewOpen}
            aria-controls="review-list"
          >
            <Icon name="warning" size={14} />
            待核对 {misses.length}
            {names > 0 ? `（名称 ${names}）` : ''}
          </button>
        ) : (
          <span>暂无待核对项</span>
        )}
        <span className="muted">自由备注保留原文</span>
      </div>
      {(description !== undefined ||
        typeof input.author === 'string' ||
        typeof input.link === 'string') && (
        <details
          className="build-details"
          open={detailsOpen}
          onToggle={(event) => setDetailsOpen(event.currentTarget.open)}
        >
          <summary>构筑说明与来源</summary>
          {typeof input.author === 'string' && <p>作者：{input.author}</p>}
          {typeof input.link === 'string' && <p className="muted">来源：{input.link}</p>}
          {description !== undefined && (
            <article className="card">
              <div className="card__head">
                <h3>构筑说明</h3>
                <CardCount rows={description.rows} />
              </div>
              {pair(description, '没有构筑说明')}
            </article>
          )}
        </details>
      )}
      {misses.length > 0 && (
        <div className="review-list" id="review-list" hidden={!reviewOpen}>
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
                  className="misslist__go"
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
      <div className="preview-toolbar">
        <nav className="section-nav" aria-label="构筑内容">
          {SECTIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={section === item.id}
              onClick={() => setSection(item.id)}
            >
              {item.label}
              <span>{counts[item.id]}</span>
            </button>
          ))}
        </nav>
        <div className="preview-controls">
          {misses.length > 0 && (
            <button
              type="button"
              className="review-next"
              onClick={next}
              aria-keyshortcuts="n"
              aria-label="下一项待核对"
              title="下一项待核对（N）"
            >
              下一项 <kbd>N</kbd>
            </button>
          )}
          <button
            type="button"
            className="button"
            aria-label="仅看待核对"
            aria-pressed={only}
            aria-keyshortcuts="f"
            disabled={misses.length === 0}
            onClick={toggleFilter}
          >
            <Icon name="filter" size={14} />
            待核对 <kbd>F</kbd>
          </button>
          <div className="seg" role="radiogroup" aria-label="预览方式">
            {(
              [
                { value: 'compare', label: '中英对照' },
                { value: 'translated', label: '译文' },
              ] as const
            ).map((item) => (
              <label
                key={item.value}
                className={view === item.value ? 'seg__item seg__item--on' : 'seg__item'}
              >
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
      {section === 'gear' && (
        <div className="preview-columns" aria-hidden="true">
          {view === 'compare' && <span>原文 · EN</span>}
          <span>译文 · {locale === 'zh-CN' ? '简体中文' : '繁体中文'}</span>
        </div>
      )}
      <section
        className="preview__section"
        aria-label={SECTIONS.find((item) => item.id === section)?.label}
      >
        {visibleCounts[section] === 0 && (
          <p className="muted sec__empty">
            {only ? '这一区没有待核对项，可切换其他区块或关闭筛选。' : '这份构筑没有这类内容。'}
          </p>
        )}
        {section === 'gear' &&
          slots.map((slot) => {
            const entry = byPath.get(`inventory_slots[${slot.rawIndex}].additional_text`)
            return entry === undefined ? null : (
              <SlotCard
                key={slot.rawIndex}
                slot={slot}
                entry={entry}
                locale={locale}
                bilingual={bilingual}
                view={view}
              />
            )
          })}
        {section === 'skills' &&
          skills.map(({ skill, i }) => (
            <SkillCard
              key={`${skill.id}:${i}`}
              skill={skill}
              index={i}
              fields={byPath}
              levels={levelRange(input.skills, i)}
              locale={locale}
              bilingual={bilingual}
              view={view}
            />
          ))}
        {section === 'passives' && passives.length > 0 && (
          <article className="card">
            <ul className="passives">
              {passives.map(({ passive, i }) => {
                const entry = byPath.get(`passives[${i}].additional_text`)
                return (
                  <li
                    key={`${passive.id}:${i}`}
                    className={hasText(entry) ? undefined : 'passive--name-only'}
                  >
                    <NamePair name={passive} kind="passive" />
                    {hasText(entry) && pair(entry, '没有备注')}
                  </li>
                )
              })}
            </ul>
          </article>
        )}
      </section>
    </div>
  )
}
