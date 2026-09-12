// 同一源行共享网格行高；阅读模式只选择显示哪些格，不改翻译结果。
import type { Locale } from '@poe2-tools/build-core'
import { Fragment } from 'react'
import { rowDomId } from './locate'
import { MarkupText } from './MarkupText'
import type { MarkupSpan } from './markup'
import { isMissedRow, type PairRow } from './rows'

export type PreviewView = 'compare' | 'translated'
export interface PairTableProps {
  path: string
  rows: readonly PairRow[]
  injected: MarkupSpan[] | null
  locale: Locale
  baseName: boolean
  bilingual: boolean
  emptyText: string
  view?: PreviewView
}

export function PairTable({
  path,
  rows,
  injected,
  locale,
  baseName,
  bilingual,
  emptyText,
  view = 'compare',
}: PairTableProps) {
  if (rows.length === 0 && injected === null) {
    return (
      <div className="tip tip--empty">
        <p>{emptyText}</p>
      </div>
    )
  }
  const compare = view === 'compare'
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
    <div className={compare ? 'tip' : 'tip tip--translated'}>
      {injected !== null && (
        <>
          {compare && <span className="tip__base" />}
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
        const note = missed
          ? ({ role: 'note', 'aria-label': base ? '基底名未收录' : '未命中' } as const)
          : {}
        const id = rowDomId(path, row.index)
        const enClass = base ? 'tip__base' : 'tip__t'
        const markedClass = `${enClass}${missed ? ` ${enClass}--miss` : ''}`
        const zh = (
          <>
            <MarkupText spans={row.zh ?? row.en} />
            {missed && (
              <span className="tip__tag tip__tag--miss" lang="zh-CN">
                {base ? '基底名未收录' : '未命中 · 保留英文'}
              </span>
            )}
            {kept && (
              <span className="tip__tag tip__tag--keep" lang="zh-CN">
                原样
              </span>
            )}
            {row.kept.map((line, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: 保留行内容可重复，位置就是身份
              <span key={i} className="tip__keep" lang="en">
                <MarkupText spans={line} />
                <span className="tip__tag tip__tag--keep" lang="zh-CN">
                  原文
                </span>
              </span>
            ))}
          </>
        )
        const numClass = `tip__n${missed ? ' tip__n--miss' : ''}`
        return (
          <Fragment key={row.index}>
            {compare && !base && (
              <span className={numClass} id={id} tabIndex={-1} {...note}>
                {missed ? '!' : (row.marker ?? '')}
              </span>
            )}
            {compare && (
              <span
                className={markedClass}
                lang="en"
                id={base ? id : undefined}
                tabIndex={base ? -1 : undefined}
                {...(base ? note : {})}
              >
                <MarkupText spans={row.en} />
              </span>
            )}
            {!base && (
              <span className={`${numClass} tip__n--right`} aria-hidden="true">
                {missed ? '!' : (row.marker ?? '')}
              </span>
            )}
            <span
              className={`${markedClass} ${enClass}--zh${kept && !base ? ' tip__t--keep' : ''}`}
              lang={missed || kept ? 'en' : locale}
              id={!compare ? id : undefined}
              tabIndex={!compare ? -1 : undefined}
              {...note}
            >
              {zh}
            </span>
          </Fragment>
        )
      })}
    </div>
  )
}
