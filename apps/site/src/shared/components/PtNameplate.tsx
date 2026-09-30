// 名称牌（spec §5.8，游戏对象层）：两行居中，顶边菱结扣。第二行按组给出，组内与组间的“·”由这里插入，
// 组间点跟在前一组末尾，换行时留在上一行行尾（spec §6.7 R17）。提示框形态（§6.4.4）只有名称、英文名与未收录标记。
import { Fragment, type ReactElement, type ReactNode } from 'react'
import { Icon } from './Icon'
import { Motif } from './Motif'

export type PtNameplateVariant = 'base' | 'unique' | 'gem' | 'collapsed'

export interface PtNameplateProps {
  variant: PtNameplateVariant
  /** 译文提示框形态（pt-nameplate--tooltip）：名称与英文名上下两行，不渲染第二行 */
  tooltip?: boolean
  /** 去掉底边（卡内没有对照行或已折叠） */
  shut?: boolean
  /** 名称元素标签，默认 'h3' */
  nameAs?: 'h3' | 'h4' | 'p'
  /** 名称元素属性。lang 必填（名称为英文回退时为 'en'）。未收录时 id/tabIndex/role/aria-label 挂在调用方传入的内层 span 上，不挂在此处 */
  nameAttrs: { lang: string; id?: string; tabIndex?: -1; title?: string }
  name: ReactNode
  /** Cinzel 英文名；名称显示英文回退时传 null，不渲染 */
  en: string | null
  /** 未收录标记（可见、aria-hidden），紧跟名称 */
  miss?: '基底名未收录' | '传奇名未收录' | null
  /** 第二行分组；组内与组间的“·”由组件插入（组间点放在前一组末尾）；空组省略；tooltip 时忽略 */
  meta?: readonly (readonly ReactNode[])[]
}

function present(item: ReactNode): boolean {
  return item !== null && item !== undefined && item !== false && item !== ''
}

export function PtNameplate({
  variant,
  tooltip = false,
  shut = false,
  nameAs: Name = 'h3',
  nameAttrs,
  name,
  en,
  miss = null,
  meta = [],
}: PtNameplateProps): ReactElement {
  const className = [
    'pt-nameplate',
    `pt-nameplate--${variant}`,
    tooltip ? 'pt-nameplate--tooltip' : '',
    shut ? 'pt-nameplate--shut' : '',
  ]
    .filter((item) => item !== '')
    .join(' ')
  // 词典名称与用户文件里的名称不属于固定文案：衬线归片测试据 data-user-text 跳过（spec §7.3）
  const title = (
    <Name className="pt-nameplate__name" data-user-text="" {...nameAttrs}>
      {name}
    </Name>
  )
  const english =
    en === null ? null : (
      <span className="pt-nameplate__en" lang="en">
        {en}
      </span>
    )
  const mark =
    miss === null ? null : (
      <span className="pt-nameplate__miss" aria-hidden="true">
        <Icon name="warning" size={14} />
        {miss}
      </span>
    )
  if (tooltip) {
    return (
      <header className={className}>
        <Motif symbol="clasp" className="pt-nameplate__clasp" />
        {title}
        {english}
        {mark}
      </header>
    )
  }
  const groups = meta.map((group) => group.filter(present)).filter((group) => group.length > 0)
  return (
    <header className={className}>
      <Motif symbol="clasp" className="pt-nameplate__clasp" />
      <div className="pt-nameplate__row1">
        {title}
        {english}
        {mark}
      </div>
      {groups.length > 0 && (
        <div className="pt-nameplate__meta">
          {groups.map((group, g) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: 分组由调用方按固定顺序给出，位置就是身份
            <span key={g} className="pt-nameplate__group">
              {group.map((item, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: 组内各项按固定顺序给出，位置就是身份
                <Fragment key={i}>
                  {item}
                  {(i < group.length - 1 || g < groups.length - 1) && (
                    <i className="pt-nameplate__dot" aria-hidden="true">
                      ·
                    </i>
                  )}
                </Fragment>
              ))}
            </span>
          ))}
        </div>
      )}
    </header>
  )
}
