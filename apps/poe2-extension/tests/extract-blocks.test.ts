import { createMatcher, prepareBlock, routeBlock } from '@poe2-tools/guide-core'
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

describe('代码边界空白保持原样保护', () => {
  it.each([
    [
      '<p><code>25% reduced Attribute Requirements </code></p>',
      '25% reduced Attribute Requirements ',
      '25% reduced Attribute Requirements ',
    ],
    [
      '<p><code> 25% reduced Attribute Requirements</code></p>',
      ' 25% reduced Attribute Requirements',
      ' 25% reduced Attribute Requirements',
    ],
    ['<p>Use <code>copy --force </code></p>', 'Use copy --force ', 'copy --force '],
    ['<p><code> copy --force</code> next</p>', ' copy --force next', ' copy --force'],
    ['<p>  <code> copy  --force\n</code>  </p>', ' copy  --force\n', ' copy  --force\n'],
    ['<code> copy  --force </code>', ' copy  --force ', ' copy  --force '],
  ])('不因首尾空白丢失保护：%s', (html, text, code) => {
    const d = doc(`<article>${html}</article>`)
    const before = d.body.innerHTML
    const b = extractGeneric(d)[0]
    if (!b) throw Error('missing block')
    expect(b.text).toBe(text)
    expect(b.verbatim?.map(([a, z]) => b.text.slice(a, z))).toEqual([code])
    const resolve = () => ({ status: 'translated' as const, text: '不能替换代码', candidates: [] })
    expect(routeBlock(b, resolve).kind).not.toBe('dictionary')
    const matcher = createMatcher({
      schemaVersion: 1,
      locale: 'zh-CN',
      hash: 'test',
      entries: [],
      abbreviations: [],
    })
    expect(prepareBlock(b, matcher, resolve).tokens).toContain(code)
    expect(d.body.innerHTML).toBe(before)
  })
  it('整个 pre 的边界空白也不能改写', () => {
    expect(extractGeneric(doc('<article><pre>  copy --force\n</pre></article>'))[0]).toMatchObject({
      kind: 'verbatim',
      text: '  copy --force\n',
    })
  })
})

describe('正文容器与内容标题', () => {
  it('多张文章卡片不代表整页，收共同正文容器并保留前后章节', () => {
    const d =
      doc(`<body><header role="banner"><nav>Site navigation</nav></header><div class="reading-shell">
      <header><h1>Campaign guide</h1></header><p>Introduction for the route.</p>
      <div class="section-title">Ritual</div><div class="cards">
        <article><header><h3>Campaign</h3></header><p>${'Campaign instructions. '.repeat(8)}</p></article>
        <article><header><h3>Endgame</h3></header><p>${'Endgame instructions. '.repeat(10)}</p></article>
      </div><div class="section-title">Speedrun</div><ul><li>Keep moving.</li></ul>
      <h2>Permanent rewards</h2><p>Take the permanent reward.</p>
    </div><footer>Copyright footer</footer></body>`)
    const before = d.body.innerHTML
    const blocks = extractGeneric(d)
    expect(blocks.map((b) => b.text)).toEqual([
      'Campaign guide',
      'Introduction for the route.',
      'Ritual',
      'Campaign',
      'Campaign instructions. '.repeat(8).trim(),
      'Endgame',
      'Endgame instructions. '.repeat(10).trim(),
      'Speedrun',
      'Keep moving.',
      'Permanent rewards',
      'Take the permanent reward.',
    ])
    expect(blocks.filter((b) => b.kind === 'heading').map((b) => b.text)).toEqual([
      'Campaign guide',
      'Ritual',
      'Campaign',
      'Endgame',
      'Speedrun',
      'Permanent rewards',
    ])
    expect(d.body.innerHTML).toBe(before)
  })
  it('正文标题和任务文字保留，隐藏副本和折叠内容不自动加入', () => {
    const d =
      doc(`<main><header><h1>Act I</h1></header><div class="zone-header"><label><input type="checkbox">Clearfell</label></div>
      <div class="step">Collect the reward.</div><p style="display:none">Hidden duplicate.</p><p hidden>Hidden attribute.</p>
      <details><summary>Optional</summary><p>Collapsed secret.</p></details><p>Visible instructions.</p></main>`)
    const bs = extractGeneric(d)
    expect(bs.map((b) => b.text)).toEqual([
      'Act I',
      'Clearfell',
      'Collect the reward.',
      'Optional',
      'Visible instructions.',
    ])
    expect(bs.find((b) => b.text === 'Clearfell')?.kind).toBe('heading')
  })
  it('正文长度评分不被导航、脚本和隐藏内容撑大', () => {
    const d = doc(
      `<article><nav>${'Menu '.repeat(200)}</nav><script>${'script '.repeat(200)}</script><p style="display:none">${'hidden '.repeat(200)}</p></article><main><h1>Real guide</h1><p>Take this reward before entering the next zone.</p></main>`,
    )
    expect(extractGeneric(d).map((b) => b.text)).toEqual([
      'Real guide',
      'Take this reward before entering the next zone.',
    ])
  })
})

it('透明包装不阻断相邻卡片发现，明确main阻止扩展到站外栏', () => {
  const a = 'First card guide instructions. '.repeat(5).trim()
  const b = 'Second card guide instructions. '.repeat(7).trim()
  const d = doc(
    `<main><div class="cards"><div><article><p>${a}</p></article></div><div><article><p>${b}</p></article></div></div></main><div>${'Unrelated footer text. '.repeat(8)}</div>`,
  )
  expect(extractGeneric(d).map((b) => b.text)).toEqual([a, b])
  const wrapped = doc(
    `<div class="reading-shell"><h1>Whole guide</h1><div class="cards"><div><article><p>${a}</p></article></div><div><article><p>${b}</p></article></div></div></div>`,
  )
  expect(extractGeneric(wrapped).map((b) => b.text)).toEqual(['Whole guide', a, b])
})

it('标题旁的独立复选操作标签不并入标题，任务文字本身的label仍保留', () => {
  const d = doc(
    '<main><div class="zone-header"><span>Clearfell</span><label><input type="checkbox">mark required</label></div><p>Collect the reward.</p><div class="zone-header"><label><input type="checkbox">Defeat the boss.</label></div></main>',
  )
  expect(extractGeneric(d).map((b) => b.text)).toEqual([
    'Clearfell',
    'Collect the reward.',
    'Defeat the boss.',
  ])
})

it('扩展正文根时排除站点页眉，保留正文区域中的页眉与标题', () => {
  const d = doc(`<body>
    <header><h1>Site brand</h1><p>${'Account and marketing messages. '.repeat(8)}</p></header>
    <div><article><header><h1>Guide title</h1><p>Guide summary.</p></header><p>First guide instructions.</p></article>
      <section><header><h2>Next chapter</h2></header><p>${'Second guide instructions. '.repeat(4)}</p></section></div>
  </body>`)
  expect(extractGeneric(d).map((b) => b.text)).toEqual([
    'Guide title',
    'Guide summary.',
    'First guide instructions.',
    'Next chapter',
    'Second guide instructions. '.repeat(4).trim(),
  ])
})
