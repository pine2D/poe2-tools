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
