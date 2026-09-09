import { splitLines } from './lines'

export interface TextPairProps {
  original: string | null | undefined
  translated: string | null | undefined
  missed: ReadonlySet<number>
}

// 左英右中；左侧未命中的编号行高亮。原文按行渲染以便标记，译文整段显示（双语模式、传奇名注入时右列会比左列多行，属预期）。
// 只有未命中行才带 role="note" + aria-label；命中行是裸 span，不带 aria-label
// （Biome useAriaPropsSupportedByRole 不允许裸 span 带 aria-label，role 与 aria-label 因此拆成两个分支，
// 避免同一元素上出现"role 可能为 undefined 但 aria-label 仍在"的静态推断问题）
export function TextPair({ original, translated, missed }: TextPairProps) {
  const left = splitLines(original)
  const right = splitLines(translated)
  if (left.length === 0 && right.length === 0) return null
  return (
    <div className="pair">
      <pre className="pair__col pair__col--en">
        {left.map((line, i) =>
          missed.has(i) ? (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: 行号就是行的身份，行内容可重复
              key={i}
              role="note"
              className="line line--miss"
              aria-label="未命中"
            >
              {line}
              {'\n'}
            </span>
          ) : (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: 行号就是行的身份，行内容可重复
              key={i}
              className="line"
            >
              {line}
              {'\n'}
            </span>
          ),
        )}
      </pre>
      <pre className="pair__col pair__col--zh">{right.join('\n')}</pre>
    </div>
  )
}
