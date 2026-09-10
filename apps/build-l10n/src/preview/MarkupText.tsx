// 把 MarkupSpan[] 渲染成带颜色 / 字号的 span，并把每个数值单独包成 <span class="num">。
// 两条设计约束：
//  1. 没有标记、也没有数值的段输出**裸文本**（Fragment），不套 span —— 对照表一屏可能
//     有几百段，给每个字都包一层既臃肿又让 CSS 选择器难写；
//  2. 数值高亮只在渲染时切，不动 markup.ts 的 MarkupSpan 模型 —— 那里的字符偏移是
//     sliceSpans 摘标号前缀的依据，往数据里再切一层会把偏移搞乱。
import { Fragment, type ReactNode } from 'react'
import { type MarkupSpan, markupClass, resolveRgbTag } from './markup'

// 捕获组让 String.prototype.split 的结果变成「普通文本 / 数值」交替的数组
// （split 会在**每一处**匹配上切开，与有没有 g 标志无关，奇数下标就是数值）。
// 形状：可选正负号 + 数字 + 若干「.或, 接数字」+ 可选百分号。
// 结尾必须是数字或 %，所以编号行的 "1." 只会吃掉 "1"，句点留给正文。
// 两侧的断言挡住词内数字：T17 / L10N / 2H / 30s / 100k 这类词整体是名字或带单位的写法，
// 不是可高亮的数值。两侧都要连数字一起挡（不能只挡字母）——否则 "T17" 的 "1" 被字母挡住后，
// 引擎会退到 "7" 上重来；"30s" 的 "30" 被右侧字母挡住后，会退到 "3" 上重来。
const NUMBER = /(?<![A-Za-z0-9])([-+]?\d+(?:[.,]\d+)*%?)(?![A-Za-z0-9])/

function withNumbers(text: string, key: string): ReactNode {
  const parts = text.split(NUMBER)
  if (parts.length === 1) return text
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      // biome-ignore lint/suspicious/noArrayIndexKey: split 出的数值可重复，位置是身份的一部分
      <span key={`${key}#${i}`} className="num">
        {part}
      </span>
    ) : (
      // biome-ignore lint/suspicious/noArrayIndexKey: split 出的普通文本可重复，位置是身份的一部分
      <Fragment key={`${key}#${i}`}>{part}</Fragment>
    ),
  )
}

function spanStyle(tags: readonly string[]): { color: string } | undefined {
  // 自定义色取最内层的一个
  for (let i = tags.length - 1; i >= 0; i -= 1) {
    const color = resolveRgbTag(tags[i] ?? '')
    if (color !== null) return { color }
  }
  return undefined
}

export function MarkupText({ spans }: { spans: readonly MarkupSpan[] }) {
  return (
    <>
      {spans.map((span, i) => {
        const className = markupClass(span.tags)
        const style = spanStyle(span.tags)
        const key = `${i}:${span.text}`
        const body = withNumbers(span.text, key)
        if (className === '' && style === undefined) return <Fragment key={key}>{body}</Fragment>
        return (
          <span key={key} className={className === '' ? undefined : className} style={style}>
            {body}
          </span>
        )
      })}
    </>
  )
}
