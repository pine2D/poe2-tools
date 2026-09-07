// Build Planner 标记语法：<tag>{...}，可嵌套。tag 为字母串，或 rgb(r, g, b)。
// 配对失败时整段按纯文本返回，保证 renderMarkup(tokenizeMarkup(s)) === s。

export type MarkupNode =
  | { kind: 'text'; value: string }
  | { kind: 'tag'; tag: string; children: MarkupNode[] }

// sticky 标志：从 lastIndex 处精确匹配 "<tag>{"
const TAG_OPEN = /<([a-z]+(?:\([^()<>{}]*\))?)>\{/iy

interface Parsed {
  nodes: MarkupNode[]
  end: number
}

export function tokenizeMarkup(text: string): MarkupNode[] {
  const parsed = parseNodes(text, 0, false)
  return parsed === null ? [{ kind: 'text', value: text }] : parsed.nodes
}

export function renderMarkup(nodes: readonly MarkupNode[]): string {
  let out = ''
  for (const node of nodes) {
    out += node.kind === 'text' ? node.value : `<${node.tag}>{${renderMarkup(node.children)}}`
  }
  return out
}

// inTag 为 true 时，遇到未被嵌套标记消耗的 '}' 表示当前标记结束。
function parseNodes(text: string, start: number, inTag: boolean): Parsed | null {
  const nodes: MarkupNode[] = []
  let buffer = ''
  let i = start
  const flush = (): void => {
    if (buffer !== '') {
      nodes.push({ kind: 'text', value: buffer })
      buffer = ''
    }
  }
  while (i < text.length) {
    const ch = text.charAt(i)
    if (ch === '<') {
      TAG_OPEN.lastIndex = i
      const match = TAG_OPEN.exec(text)
      if (match !== null) {
        const inner = parseNodes(text, i + match[0].length, true)
        if (inner === null) return null
        flush()
        nodes.push({ kind: 'tag', tag: match[1] ?? '', children: inner.nodes })
        i = inner.end
        continue
      }
    }
    if (ch === '}' && inTag) {
      flush()
      return { nodes, end: i + 1 }
    }
    buffer += ch
    i += 1
  }
  if (inTag) return null
  flush()
  return { nodes, end: i }
}
