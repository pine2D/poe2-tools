import { splitLines } from './lines'

export interface TextPairProps {
  original: string | null | undefined
  translated: string | null | undefined
  missed: ReadonlySet<number>
}

// 左英右中；左侧未命中的编号行高亮。原文按行渲染以便标记，译文整段显示（双语模式、传奇名注入时右列会比左列多行，属预期）。
// 行元素用 role="note" 承载 aria-label（Biome useAriaPropsSupportedByRole 不允许裸 span 带 aria-label）
export function TextPair({ original, translated, missed }: TextPairProps) {
  const left = splitLines(original)
  const right = splitLines(translated)
  if (left.length === 0 && right.length === 0) return null
  return (
    <div className="pair">
      <pre className="pair__col pair__col--en">
        {left.map((line, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: 行号就是行的身份，行内容可重复
            key={i}
            role="note"
            className={missed.has(i) ? 'line line--miss' : 'line'}
            aria-label={missed.has(i) ? '未命中' : undefined}
          >
            {line}
            {'\n'}
          </span>
        ))}
      </pre>
      <pre className="pair__col pair__col--zh">{right.join('\n')}</pre>
    </div>
  )
}
