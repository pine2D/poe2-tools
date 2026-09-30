// L0 对照行（spec §5.11）：左对齐、系统无衬线，同一源行一个 li。字段首行的基底名与传奇名注入行
// 已移进名称牌（§6.4.3），这里不再渲染。锚点 id 挂在与改版前相同的逻辑格上（契约 C12）：
// 中英对照视图挂编号格，译文视图挂中文格，solo 挂文本格；不挂在 li 上，避免 aria-label 盖住整行。
import type { Locale } from '@poe2-tools/build-core'
import type { ReactElement } from 'react'
import { Icon } from '../../../shared/components/Icon'
import { rowDomId } from './locate'
import { MarkupText } from './MarkupText'
import { isMissedRow, type PairRow } from './rows'

export type PreviewView = 'compare' | 'translated'
export interface PairTableProps {
  path: string
  rows: readonly PairRow[]
  locale: Locale
  /** 字段首行按惯例是不是基底名（只有装备槽位是）；是的话首行已进名称牌，这里跳过 */
  baseName: boolean
  bilingual: boolean
  view?: PreviewView
  /** collapsed 装备的展开控件用 aria-controls 指向它（spec §6.4.3） */
  id?: string | undefined
  hidden?: boolean | undefined
}

/** 视觉隐藏的列说明，放在原“原文 · EN / 译文 · 简体中文”列头的位置（spec §5.11） */
export function pairCaption(view: PreviewView, locale: Locale): string {
  const lang = locale === 'zh-CN' ? '简体中文' : '繁体中文'
  return view === 'compare'
    ? `对照分两栏：左栏原文（英文），右栏译文（${lang}）`
    : `仅显示译文（${lang}）`
}

export function PairTable({
  path,
  rows,
  locale,
  baseName,
  bilingual,
  view = 'compare',
  id,
  hidden,
}: PairTableProps): ReactElement | null {
  const shown = baseName ? rows.filter((row) => !row.base) : rows
  if (shown.length === 0) return null
  // 整段都是原样（自由备注）时退化成单栏，不左右逐字重复（改版前 .tip--solo）
  const solo =
    !bilingual && shown.every((row) => row.status === 'kept' && !isMissedRow(row, baseName))
  if (solo) {
    return (
      <ol className="pt-pairs" id={id} hidden={hidden}>
        {shown.map((row, i) => (
          <li key={row.index} className="pt-pair pt-pair--solo">
            <span className="pt-pair__text" id={rowDomId(path, row.index)} tabIndex={-1} lang="en">
              <MarkupText spans={row.en} />
              {i === shown.length - 1 && (
                <span className="pt-pair-tag" lang="zh-CN">
                  原样
                </span>
              )}
            </span>
          </li>
        ))}
      </ol>
    )
  }
  const compare = view === 'compare'
  return (
    <ol className={compare ? 'pt-pairs' : 'pt-pairs pt-pairs--translated'} id={id} hidden={hidden}>
      {shown.map((row) => {
        const missed = isMissedRow(row, baseName)
        const kept = !missed && row.status === 'kept'
        const note = missed ? ({ role: 'note', 'aria-label': '未命中' } as const) : {}
        const anchor = rowDomId(path, row.index)
        const marker = missed ? '!' : (row.marker ?? '')
        return (
          <li key={row.index} className={missed ? 'pt-pair pt-pair--miss' : 'pt-pair'}>
            {compare ? (
              <span className="pt-pair__no" id={anchor} tabIndex={-1} {...note}>
                {marker}
              </span>
            ) : (
              <span className="pt-pair__no" aria-hidden="true">
                {marker}
              </span>
            )}
            {compare && (
              <span className="pt-pair__en" lang="en">
                <MarkupText spans={row.en} />
              </span>
            )}
            <span
              className="pt-pair__zh"
              lang={missed || kept ? 'en' : locale}
              id={compare ? undefined : anchor}
              tabIndex={compare ? undefined : -1}
              {...note}
            >
              {missed || kept ? (
                <span className="pt-pair__kept">
                  <MarkupText spans={row.zh ?? row.en} />
                </span>
              ) : (
                <MarkupText spans={row.zh ?? row.en} />
              )}
              {missed && (
                <span className="pt-tag-miss" lang="zh-CN">
                  <Icon name="warning" size={14} />
                  {/* 文字包成一个 flex 项；390 宽右栏约 120px，“保留原文”不拆开（spec §6.7 R15） */}
                  <span>
                    未命中 · <span className="nw">保留原文</span>
                  </span>
                </span>
              )}
              {kept && (
                <span className="pt-pair-tag" lang="zh-CN">
                  原样
                </span>
              )}
              {row.kept.map((line, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: 保留行内容可重复，位置就是身份
                <span key={i} className="app__pair-orig" lang="en">
                  <MarkupText spans={line} />
                  <span className="pt-pair-tag" lang="zh-CN">
                    原文
                  </span>
                </span>
              ))}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
