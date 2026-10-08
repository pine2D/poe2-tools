import { describe, expect, it } from 'vitest'
import { collectBlocks, createSink } from '../src/extract/blocks'
import { extractGeneric } from '../src/extract/sites/generic'

const doc = (html: string) => new DOMParser().parseFromString(html, 'text/html')

describe('collectBlocks', () => {
  it('按块级元素切段，记录强调范围，跳过导航与表单', () => {
    const d = doc(`<body><nav><p>Menu</p></nav><article>
      <h2>Leveling</h2>
      <p>Use <b>Contagion</b>  and
        <a href="#">Essence Drain</a>.</p>
      <ul><li>Step <strong>one</strong></li></ul>
      <pre>REGEX "a|b"</pre>
      <form><p>Search</p></form>
    </article></body>`)
    const sink = createSink()
    collectBlocks(d.body, sink)
    expect(sink.blocks.map((b) => [b.id, b.kind, b.text])).toEqual([
      ['b0', 'heading', 'Leveling'],
      ['b1', 'paragraph', 'Use Contagion and Essence Drain.'],
      ['b2', 'list-item', 'Step one'],
      ['b3', 'verbatim', 'REGEX "a|b"'],
    ])
    const p = sink.blocks[1]
    expect(p?.emphasis?.map(([a, b]) => p.text.slice(a, b))).toEqual(['Contagion', 'Essence Drain'])
  })
  it('块里嵌套块时取内层，不重复', () => {
    const d = doc('<body><ul><li><p>Inner text</p></li></ul></body>')
    const sink = createSink()
    collectBlocks(d.body, sink)
    expect(sink.blocks.map((b) => b.text)).toEqual(['Inner text'])
  })
  it('没有块标签、但直接含长文本的 div 视为段落', () => {
    const d = doc(`<body><div>${'Long guide text. '.repeat(4)}</div></body>`)
    const sink = createSink()
    collectBlocks(d.body, sink)
    expect(sink.blocks).toHaveLength(1)
  })
})

describe('extractGeneric', () => {
  it('优先选正文最长的 article/main', () => {
    const d = doc(
      '<body><main><p>short</p></main><article><p>a much longer article body text here</p></article></body>',
    )
    expect(extractGeneric(d).map((b) => b.text)).toEqual(['a much longer article body text here'])
  })
})
