import type { GuideBlock, GuideDictionary } from '@poe2-tools/guide-core'
import { describe, expect, it, vi } from 'vitest'
import type { EngineHandle } from '../src/guide/controller'
import { DEFAULT_PREFS } from '../src/guide/prefs'
import { translateSelection } from '../src/guide/selection'
import { createMemoryStore } from '../src/guide/store/memory'
import { captureSelection } from '../src/selection/capture'
import {
  combineSelection,
  MAX_SELECTION_CHARS,
  parseSelectionRequest,
  selectionDocument,
} from '../src/selection/protocol'

const block: GuideBlock = { id: 'b0', kind: 'paragraph', text: 'Keep moving through this area.' }
const dictionary: GuideDictionary = {
  schemaVersion: 1,
  locale: 'zh-CN',
  hash: 'd1',
  entries: [],
  abbreviations: [],
}
function deps() {
  const run = vi.fn<EngineHandle['runner']['run']>(async (_messages, onText) => {
    onText('<t id="b0">继续穿过这片区域。</t>')
    return { finishReason: 'stop', usage: { prompt: 20, completion: 10 } }
  })
  return {
    dictionary: async () => dictionary,
    stats: {
      hash: 's1',
      ruleVersion: '1',
      resolve: (text: string) =>
        text === '+80 to maximum Life'
          ? { status: 'translated' as const, text: '+80 生命上限', candidates: [] }
          : { status: 'unmatched' as const, text: null, candidates: [] },
    },
    store: createMemoryStore({ capacityBytes: 1e6, now: () => 1 }),
    prefs: async () => DEFAULT_PREFS,
    engine: async (): Promise<EngineHandle> => ({
      runner: { run },
      provider: 'test',
      model: 'm',
      params: '',
      costText: () => '本地测试',
    }),
    random: () => 'nonce',
    run,
  }
}

describe('划词范围与消息边界', () => {
  it('跨段合并保留保护范围偏移；不携带邻段语境或网页地址', () => {
    const merged = combineSelection([
      {
        id: 'x',
        kind: 'paragraph',
        text: 'Use Arc',
        entities: [[4, 7]],
        context: { headingIds: ['secret'] },
      },
      { id: 'y', kind: 'verbatim', text: 'https://example.com/path' },
    ])
    expect(merged).toMatchObject({
      id: 'b0',
      text: 'Use Arc\n\nhttps://example.com/path',
      entities: [[4, 7]],
      verbatim: [[9, 33]],
    })
    expect(merged?.context).toBeUndefined()
    expect(selectionDocument(merged!).source.url).toBe('https://selection.invalid/')
  })
  it('拒绝截断、超长、无效保护范围与不可控请求字段', () => {
    expect(combineSelection([{ ...block, truncated: true }])).toBeNull()
    expect(combineSelection([{ ...block, text: 'a'.repeat(MAX_SELECTION_CHARS + 1) }])).toBeNull()
    expect(
      parseSelectionRequest({
        type: 'translate',
        id: 'abc',
        block: { ...block, entities: [[0, 9999]] },
      }),
    ).toBeNull()
    expect(
      parseSelectionRequest({ type: 'translate', id: 'abc', block, apiKey: 'not-allowed' }),
    ).toBeNull()
    expect(parseSelectionRequest({ type: 'translate', id: 'abc', block })).toMatchObject({
      id: 'abc',
      block,
    })
  })
  it('只读用户范围，剔除隐藏文字并保留代码；输入与编辑器不读', () => {
    document.body.innerHTML =
      '<p>Outside <b>Use Arc</b><span hidden>private</span> with <code>Ctrl+C</code> carefully.</p>'
    const range = document.createRange()
    range.setStart(document.querySelector('b')!.firstChild!, 0)
    range.setEnd(document.querySelector('p')!.lastChild!, 0)
    const loc = { href: 'https://example.com/a', hostname: 'example.com', pathname: '/a' }
    const selected = captureSelection(document, loc, range)
    expect(selected?.text).toBe('Use Arc with Ctrl+C')
    expect(selected?.verbatim?.length).toBe(1)
    document.querySelector('p')!.setAttribute('contenteditable', 'true')
    expect(captureSelection(document, loc, range)).toBeNull()
    document.body.innerHTML =
      '<div><p>Public text</p><div contenteditable="">secret draft</div></div>'
    range.selectNodeContents(document.body.firstChild!)
    expect(captureSelection(document, loc, range)).toBeNull()
  })
})

