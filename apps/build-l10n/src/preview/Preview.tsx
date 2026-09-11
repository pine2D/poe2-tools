import type { Locale, PreviewName, PreviewSkill, PreviewSlot } from '@poe2-tools/build-core'
import { type ReactNode, useMemo } from 'react'
import { CoverageMeter } from '../components/CoverageMeter'
import { Icon } from '../components/Icon'
import type { TranslatedFile } from '../translate/runTranslation'
import { buildFieldRows, type FieldWithRows, slotLabel } from './fields'
import { collectMisses, jumpTo, type MissEntry, meterCells } from './locate'
// import 顺序按 Biome 的 organizeImports（不区分大小写的路径字典序）：
// fields < locate < PairTable < rows。写错顺序 `biome check .` 会直接报错。
import { PairTable } from './PairTable'
import type { PairRow } from './rows'
import { type MissFilter, useMissFilter } from './useMissFilter'

export interface PreviewProps {
  file: TranslatedFile
  locale: Locale
  bilingual: boolean
  /** 概览卡顶部「下载此文件」的动作 */
  onDownload(): void
}

function nameText(name: PreviewName): string {
  return name.text ?? name.en ?? name.id
}

// 每张卡右上角的局部计数：分母全是个位数（报告 §3.4 实测单字段最多 7 条），天然好读
function modCount(rows: readonly PairRow[]): { hit: number; total: number } {
  const mods = rows.filter((row) => row.kind === 'mod')
  return { hit: mods.filter((row) => row.status === 'translated').length, total: mods.length }
}

function CardCount({ rows }: { rows: readonly PairRow[] }) {
  const { hit, total } = modCount(rows)
  if (total === 0) return null
  const short = hit < total
  return (
    <span className={short ? 'card__count card__count--short' : 'card__count'}>
      {short && <Icon name="warning" size={12} />}
      {hit} / {total}
    </span>
  )
}

// 「这张卡里有没有未命中」——判据与概览的「N 处未命中」、清单、轨上的缺口完全同源：
// 只算编号行未命中。基底名未收录是另一套口径（2b 审查 I-1 的裁定），不进筛选，
// 否则屏幕上会同时出现两个不一样的「未命中」数。
function hasMiss(entry: FieldWithRows | undefined): boolean {
  // `?? false` 而不是 `entry !== undefined &&`：后者被 Biome 的 useOptionalChain 判为
  // 可简化（1 warning，仓库要求 0）；可选链本身返回 boolean | undefined，得兜一个 false
  return entry?.rows.some((row) => row.status === 'untranslated') ?? false
}

// 区块空态：筛选开着的时候，「没有装备槽位」这句话是错的，得说清是筛掉了
function SectionEmpty({ filtered, text }: { filtered: boolean; text: string }) {
  return <p className="muted sec__empty">{filtered ? '这一区没有未命中' : text}</p>
}

function Section(props: { eyebrow: string; title: string; count?: number; children: ReactNode }) {
  const { eyebrow, title, count, children } = props
  return (
    <section className="preview__section">
      <span className="eyebrow sec__eyebrow">{eyebrow}</span>
      <div className="sec__head">
        <h2>{title}</h2>
        {count !== undefined && <span className="sec__count">· {count}</span>}
      </div>
      <span className="sec__rule" />
      {children}
    </section>
  )
}

