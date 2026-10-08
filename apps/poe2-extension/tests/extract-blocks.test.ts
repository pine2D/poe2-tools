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

describe('collectBlocks 块级子元素', () => {
  it('块里的块级子元素之间补空格，行内格式与强调范围不变', () => {
    // 结构按 poe2.com 渲染快照：流程图的 li 里是按块显示的 span（label / note）
    const d = doc(`<body><ul>
      <li><div><b>Bring:</b></div><div>Five-mod</div></li>
      <li><span>Five-mod rare waystones</span><span style="display:block">Monster Rarity only</span></li>
      <li>Use <b>Con</b>tagion and <a href="#">Essence</a> Drain</li>
    </ul></body>`)
    const sink = createSink()
    collectBlocks(d.body, sink)
    expect(sink.blocks.map((b) => b.text)).toEqual([
      'Bring: Five-mod',
      'Five-mod rare waystones Monster Rarity only',
      'Use Contagion and Essence Drain',
    ])
    const spans = (i: number) => {
      const b = sink.blocks[i]
      return b?.emphasis?.map(([s, e]) => b.text.slice(s, e))
    }
    expect(spans(0)).toEqual(['Bring:'])
    expect(spans(2)).toEqual(['Con', 'Essence'])
  })
  it('含块级后代时，子块之间的行内文字单独成块，按文档顺序', () => {
    const d = doc(
      '<body><ul><li>Act 1 lead <b>text</b> here <ul><li>sub item</li></ul> tail note</li></ul></body>',
    )
    const sink = createSink()
    collectBlocks(d.body, sink)
    expect(sink.blocks.map((b) => [b.kind, b.text])).toEqual([
      ['list-item', 'Act 1 lead text here'],
      ['list-item', 'sub item'],
      ['list-item', 'tail note'],
    ])
    const lead = sink.blocks[0]
    expect(lead?.emphasis?.map(([s, e]) => lead.text.slice(s, e))).toEqual(['text'])
  })
  it('div 里段落前的长引导文字不丢，零碎短文字仍跳过', () => {
    const lead = 'This lead paragraph sits directly in the div. '
    const d = doc(
      `<body><div>${lead}<p>Then a paragraph.</p></div><div>Menu <p>Body text.</p></div></body>`,
    )
    const sink = createSink()
    collectBlocks(d.body, sink)
    expect(sink.blocks.map((b) => [b.kind, b.text])).toEqual([
      ['paragraph', lead.trim()],
      ['paragraph', 'Then a paragraph.'],
      ['paragraph', 'Body text.'],
    ])
  })
})

describe('createSink', () => {
  it('丢弃零长度与越界的范围', () => {
    const sink = createSink()
    sink.add('paragraph', 'abc', {
      entities: [
        [1, 1],
        [0, 2],
        [2, 9],
      ],
    })
    expect(sink.blocks[0]?.entities).toEqual([[0, 2]])
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