describe('划词复用完整接纳管线', () => {
  it('共享缓存，第二次不调用模型；词缀零请求', async () => {
    const d = deps()
    const first = await translateSelection(block, d, new AbortController().signal)
    expect(first).toMatchObject({ ok: true, text: '继续穿过这片区域。', origin: 'engine' })
    expect(await translateSelection(block, d, new AbortController().signal)).toMatchObject({
      ok: true,
      origin: 'cache',
    })
    expect(
      await translateSelection(
        { ...block, kind: 'modline', text: '+80 to maximum Life' },
        d,
        new AbortController().signal,
      ),
    ).toMatchObject({ ok: true, origin: 'dictionary', text: '+80 生命上限' })
    expect(d.run).toHaveBeenCalledTimes(1)
  })
  it('无 Key、超偏好上限与不合格协议都明确失败，不自动重试', async () => {
    const d = deps()
    expect(
      await translateSelection(
        block,
        { ...d, engine: async () => null },
        new AbortController().signal,
      ),
    ).toMatchObject({ ok: false })
    expect(d.run).not.toHaveBeenCalled()
    expect(
      await translateSelection(
        { ...block, text: 'Keep moving. '.repeat(100) },
        { ...d, prefs: async () => ({ ...DEFAULT_PREFS, charLimit: 1000 }) },
        new AbortController().signal,
      ),
    ).toMatchObject({ ok: false })
    expect(d.run).not.toHaveBeenCalled()
    d.run.mockImplementation(async (_, onText) => {
      onText('裸文本不能接纳')
      return { finishReason: 'stop', usage: null }
    })
    expect(await translateSelection(block, d, new AbortController().signal)).toMatchObject({
      ok: false,
    })
    expect(d.run).toHaveBeenCalledTimes(1)
    expect(await d.store.usage()).toBe(0)
  })
  it('取消后晚到的输出既不显示也不进入缓存', async () => {
    const d = deps()
    let release!: () => void
    d.run.mockImplementation(async (_, onText) => {
      await new Promise<void>((resolve) => {
        release = resolve
      })
      onText('<t id="b0">继续穿过这片区域。</t>')
      return { finishReason: 'stop', usage: null }
    })
    const c = new AbortController()
    const result = translateSelection(block, d, c.signal)
    await vi.waitFor(() => expect(release).toBeTypeOf('function'))
    c.abort()
    release()
    expect(await result).toMatchObject({ ok: false, message: '已取消翻译。' })
    expect(await d.store.usage()).toBe(0)
  })
})

it('混合 br 与多个段落的已知词缀仍全部本地翻译，零请求', async () => {
  document.body.innerHTML =
    '<main><p>+80 to maximum Life<br>+80 to maximum Mana</p><p>+30% to Fire Resistance</p></main>'
  const range = document.createRange()
  range.selectNodeContents(document.querySelector('main') as HTMLElement)
  const b = captureSelection(
    document,
    { href: 'https://example.com/', hostname: 'example.com', pathname: '/' },
    range,
  )
  if (!b) throw Error('应能取得三行选区')
  const known = new Map([
    ['+80 to maximum Life', '+80 生命上限'],
    ['+80 to maximum Mana', '+80 魔力上限'],
    ['+30% to Fire Resistance', '+30% 火焰抗性'],
  ])
  const d = deps()
  const result = await translateSelection(
    b,
    {
      ...d,
      stats: {
        ...d.stats,
        resolve: (text) => ({
          status: known.has(text) ? 'translated' : 'unmatched',
          text: known.get(text) ?? null,
          candidates: [],
        }),
      },
    },
    new AbortController().signal,
  )
  expect(result).toMatchObject({
    ok: true,
    origin: 'dictionary',
    text: '+80 生命上限\n+80 魔力上限\n+30% 火焰抗性',
  })
  expect(d.run).not.toHaveBeenCalled()
})
it('完全透明文字不发送，选择透明祖先内的文本也不发送', () => {
  document.body.innerHTML =
    '<style>.invisible { opacity: 0 }</style><p>Read <span class="invisible">private invisible text</span> instructions.</p>'
  const range = document.createRange()
  range.selectNodeContents(document.querySelector('p') as HTMLElement)
  const loc = { href: 'https://example.com/', hostname: 'example.com', pathname: '/' }
  expect(captureSelection(document, loc, range)?.text).toBe('Read instructions.')
  range.selectNodeContents(document.querySelector('span') as HTMLElement)
  expect(captureSelection(document, loc, range)).toBeNull()
})

it('多个逐字代码块保留尾部换行与类型，不产生模型请求', async () => {
  const b = combineSelection([
    { id: 'a', kind: 'verbatim', text: 'Ctrl+C\n' },
    { id: 'b', kind: 'verbatim', text: 'Ctrl+V\n' },
  ])
  if (!b) throw Error('应能保留代码')
  expect(parseSelectionRequest({ type: 'translate', id: 'r1', block: b })).not.toBeNull()
  const d = deps()
  expect(await translateSelection(b, d, new AbortController().signal)).toMatchObject({
    ok: true,
    origin: 'preserved',
    text: b.text,
  })
  expect(d.run).not.toHaveBeenCalled()
})

it('气泡结果携带术语映射，缓存命中也重新计算标注', async () => {
  const d = deps()
  const withTerm = { ...block, text: 'Use Contagion to clear the area.' }
  d.dictionary = async () => ({
    ...dictionary,
    entries: [{ id: 'gem:C', en: 'Contagion', zh: '瘟疫', kind: 'gem', tier: 'primary' }],
  })
  d.run.mockImplementation(async (_messages, onText) => {
    onText('<t id="b0">使用瘟疫清理区域。</t>')
    return { finishReason: 'stop', usage: null }
  })
  const first = await translateSelection(withTerm, d, new AbortController().signal)
  expect(first).toMatchObject({
    ok: true,
    terms: [{ start: 2, end: 4, zh: '瘟疫', en: 'Contagion' }],
  })
  const cached = await translateSelection(withTerm, d, new AbortController().signal)
  expect(cached).toMatchObject({
    ok: true,
    origin: 'cache',
    terms: [{ start: 2, end: 4, zh: '瘟疫', en: 'Contagion' }],
  })
  expect(d.run).toHaveBeenCalledTimes(1)
})
