import { createMatcher, parseExtractResult, prepareBlock } from '@poe2-tools/guide-core'
import { describe, expect, it } from 'vitest'
import { extractPage } from '../src/extract/run'

const doc = (html: string) =>
  new DOMParser().parseFromString(
    `<html><head><title>T</title></head><body>${html}</body></html>`,
    'text/html',
  )
const body = `<article><p>${'Guide paragraph with enough text. '.repeat(4)}</p></article>`
const at = (hostname: string, pathname = '/') => ({
  hostname,
  pathname,
  href: `https://${hostname}${pathname}`,
})
const NOW = '2026-10-07T00:00:00.000Z'

describe('extractPage', () => {
  it('CoE 页面与 PoE1 页面拒绝', () => {
    expect(extractPage(doc(body), at('beta.craftofexile.com'), '', NOW)).toEqual({
      ok: false,
      reason: 'coe',
    })
    expect(extractPage(doc(body), at('mobalytics.gg', '/poe/builds/x'), '', NOW)).toEqual({
      ok: false,
      reason: 'poe1',
    })
  })
  it('正文太少时报 empty', () => {
    expect(extractPage(doc('<p>hi</p>'), at('example.com'), '', NOW)).toEqual({
      ok: false,
      reason: 'empty',
    })
  })
  it('通用站点返回合法文档，能通过 parseExtractResult', () => {
    const r = extractPage(doc(body), at('example.com', '/g'), '', NOW)
    expect(parseExtractResult(r)).toEqual(r)
    expect(r.ok && r.doc.source).toEqual({
      url: 'https://example.com/g',
      title: 'T',
      siteId: 'generic',
      extractedAt: NOW,
      scope: 'full',
    })
  })
  it('有选区时只取选区', () => {
    const r = extractPage(
      doc(body),
      at('www.poe2.com', '/x'),
      'First line.\n\nSecond line here.',
      NOW,
      undefined,
      { scope: 'selection' },
    )
    expect(r.ok && r.doc.source.scope).toBe('selection')
    expect(r.ok && r.doc.blocks.map((b) => b.text)).toEqual(['First line.', 'Second line here.'])
    expect(r.ok && r.doc.source.siteId).toBe('poe2com')
  })
  it('poe2.com 只将名称一致的专名提示链接标为实体，保留已知词条并保护未知名称', () => {
    const html = `<article><p>Use
      <a href="https://poe2db.tw/us/Unknown_Crown" title="Unknown Crown — hover for tooltip, click for poe2db"><b>Unknown</b> Crown</a>
      and <a href="https://poe2db.tw/us/Contagion" title="Contagion — hover for tooltip, click for poe2db">Contagion</a>.
      <a href="https://poe2db.tw/us/Other">Read the full guide</a>;
      <a href="https://poe2db.tw.evil.test/us/X" title="Fake — hover for tooltip, click for poe2db">Fake</a>;
      <a href="https://poe2db.tw/us/X" title="Other — hover for tooltip, click for poe2db">Mismatch</a>.</p>
      <p>${'Guide paragraph with enough text. '.repeat(4)}</p></article>`
    const page = doc(html)
    const before = page.body.innerHTML
    const r = extractPage(page, at('www.poe2.com', '/juice-box/x'), '', NOW)
    expect(page.body.innerHTML).toBe(before)
    if (!r.ok) throw new Error('取文失败')
    expect(parseExtractResult(r)).toEqual(r)
    const b = r.doc.blocks[0]
    if (!b) throw new Error('缺少正文段落')
    expect(b.entities?.map(([a, z]) => b.text.slice(a, z))).toEqual(['Unknown Crown', 'Contagion'])
    const matcher = createMatcher({
      schemaVersion: 1,
      locale: 'zh-CN',
      hash: 'h',
      entries: [{ id: 'c', en: 'Contagion', zh: '瘟疫', kind: 'gem', tier: 'gray' }],
      abbreviations: [],
    })
    const prepared = prepareBlock(b, matcher)
    expect(prepared.tokens).toEqual(['Unknown Crown'])
    expect(prepared.terms.map((t) => t.zh)).toEqual(['瘟疫'])
    const generic = extractPage(doc(html), at('example.com'), '', NOW)
    expect(generic.ok && generic.doc.blocks[0]?.entities).toBeUndefined()
    const selection = extractPage(
      page,
      at('www.poe2.com'),
      'Use Unknown Crown before the next stage.',
      NOW,
      undefined,
      { scope: 'selection' },
    )
    expect(selection.ok && selection.doc.blocks[0]?.entities).toBeUndefined()
  })
  it('Mobalytics 内嵌状态缺失时回退读 DOM', () => {
    const r = extractPage(doc(body), at('mobalytics.gg', '/poe-2/builds/x'), '', NOW)
    expect(r.ok && r.doc.source.siteId).toBe('mobalytics')
    expect(r.ok && r.doc.stages).toEqual([])
    expect(r.ok && r.doc.source.fallback).toBe(true)
  })
  it('Mobalytics 列表页等非攻略页用通用提取，不置回退标记', () => {
    for (const pathname of ['/poe-2/builds', '/poe-2/builds/', '/poe-2/']) {
      const r = extractPage(doc(body), at('mobalytics.gg', pathname), '', NOW)
      expect(r.ok && r.doc.source.siteId).toBe('mobalytics')
      expect(r.ok && r.doc.stages).toEqual([])
      expect(r.ok && r.doc.source.fallback).toBeUndefined()
    }
  })
  it('Mobalytics 攻略页读不到内嵌状态时置回退标记（含末尾斜杠）', () => {
    const r = extractPage(doc(body), at('mobalytics.gg', '/poe-2/builds/some-build/'), '', NOW)
    expect(r.ok && r.doc.source.fallback).toBe(true)
  })
  it('poe2.com 正文容器读到的文字过短时改用通用提取并置回退标记', () => {
    const page = doc(
      `<main><p>short</p></main><div id="content"><p>${'Craft step text here. '.repeat(5)}</p></div>`,
    )
    const r = extractPage(page, at('www.poe2.com', '/juice-box/x'), '', NOW)
    expect(r.ok && r.doc.source.fallback).toBe(true)
    expect(r.ok && r.doc.blocks.map((b) => b.text)).toEqual([
      'Craft step text here. '.repeat(5).trim(),
    ])
  })
  it('poe2.com 没有 article/main 时取 #main-content，跳过目录侧栏与图例', () => {
    // 结构按 2026-10-08 渲染快照：正文与目录侧栏同在 #main-content 的网格里，图例是 StrategyDiagram_legend__*
    const page = doc(
      `<div id="main-content"><div class="grid">
        <div class="hidden lg:sticky"><div class="juice-box-enter"><section><h3 class="jb-category">Juice</h3><a href="#">Ritual city</a></section></div></div>
        <div class="min-w-0"><h1>100% Monster Rarity craft</h1>
          <ul class="StrategyDiagram_legend__kVWgN" aria-label="Diagram key"><li>Bring</li><li>Do</li></ul>
          <p>${'Leave bases at five mods before Chaos. '.repeat(3)}</p>
        </div>
      </div></div>`,
    )
    const r = extractPage(page, at('www.poe2.com', '/juice-box/monster-rarity-craft'), '', NOW)
    expect(r.ok && r.doc.source.fallback).toBeUndefined()
    expect(r.ok && r.doc.blocks.map((b) => b.text)).toEqual([
      '100% Monster Rarity craft',
      'Leave bases at five mods before Chaos. '.repeat(3).trim(),
    ])
  })
})

