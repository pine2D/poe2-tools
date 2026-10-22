import { parseExtractResult } from '@poe2-tools/guide-core'
import { describe, expect, it } from 'vitest'
import { extractPage } from '../src/extract/run'
import { extractMobalytics, sliceJsonObject } from '../src/extract/sites/mobalytics'

const lexical = (children: unknown[]) =>
  JSON.stringify({ root: { type: 'root', children: [{ type: 'paragraph', children }] } })
// 结构按 2026-10-07 实测快照：slug 在 queryKey 里，data.typeData.slug 是类型名，阶段在 data.data.buildVariants
const state = (slug: string, extraContent: unknown[] = []) => ({
  poe2State: {
    apollo: {
      graphqlV2: {
        queries: [
          { queryKey: ['ngf-settings'], state: { data: [{ other: true }] } },
          {
            queryKey: ['ngf-ug-featured-document-page', 'builds', slug, []],
            state: {
              data: [
                {
                  game: {
                    documents: {
                      userGeneratedDocumentBySlug: {
                        data: {
                          typeData: { slug: 'builds' },
                          content: [
                            {
                              type: 'text-widget',
                              text: lexical([{ type: 'text', text: 'Intro {not json}' }]),
                            },
                            ...extraContent,
                          ],
                          data: {
                            buildVariants: {
                              values: [
                                {
                                  id: 'uuid-1',
                                  title: 'Leveling',
                                  notes: lexical([
                                    { type: 'text', text: 'Use ' },
                                    {
                                      type: 'static-data-widget',
                                      groupId: 'skill-gems',
                                      label: 'Contagion',
                                    },
                                    { type: 'text', text: ' early.' },
                                  ]),
                                  equipment: [
                                    {
                                      commonItem: { name: 'Ab Aeterno' },
                                      explicitDescriptions: [
                                        { description: '+80 to maximum Life' },
                                      ],
                                    },
                                  ],
                                },
                                {
                                  id: 'uuid-2',
                                  title: 'Endgame',
                                  notes: lexical([{ type: 'text', text: 'Endgame text.' }]),
                                },
                              ],
                            },
                          },
                        },
                      },
                    },
                  },
                },
              ],
            },
          },
        ],
      },
    },
  },
})
const page = (slug: string, selected = 'uuid-2', extraContent: unknown[] = []) =>
  new DOMParser().parseFromString(
    `<html><body><div role="tab" id="t-tab-uuid-1" aria-selected="${selected === 'uuid-1'}"></div><div role="tab" id="t-tab-uuid-2" aria-selected="${selected === 'uuid-2'}"></div><script>window.__PRELOADED_STATE__=${JSON.stringify(state(slug, extraContent))};window.other={}</script></body></html>`,
    'text/html',
  )

describe('sliceJsonObject', () => {
  it('跳过字符串里的花括号', () => {
    const t = 'x={"a":"}{","b":{"c":1}};y=2'
    expect(sliceJsonObject(t, 2)).toBe('{"a":"}{","b":{"c":1}}')
    expect(sliceJsonObject('x={"a":1', 2)).toBeNull()
  })
})

describe('extractMobalytics', () => {
  it('读出全部阶段、当前阶段、作者文字、内联实体与词缀行', () => {
    const r = extractMobalytics(page('naviras'), '/poe-2/builds/naviras')
    expect(r?.stages).toEqual([
      { id: 'uuid-1', name: 'Leveling', current: false },
      { id: 'uuid-2', name: 'Endgame', current: true },
    ])
    const texts = r?.blocks.map((b) => [b.kind, b.stageId ?? null, b.text])
    expect(texts).toEqual([
      ['paragraph', null, 'Intro {not json}'],
      ['paragraph', 'uuid-1', 'Use Contagion early.'],
      ['heading', 'uuid-1', 'Ab Aeterno'],
      ['modline', 'uuid-1', '+80 to maximum Life'],
      ['paragraph', 'uuid-2', 'Endgame text.'],
    ])
    const use = r?.blocks[1]
    expect(use?.entities?.map(([a, b]) => use.text.slice(a, b))).toEqual(['Contagion'])
    expect(r?.blocks[2]?.entities).toEqual([[0, 10]])
  })
  it('ContentVariants 组件的 childrenVariants 决定作者文字的阶段归属与阶段名', () => {
    const variants = {
      id: 'cv',
      type: 'NgfDocumentCmWidgetContentVariantsV1',
      data: {
        childrenVariants: [
          { id: 'uuid-1', title: 'Act 1 (Pre-Ascend)', childrenIds: ['w1'] },
          { id: 'uuid-2', title: 'Endgame', childrenIds: [] },
        ],
      },
    }
    // w1 自身再带 childrenIds：嵌套组件 w2 也归到同一阶段
    const w1 = {
      id: 'w1',
      data: {
        childrenIds: ['w2'],
        text: lexical([{ type: 'text', text: 'Stage one notes.' }]),
      },
    }
    const w2 = { id: 'w2', data: { text: lexical([{ type: 'text', text: 'Nested notes.' }]) } }
    const r = extractMobalytics(
      page('naviras', 'uuid-2', [variants, w1, w2]),
      '/poe-2/builds/naviras',
    )
    expect(r?.stages[0]?.name).toBe('Act 1 (Pre-Ascend)')
    const stageOf = (text: string) => r?.blocks.find((b) => b.text === text)?.stageId
    expect(stageOf('Stage one notes.')).toBe('uuid-1')
    expect(stageOf('Nested notes.')).toBe('uuid-1')
    expect(stageOf('Intro {not json}')).toBeUndefined()
  })
  it('slug 与当前路径不符（站内跳转后的旧数据）时放弃内嵌状态', () => {
    expect(extractMobalytics(page('naviras'), '/poe-2/builds/other-build')).toBeNull()
  })
  it('列表页路径（slug 只是类型名）不误用上一篇攻略的内嵌状态', () => {
    expect(extractMobalytics(page('naviras'), '/poe-2/builds')).toBeNull()
    expect(extractMobalytics(page('naviras'), '/poe-2/builds/')).toBeNull()
  })
  it('空标签实体与多余空白：实体范围随空白折叠平移，整页仍能通过 parseExtractResult', () => {
    const notes = {
      id: 'w9',
      data: {
        text: lexical([
          { type: 'text', text: '  Then   use  ' },
          { type: 'static-data-widget', groupId: 'skill-gems', label: 'Essence Drain' },
          { type: 'static-data-widget', groupId: 'skill-gems', label: '' },
          { type: 'text', text: '   now, then keep mapping for a while.  ' },
        ]),
      },
    }
    const doc = page('naviras', 'uuid-2', [notes])
    const r = extractMobalytics(doc, '/poe-2/builds/naviras')
    const b = r?.blocks.find((x) => x.text.startsWith('Then'))
    expect(b?.text).toBe('Then use Essence Drain now, then keep mapping for a while.')
    expect(b?.entities?.map(([s, e]) => b.text.slice(s, e))).toEqual(['Essence Drain'])
    const full = extractPage(
      doc,
      {
        hostname: 'mobalytics.gg',
        pathname: '/poe-2/builds/naviras',
        href: 'https://mobalytics.gg/poe-2/builds/naviras',
      },
      '',
      '2026-10-08T00:00:00.000Z',
    )
    expect(full.ok).toBe(true)
    expect(parseExtractResult(full)).toEqual(full)
  })
  it('页面没有内嵌状态时返回 null', () => {
    expect(
      extractMobalytics(
        new DOMParser().parseFromString('<p>x</p>', 'text/html'),
        '/poe-2/builds/a',
      ),
    ).toBeNull()
  })
})
