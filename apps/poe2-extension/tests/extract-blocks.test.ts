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

describe('collectBlocks 行内包装里的块', () => {
  const long = 'This long paragraph lives inside an inline wrapper element.'
  const texts = (html: string) => {
    const sink = createSink()
    collectBlocks(doc(html).body, sink)
    return sink.blocks.map((b) => b.text)
  }
  it('span 包着的 div 正文不丢', () => {
    expect(texts(`<body><div><p>Intro</p><span><div>${long}</div></span></div></body>`)).toEqual([
      'Intro',
      long,
    ])
  })
  it('自定义元素包着的 div 正文不丢', () => {
    expect(
      texts(`<body><div><p>Intro</p><x-card><div>${long}</div></x-card></div></body>`),
    ).toEqual(['Intro', long])
  })
  it('链接包着的 div 正文不丢', () => {
    expect(
      texts(`<body><section><h2>T</h2><a href="#"><div>${long}</div></a></section></body>`),
    ).toEqual(['T', long])
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

describe('通用结构与诊断', () => {
  it('语义正文收集短 div，保留 BR、代码与标题/列表/表格关系，不重复或改 DOM', () => {
    const d = doc(
      '<article><h2>Gear</h2><div>+80 to maximum Life<br>25% reduced Attribute Requirements</div><p>Use <code>Life +80</code> here.</p><ul><li>First</li><li>Second</li></ul><table><tr><th>Slot</th><th>Goal</th></tr><tr><td>Gloves</td><td>Life</td></tr></table><nav><div>Menu</div></nav></article>',
    )
    const before = d.body.innerHTML
    const bs = extractGeneric(d)
    expect(bs.map((b) => b.text)).toEqual([
      'Gear',
      '+80 to maximum Life 25% reduced Attribute Requirements',
      'Use Life +80 here.',
      'First',
      'Second',
      'Slot',
      'Goal',
      'Gloves',
      'Life',
    ])
    expect(bs[1]?.breaks).toEqual([20])
    expect(bs[1]?.context?.headingIds).toEqual(['b0'])
    expect(bs[2]?.verbatim?.map(([a, b]) => bs[2]?.text.slice(a, b))).toEqual(['Life +80'])
    expect(bs[3]?.context?.listId).toBeTruthy()
    expect(bs[3]?.context?.listId).toBe(bs[4]?.context?.listId)
    expect(bs[5]?.context).toMatchObject({ header: true, column: 0 })
    expect(bs[7]?.context?.tableId).toBe(bs[5]?.context?.tableId)
    expect(bs[7]?.context?.rowId).toBe(bs[8]?.context?.rowId)
    expect(bs[7]?.context?.rowId).not.toBe(bs[5]?.context?.rowId)
    expect(d.body.innerHTML).toBe(before)
  })
  it('单块和块数截断可见；范围不漂移且不伪造完整实体', () => {
    const sink = createSink()
    sink.add('paragraph', 'x'.repeat(20010), {
      entities: [[19990, 20010]],
      verbatim: [[0, 3]],
      breaks: [19999, 20005],
    })
    expect(sink.blocks[0]).toMatchObject({ truncated: true, verbatim: [[0, 3]], breaks: [19999] })
    expect(sink.blocks[0]?.entities).toBeUndefined()
    expect(sink.diagnostics).toEqual([{ kind: 'text-truncated', blockId: 'b0' }])
    for (let i = 0; i < 5005; i++) sink.add('paragraph', 'a')
    expect(sink.blocks).toHaveLength(5000)
    expect(sink.diagnostics.filter((d) => d.kind === 'block-limit')).toHaveLength(1)
  })
})

it('短正文容器里的直接文字和子 div 按顺序保留，不漏掉前后说明', () => {
  const d = doc('<main><div>Before<div>+80 Life</div>After</div></main>')
  expect(extractGeneric(d).map((b) => b.text)).toEqual(['Before', '+80 Life', 'After'])
})