it('短正文不被整页 80 字门槛丢弃，截断诊断通过输入校验', () => {
  const r = extractPage(
    doc('<main><div>+80 to maximum Life</div></main>'),
    at('example.com'),
    '',
    NOW,
  )
  expect(r.ok && r.doc.blocks.map((b) => b.text)).toEqual(['+80 to maximum Life'])
  const long = extractPage(
    doc(`<main><p>${'a'.repeat(20010)}</p></main>`),
    at('example.com'),
    '',
    NOW,
  )
  expect(parseExtractResult(long)).toEqual(long)
  expect(long.ok && long.doc.diagnostics).toEqual([{ kind: 'text-truncated', blockId: 'b0' }])
})

it('DOM 选区只取所选内容并保留实体、BR 与代码；截断的实体不被当作完整名称', () => {
  const d = document
  d.body.innerHTML =
    '<article><p>Outside selection.</p><p id="chosen">Use <a href="https://poe2db.tw/us/Crown" title="Unknown Crown — hover for tooltip, click for poe2db">Unknown Crown</a><br><code>+80 Life</code></p><p>More outside.</p></article>'
  const before = d.body.innerHTML
  const range = d.createRange()
  const chosen = d.getElementById('chosen')
  if (!chosen) throw Error('missing fixture')
  range.selectNodeContents(chosen)
  const r = extractPage(d, at('poe2.com'), range.toString(), NOW, range, { scope: 'selection' })
  if (!r.ok) throw Error('missing selection')
  expect(r.doc.source.scope).toBe('selection')
  expect(r.doc.blocks.map((b) => b.text)).toEqual(['Use Unknown Crown +80 Life'])
  const block = r.doc.blocks[0]
  if (!block) throw Error('missing block')
  expect(block.entities?.map(([a, b]) => block.text.slice(a, b))).toEqual(['Unknown Crown'])
  expect(block.verbatim?.map(([a, b]) => block.text.slice(a, b))).toEqual(['+80 Life'])
  expect(block.breaks).toHaveLength(1)
  expect(parseExtractResult(r)).toEqual(r)
  expect(d.body.innerHTML).toBe(before)
  const anchorText = chosen.querySelector('a')?.firstChild
  if (!anchorText) throw Error('missing anchor')
  range.setStart(anchorText, 8)
  range.setEnd(anchorText, 13)
  expect(range.toString()).toBe('Crown')
  const partial = extractPage(d, at('poe2.com'), range.toString(), NOW, range, {
    scope: 'selection',
  })
  expect(partial.ok && partial.doc.blocks[0]?.text).toBe('Crown')
  expect(partial.ok && partial.doc.blocks[0]?.entities).toBeUndefined()
})

