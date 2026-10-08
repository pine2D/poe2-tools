// 从流式输出里逐段取出 <t id="…">…</t>。只接受本块请求过的段号，每个段号只取第一次出现。
export interface TagSplitter {
  push(text: string): void
  end(): string[]
}

const TAG = /<t id="([^"]{1,64})">([\s\S]*?)<\/t>/g

export function createTagSplitter(
  expected: readonly string[],
  onBlock: (id: string, text: string) => void,
): TagSplitter {
  const wanted = new Set(expected)
  const done = new Set<string>()
  let buffer = ''
  return {
    push(text) {
      buffer += text
      let consumed = 0
      for (const match of buffer.matchAll(TAG)) {
        consumed = (match.index ?? 0) + match[0].length
        const id = match[1] ?? ''
        if (!wanted.has(id) || done.has(id)) continue
        done.add(id)
        onBlock(id, (match[2] ?? '').trim())
      }
      buffer = buffer.slice(consumed)
    },
    end() {
      return expected.filter((id) => !done.has(id))
    },
  }
}