function Overview(props: {
  file: TranslatedFile
  fields: readonly FieldWithRows[]
  misses: readonly MissEntry[]
  filter: MissFilter
  onDownload(): void
}) {
  const { file, fields, misses, filter, onDownload } = props
  const { input, report, preview, rate, name } = file
  const ascendancy = preview.ascendancy
  const cells = meterCells(fields)
  const percent = rate === null ? null : Math.round(rate * 100)
  const first = misses[0]
  return (
    <section className="ov">
      {/* 全站唯一带四角刻痕的卡片，配额已用尽，别的地方不许再加 */}
      <span className="ov__corner ov__corner--1" />
      <span className="ov__corner ov__corner--2" />
      <span className="ov__corner ov__corner--3" />
      <span className="ov__corner ov__corner--4" />
      <div className="ov__act">
        <button type="button" className="cta" aria-label={`下载 ${name}`} onClick={onDownload}>
          <Icon name="download" />
          下载此文件
        </button>
        <p className="ov__hint">
          <Icon name="info" size={13} />
          放进 Build Planner 目录，同名替换即可
        </p>
      </div>
      <div className="cov">
        <div>
          <p className="cov__lab">覆盖率</p>
          <p className={percent === 100 ? 'cov__num cov__num--full' : 'cov__num'}>
            {percent === null ? '—' : percent}
            {percent !== null && <small>%</small>}
          </p>
          <p className="cov__frac">{`命中 ${report.modTranslated} / ${report.modCandidates} 条编号行`}</p>
        </div>
        <div className="cov__meterwrap">
          <CoverageMeter cells={cells} onJump={jumpTo} />
          <p className="cov__legend">
            <span>
              <span className="swatch" />
              一格 = 一条编号行 · 实心为命中
            </span>
            <span>
              <span className="swatch swatch--miss" />
              缺口为未命中
            </span>
          </p>
        </div>
        <div className="cov__jump">
          {first === undefined ? (
            <span className="cov__allhit">
              <Icon name="check" size={15} />
              编号行全部命中
            </span>
          ) : (
            <>
              <span className="cov__missnum">
                <Icon name="warning" size={15} />
                {`${misses.length} 处未命中`}
              </span>
              <button
                type="button"
                className="button"
                aria-label="跳到第一处未命中"
                aria-keyshortcuts="n"
                onClick={() => jumpTo(first.domId)}
              >
                <Icon name="arrow-down" size={13} />
                跳到第一处
              </button>
            </>
          )}
          {/* 开关在没有未命中时禁用而不是隐藏：位置固定下来，用户不用重新找它。
              可访问名走 aria-label 而不是按钮文字——Task 5 会往里塞一枚 <kbd>，
              不定死名字的话可访问名会变成「仅看未命中 F」，读屏与测试都难用。 */}
          <button
            type="button"
            className={filter.only ? 'button ov__filter ov__filter--on' : 'button ov__filter'}
            aria-label="仅看未命中"
            aria-pressed={filter.only}
            aria-keyshortcuts="f"
            disabled={misses.length === 0}
            onClick={filter.toggle}
          >
            <Icon name="filter" size={13} />
            仅看未命中
          </button>
        </div>
      </div>
      <span className="ov__rule" />
      <dl className="meta">
        <dt>构筑</dt>
        <dd>{typeof input.name === 'string' ? input.name : '—'}</dd>
        <dt>升华</dt>
        <dd className="meta__asc">
          {ascendancy === null
            ? '—'
            : `${ascendancy.classText ?? ascendancy.classCode} · ${ascendancy.text ?? ascendancy.code}`}
        </dd>
        <dt>文件</dt>
        <dd className="meta__mono">{name}</dd>
      </dl>
      {misses.length > 0 && (
        <ul className="misslist">
          {misses.map((miss) => (
            <li key={miss.domId}>
              <span className="misslist__where">{miss.where}</span>
              <code className="misslist__text" title={miss.path}>
                {miss.text}
              </code>
              <button
                type="button"
                className="misslist__go"
                aria-label={`定位到 ${miss.where}`}
                onClick={() => jumpTo(miss.domId)}
              >
                定位
                <Icon name="locate" size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// 槽位卡：卡头 = 中文槽位名 + 稀有度标签 + 编号行计数 + 右侧 inventory_id
function SlotCard(props: {
  slot: PreviewSlot
  entry: FieldWithRows
  locale: Locale
  bilingual: boolean
}) {
  const { slot, entry, locale, bilingual } = props
  return (
    <article className={slot.uniqueName === null ? 'card' : 'card card--unique'}>
      <div className="card__head">
        <h3>{slotLabel(slot)}</h3>
        {slot.uniqueName !== null && (
          <>
            <span className="chip chip--unique">传奇</span>
            {/* 传奇名的卡头对照：C-1 修复——只有 unique_name、没有 additional_text 的槽位
                此前预览里连英文名都不出现；命中显示中文译名，未命中保留英文名并用
                role="note" + aria-label 标出（非颜色线索），不进覆盖率分母，只做卡头标记 */}
            <span className="namepair">
              <span className="namepair__en" lang="en">
                {slot.uniqueName}
              </span>
              {slot.uniqueText === null ? (
                <span className="namepair__zh namepair__zh--miss" role="note" aria-label="未命中">
                  未命中
                </span>
              ) : (
                <span className="namepair__zh">{slot.uniqueText}</span>
              )}
            </span>
          </>
        )}
        {bilingual && <span className="chip chip--bi">双语</span>}
        <CardCount rows={entry.rows} />
        <span className="card__id" lang="en">
          {slot.inventoryId}
        </span>
      </div>
      <PairTable
        path={entry.entry.path}
        rows={entry.rows}
        injected={entry.injected}
        locale={locale}
        baseName={entry.entry.baseName}
        bilingual={bilingual}
        emptyText="这个槽位没有备注"
      />
    </article>
  )
}

// 宝石名与天赋名的两种口径**必须**分开，别图省事合并：
// 宝石没命中词典时中文位显示「未命中」（词典该收而没收，是个待办）；
// 天赋没命中时中文位回落成 id（天赋词典是灰区表，缺项是常态，显示 id 至少还能对上游戏）。
// 合并成一个 nameText() 会让未命中的宝石在英文位与中文位显示同一个 id，
// 测试里 getByText('Metadata/Items/Gems/SupportGemSearingFlameTwo') 会因为一名两指而报错。
function NamePair({ name, kind }: { name: PreviewName; kind: 'gem' | 'passive' }) {
  const zh = kind === 'gem' ? name.text : nameText(name)
  const missed = kind === 'gem' && name.text === null
  return (
    <span className="namepair">
      <span className="namepair__en" lang="en">
        {name.en ?? name.id}
      </span>
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
    </span>
  )
}

// level_interval 是 .build 里既有的字段（rich.build 的 skills[0] 是 [52, 100]），
// mockup 用它填了宝石卡头的第三段。取不到就不渲染，卡头右端留空。
// 它是「数字–数字」，前后没有字母，走等宽体的 .card__id 不会有 1/I 混淆问题。
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
}) {
  const { skill, index, fields, levels, locale, bilingual } = props
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
      {own !== undefined && (
        <PairTable
          path={own.entry.path}
          rows={own.rows}
          injected={own.injected}
          locale={locale}
          baseName={own.entry.baseName}
          bilingual={bilingual}
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
                {entry !== undefined && (
                  <PairTable
                    path={entry.entry.path}
                    rows={entry.rows}
                    injected={entry.injected}
                    locale={locale}
                    baseName={entry.entry.baseName}
                    bilingual={bilingual}
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

export function Preview({ file, locale, bilingual, onDownload }: PreviewProps) {
  const fields = useMemo(() => buildFieldRows(file, bilingual), [file, bilingual])
  const byPath = useMemo(() => new Map(fields.map((item) => [item.entry.path, item])), [fields])
  const misses = useMemo(() => collectMisses(fields), [fields])
  const filter = useMissFilter(misses.length > 0)
  const { preview } = file
  const description = byPath.get('description')
  const only = filter.only
  // 筛选按卡过滤：留下的卡完整显示所有行——判断一条词缀行翻得对不对要看上下文，
  // 只留孤零零一行反而更难用。
  const slots = preview.slots.filter(
    (slot) => !only || hasMiss(byPath.get(`inventory_slots[${slot.rawIndex}].additional_text`)),
  )
  const skills = preview.skills
    .map((skill, i) => ({ skill, i }))
    .filter(
      ({ skill, i }) =>
        !only ||
        hasMiss(byPath.get(`skills[${i}].additional_text`)) ||
        skill.supports.some((_, j) =>
          hasMiss(byPath.get(`skills[${i}].support_skills[${j}].additional_text`)),
        ),
    )
  const passives = preview.passives
    .map((passive, i) => ({ passive, i }))
    .filter(({ i }) => !only || hasMiss(byPath.get(`passives[${i}].additional_text`)))
  return (
    <div className="preview">
      <Section eyebrow="Overview" title="概览">
        <Overview
          file={file}
          fields={fields}
          misses={misses}
          filter={filter}
          onDownload={onDownload}
        />
        {description !== undefined && !only && (
          <article className="card">
            <div className="card__head">
              <h3>构筑说明</h3>
              <CardCount rows={description.rows} />
            </div>
            <PairTable
              path={description.entry.path}
              rows={description.rows}
              injected={description.injected}
              locale={locale}
              baseName={description.entry.baseName}
              bilingual={bilingual}
              emptyText="没有构筑说明"
            />
          </article>
        )}
      </Section>
      {/* 区块计数一律传**未过滤**的条数：读作「这份构筑有几个槽位」，与覆盖率、未命中
          清单一样不随筛选变化。传 slots.length 的话开筛选时卡头变成「槽位 · 1」，而用户
          刚在上面看到 4 个——屏幕上又多一个对不上的数。 */}
      <Section eyebrow="Gear" title="槽位" count={preview.slots.length}>
        {slots.length === 0 ? (
          <SectionEmpty filtered={only} text="没有装备槽位" />
        ) : (
          slots.map((slot) => {
            const entry = byPath.get(`inventory_slots[${slot.rawIndex}].additional_text`)
            return entry === undefined ? null : (
              <SlotCard
                key={slot.rawIndex}
                slot={slot}
                entry={entry}
                locale={locale}
                bilingual={bilingual}
              />
            )
          })
        )}
      </Section>
      <Section eyebrow="Gems" title="宝石" count={preview.skills.length}>
        {skills.length === 0 ? (
          <SectionEmpty filtered={only} text="没有宝石" />
        ) : (
          skills.map(({ skill, i }) => (
            <SkillCard
              key={`${skill.id}:${i}`}
              skill={skill}
              index={i}
              fields={byPath}
              levels={levelRange(file.input.skills, i)}
              locale={locale}
              bilingual={bilingual}
            />
          ))
        )}
      </Section>
      <Section eyebrow="Passives" title="天赋" count={preview.passives.length}>
        {passives.length === 0 ? (
          <SectionEmpty filtered={only} text="没有天赋" />
        ) : (
          <article className="card card--passive">
            <ul className="passives">
              {passives.map(({ passive, i }) => {
                const entry = byPath.get(`passives[${i}].additional_text`)
                return (
                  <li key={`${passive.id}:${i}`}>
                    <NamePair name={passive} kind="passive" />
                    {entry !== undefined && (
                      <PairTable
                        path={entry.entry.path}
                        rows={entry.rows}
                        injected={entry.injected}
                        locale={locale}
                        baseName={entry.entry.baseName}
                        bilingual={bilingual}
                        emptyText="没有备注"
                      />
                    )}
                  </li>
                )
              })}
            </ul>
          </article>
        )}
      </Section>
    </div>
  )
}