it('单字符选区也不扩大为全文', () => {
  const r = extractPage(doc(body), at('example.com'), 'A', NOW, undefined, { scope: 'selection' })
  expect(r.ok && r.doc.source.scope).toBe('selection')
  expect(r.ok && r.doc.blocks.map((b) => b.text)).toEqual(['A'])
})

it('只选中代码内容时保留浅克隆的保护语义与边界空白', () => {
  const d = document
  d.body.innerHTML = '<article><p>Outside <code> copy  --force </code> outside</p></article>'
  const before = d.body.innerHTML
  const code = d.querySelector('code')
  if (!code?.firstChild) throw Error('missing fixture')
  const range = d.createRange()
  range.setStart(code.firstChild, 0)
  range.setEnd(code.firstChild, code.textContent?.length ?? 0)
  const result = extractPage(d, at('example.com'), range.toString(), NOW, range, {
    scope: 'selection',
  })
  if (!result.ok) throw Error('missing extraction')
  expect(parseExtractResult(result)).toEqual(result)
  expect(result.doc.source.scope).toBe('selection')
  expect(result.doc.blocks).toHaveLength(1)
  const b = result.doc.blocks[0]
  expect(b?.text).toBe(' copy  --force ')
  expect(b?.verbatim?.map(([a, z]) => b.text.slice(a, z))).toEqual([' copy  --force '])
  expect(d.body.innerHTML).toBe(before)
})

it('整页模式显式忽略残留选区，空选区也不回退全文', () => {
  const d = doc(body)
  const full = extractPage(d, at('example.com'), 'stale selection', NOW, undefined, {
    scope: 'full',
  })
  expect(full.ok && full.doc.source.scope).toBe('full')
  expect(full.ok && full.doc.blocks[0]?.text).toContain('Guide paragraph')
  expect(extractPage(d, at('example.com'), '', NOW, undefined, { scope: 'selection' })).toEqual({
    ok: false,
    reason: 'empty',
  })
  expect(extractPage(d, at('example.com'), 'stale selection', NOW).ok).toBe(true)
  const defaultFull = extractPage(d, at('example.com'), 'stale selection', NOW)
  expect(defaultFull.ok && defaultFull.doc.source.scope).toBe('full')
})

it('点选区域严格限制在指定容器，文档契约保留region和会话身份', () => {
  const d = doc(
    '<main><p>Outside one.</p><section id="region"><h2>Selected region</h2><p>Inside only.</p></section><p>Outside two.</p></main>',
  )
  const regionRoot = d.getElementById('region')
  if (!regionRoot) throw Error('missing region fixture')
  const result = extractPage(d, at('example.com'), '', NOW, undefined, {
    scope: 'region',
    regionRoot,
  })
  expect(result.ok && result.doc.source.scope).toBe('region')
  expect(result.ok && result.doc.blocks.map((b) => b.text)).toEqual([
    'Selected region',
    'Inside only.',
  ])
  if (!result.ok) throw Error('missing region')
  result.doc.source.snapshotId = 'snapshot-1'
  expect(parseExtractResult(result)).toEqual(result)
})

it('相同文本分别捕获真实节点，选区边界仅对应所选字符', () => {
  const d = document
  d.body.innerHTML = '<main><p id="a">Same <b>text</b>.</p><p id="b">Same <b>text</b>.</p></main>'
  const anchors: {
    text: string
    start: Text
    startOffset: number
    end: Text
    endOffset: number
  }[] = []
  extractPage(d, at('example.com'), '', NOW, undefined, {
    scope: 'full',
    onBlock: (block, source) => anchors.push({ text: block.text, ...source }),
  })
  expect(anchors).toHaveLength(2)
  expect(anchors[0]?.start).toBe(d.querySelector('#a')?.firstChild)
  expect(anchors[1]?.start).toBe(d.querySelector('#b')?.firstChild)
  const text = d.querySelector('#b b')?.firstChild as Text
  const range = d.createRange()
  range.setStart(text, 1)
  range.setEnd(text, 3)
  anchors.length = 0
  const selected = extractPage(d, at('example.com'), range.toString(), NOW, range, {
    scope: 'selection',
    onBlock: (block, source) => anchors.push({ text: block.text, ...source }),
  })
  expect(selected.ok && selected.doc.blocks[0]?.text).toBe('ex')
  expect(anchors[0]).toMatchObject({ start: text, startOffset: 1, end: text, endOffset: 3 })
})
