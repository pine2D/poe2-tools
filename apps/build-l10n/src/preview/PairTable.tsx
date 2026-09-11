// 逐行成对的对照表：一条源行 = 一个 grid 行，左右天然同高。
// 取代第一期的两块整段 <pre>（右列不拆行、未命中只标左列、双语时左右行数错位）。
import type { Locale } from '@poe2-tools/build-core'
import { Fragment } from 'react'
import { Icon } from '../components/Icon'
import { rowDomId } from './locate'
import { MarkupText } from './MarkupText'
import type { MarkupSpan } from './markup'
import { isMissedRow, type PairRow } from './rows'

export interface PairTableProps {
  /** 字段 JSON 路径，用来生成每行的 DOM id */
  path: string
  rows: readonly PairRow[]
  injected: MarkupSpan[] | null
  locale: Locale
  /** 这个字段的首行按惯例是不是基底名（只有 inventory_slots[*].additional_text 是） */
  baseName: boolean
  /** 双语模式：右列挂着保留的英文原行，此时不做「整段原样」的单列退化 */
  bilingual: boolean
  /** 一行都没有时显示的一句话 */
  emptyText: string
}

const LOCALE_LABEL: Record<Locale, string> = { 'zh-CN': '简体中文', 'zh-TW': '繁体中文' }

export function PairTable(props: PairTableProps) {
  const { path, rows, injected, locale, baseName, bilingual, emptyText } = props
  if (rows.length === 0 && injected === null) {
    return (
      <div className="tip tip--empty">
        <p>{emptyText}</p>
      </div>
    )
  }
  // 整段都是「原样」时退化成单列纯文本块（2b 审查 I-2）。三个边界都要排除：双语模式
  // （右列挂的是保留的英文原行，不是重复）、有传奇名注入行（那一行只有译文侧有内容）、
  // 有任何未命中（含基底名未收录，四重冗余不许被退化藏起来）。不画序号格有依据：全 kept
  // 字段里没有编号行（「关键领域知识 #1」），marker 恒为 null，序号格永远是空的 26px 白边。
  // 行 id 改挂文本格并**必须**带 tabIndex={-1}：jumpTo 对无 tabIndex 的元素 focus() 是空操作，
  // 只滚动、不转移焦点；今天退化分支里不会有未命中行，补它是为了将来深链不静默失效。
  const solo =
    !bilingual &&
    injected === null &&
    rows.every((row) => row.status === 'kept' && !isMissedRow(row, baseName))
  if (solo) {
    return (
      <div className="tip tip--solo">
        {rows.map((row, i) => (
          <span
            key={row.index}
            className="tip__t tip__t--solo"
            id={rowDomId(path, row.index)}
            tabIndex={-1}
            lang="en"
          >
            <MarkupText spans={row.en} />
            {i === rows.length - 1 && (
              <span className="tip__tag tip__tag--keep" lang="zh-CN">
                原样
              </span>
            )}
          </span>
        ))}
      </div>
    )
  }
  return (
    <div className="tip">
      <span className="tip__lab">原文 · EN</span>
      <span className="tip__lab tip__lab--zh">译文 · {LOCALE_LABEL[locale]}</span>
      {injected !== null && (
        <>
          <span className="tip__base" />
          <span className="tip__base tip__base--zh" lang={locale}>
            <MarkupText spans={injected} />
            <span className="tip__tag tip__tag--inject">传奇名注入</span>
          </span>
        </>
      )}
      {rows.map((row) => {
        const missed = isMissedRow(row, baseName)
        const kept = !missed && row.status === 'kept'
        const base = baseName && row.base
        // 未命中的译文格里其实还是英文，语言标注要跟着内容走
        const zhLang = missed ? 'en' : locale
        // role 与 aria-label 必须成对出现：裸 <span> 是 generic role，单挂 aria-label 无效。
        // 写成一个整体套上 / 整体不套的 props——Biome 的 useAriaPropsSupportedByRole 只看得懂
        // 静态 role，`role={missed ? 'note' : undefined}` 会被它当成「没有 role」而报错。
        // I-1：基底名未收录与编号行真未命中是两种不同性质，aria-label 分开措辞，
        // 不能让读屏用户把「词典没收这个基底名」听成「这一行没翻译」。
        const note = missed
          ? ({ role: 'note', 'aria-label': base ? '基底名未收录' : '未命中' } as const)
          : {}
        // 基底名行**只占两个 span-2 单元、没有序号格**（mockup 的 `.tip > .base` 就是这样）。
        // 若照普通行渲染四个 span，这一行会吃掉 1+2+1+2 = 6 列，第二个 span-2 挤不下就换行，
        // 整张卡从第一行起对照结构全散——rich.build 的 Weapon1 / Charm1 / Ring2 都会中招。
        // 跳转落点（id + tabIndex）挂在英文那格上，与普通行的落点语义一致。
        if (base) {
          const baseClass = missed ? 'tip__base tip__base--miss' : 'tip__base'
          return (
            <Fragment key={row.index}>
              <span
                className={baseClass}
                id={rowDomId(path, row.index)}
                tabIndex={-1}
                lang="en"
                {...note}
              >
                <MarkupText spans={row.en} />
              </span>
              <span className={`${baseClass} tip__base--zh`} lang={zhLang} {...note}>
                {row.zh === null ? null : <MarkupText spans={row.zh} />}
                {missed && <span className="tip__tag tip__tag--miss">基底名未收录</span>}
                {row.kept.map((line, i) => (
                  <span
                    // biome-ignore lint/suspicious/noArrayIndexKey: 位置就是保留行的身份，内容可重复
                    key={i}
                    className="tip__keep"
                    lang="en"
                  >
                    <Icon name="locate" size={11} />
                    <MarkupText spans={line} />
                    <span className="tip__tag tip__tag--keep">原文</span>
                  </span>
                ))}
              </span>
            </Fragment>
          )
        }
        const numClass = ['tip__n', missed ? 'tip__n--miss' : ''].filter((c) => c !== '').join(' ')
        const enClass = ['tip__t', missed ? 'tip__t--miss' : '', kept ? 'tip__t--keep' : '']
          .filter((c) => c !== '')
          .join(' ')
        const zhClass = `${enClass} tip__t--zh`
        return (
          <Fragment key={row.index}>
            <span
              className={numClass}
              id={rowDomId(path, row.index)}
              tabIndex={-1}
              aria-hidden={missed ? undefined : 'true'}
              {...note}
            >
              {missed ? '!' : (row.marker ?? '')}
            </span>
            <span className={enClass} lang="en">
              <MarkupText spans={row.en} />
            </span>
            <span className={`${numClass} tip__n--right`} aria-hidden="true">
              {missed ? '!' : (row.marker ?? '')}
            </span>
            <span className={zhClass} lang={zhLang} {...note}>
              {row.zh === null ? null : <MarkupText spans={row.zh} />}
              {missed && <span className="tip__tag tip__tag--miss">未命中 · 保留英文</span>}
              {kept && <span className="tip__tag tip__tag--keep">原样</span>}
              {row.kept.map((line, i) => (
                <span
                  // biome-ignore lint/suspicious/noArrayIndexKey: 位置就是保留行的身份，内容可重复
                  key={i}
                  className="tip__keep"
                  lang="en"
                >
                  <Icon name="locate" size={11} />
                  <MarkupText spans={line} />
                  <span className="tip__tag tip__tag--keep">原文</span>
                </span>
              ))}
            </span>
          </Fragment>
        )
      })}
    </div>
  )
}
