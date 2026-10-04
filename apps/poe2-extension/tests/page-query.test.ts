import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  ASK_TIMEOUT_MS,
  IDLE_RETRY_MS,
  LOADING_LIMIT_MS,
  LOADING_RETRY_MS,
  type PageProbe,
  SETTLE_LIMIT_MS,
  SETTLE_RETRY_MS,
  watchPage,
} from '../src/popup/page-query'
import { PAGE_STATE_TYPE, type PageStateReply, parseReply } from '../src/protocol'

const mocks = vi.hoisted(() => ({ activeTab: vi.fn(), ask: vi.fn(), reload: vi.fn() }))
vi.mock('../src/platform', () => ({ platform: mocks }))

const READY: PageStateReply = {
  v: 1,
  phase: 'ready',
  error: null,
  page: 'supported',
  enabled: true,
  translated: 12,
  search: 'ok',
  searchMissing: [],
}
const reply = (patch: Partial<PageStateReply> = {}): PageStateReply => ({ ...READY, ...patch })
let seen: PageProbe[] = []
let watcher: ReturnType<typeof watchPage> | undefined
beforeEach(() => {
  vi.useFakeTimers()
  seen = []
  mocks.activeTab.mockResolvedValue({ id: 7, loading: false })
  mocks.reload.mockResolvedValue(undefined)
})
afterEach(() => {
  watcher?.dispose()
  watcher = undefined
  vi.useRealTimers()
  vi.resetAllMocks()
})
async function open() {
  watcher = watchPage((probe) => seen.push(probe))
  await vi.advanceTimersByTimeAsync(0)
  return watcher
}
const statuses = () => seen.map((probe) => probe.status)

it('parseReply：字段齐全且取值合法才接受；多余字段丢弃', () => {
  expect(parseReply({ ...reply(), url: 'https://beta.craftofexile.com/' })).toEqual(reply())
  expect(parseReply(reply({ phase: 'failed', error: 'dictionary' }))).toEqual(
    reply({ phase: 'failed', error: 'dictionary' }),
  )
  for (const bad of [
    null,
    undefined,
    'ready',
    1,
    {},
    { ...reply(), v: 2 },
    { ...reply(), phase: 'done' },
    { ...reply(), error: 'network' },
    { ...reply(), page: 'poe1' },
    { ...reply(), enabled: 'yes' },
    { ...reply(), translated: -1 },
    { ...reply(), translated: 1.5 },
    { ...reply(), translated: '3' },
    { ...reply(), search: 'partial' },
    { ...reply(), searchMissing: 'base' },
    { ...reply(), searchMissing: ['condition'] },
  ])
    expect(parseReply(bad), JSON.stringify(bad)).toBeNull()
})

it('已就绪的应答：先“读取中”，再给出应答并 settled；只问顶层框架一次，带协议类型与超时', async () => {
  mocks.ask.mockResolvedValue(reply())
  await open()
  expect(seen).toEqual([
    { status: 'reading' },
    { status: 'reply', tabId: 7, reply: reply(), settled: true },
  ])
  expect(mocks.ask).toHaveBeenCalledExactlyOnceWith(
    7,
    { type: PAGE_STATE_TYPE, v: 1 },
    ASK_TIMEOUT_MS,
  )
  await vi.advanceTimersByTimeAsync(20_000)
  expect(mocks.ask).toHaveBeenCalledOnce()
})

it('取不到活动标签页（或取的时候出错）：本页没有中文助手', async () => {
  mocks.activeTab.mockResolvedValueOnce(null)
  await open()
  expect(statuses()).toEqual(['reading', 'none'])
  expect(mocks.ask).not.toHaveBeenCalled()
  watcher?.dispose()
  seen = []
  mocks.activeTab.mockRejectedValueOnce(new Error('tabs unavailable'))
  await open()
  expect(statuses()).toEqual(['reading', 'none'])
})

it('页面已加载完却无应答：隔 IDLE_RETRY_MS 再问一次，仍无应答即 none，不再轮询', async () => {
  mocks.ask.mockResolvedValue(null)
  await open()
  expect(statuses()).toEqual(['reading'])
  await vi.advanceTimersByTimeAsync(IDLE_RETRY_MS - 1)
  expect(mocks.ask).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(1)
  expect(mocks.ask).toHaveBeenCalledTimes(2)
  expect(statuses()).toEqual(['reading', 'none'])
  await vi.advanceTimersByTimeAsync(20_000)
  expect(mocks.ask).toHaveBeenCalledTimes(2)
})

it('内容脚本尚未注入（document_idle 前）：第二次询问拿到应答', async () => {
  mocks.ask.mockResolvedValueOnce(null).mockResolvedValue(reply())
  await open()
  await vi.advanceTimersByTimeAsync(IDLE_RETRY_MS)
  expect(seen.at(-1)).toEqual({ status: 'reply', tabId: 7, reply: reply(), settled: true })
  expect(statuses()).toEqual(['reading', 'reply'])
})

it('不认识的协议版本按无应答处理', async () => {
  mocks.ask.mockResolvedValue({ ...reply(), v: 2 })
  await open()
  await vi.advanceTimersByTimeAsync(IDLE_RETRY_MS)
  expect(statuses()).toEqual(['reading', 'none'])
})

it('标签页加载中无应答：每 LOADING_RETRY_MS 重问，“读取中”只发一次，到 LOADING_LIMIT_MS 仍无应答即 none', async () => {
  mocks.activeTab.mockResolvedValue({ id: 7, loading: true })
  mocks.ask.mockResolvedValue(null)
  await open()
  await vi.advanceTimersByTimeAsync(LOADING_LIMIT_MS - 1)
  expect(statuses()).toEqual(['reading'])
  expect(mocks.ask).toHaveBeenCalledTimes(LOADING_LIMIT_MS / LOADING_RETRY_MS)
  await vi.advanceTimersByTimeAsync(1)
  expect(mocks.ask).toHaveBeenCalledTimes(LOADING_LIMIT_MS / LOADING_RETRY_MS + 1)
  expect(statuses()).toEqual(['reading', 'none'])
  await vi.advanceTimersByTimeAsync(20_000)
  expect(mocks.ask).toHaveBeenCalledTimes(LOADING_LIMIT_MS / LOADING_RETRY_MS + 1)
})

it('标签页加载中、新内容脚本先回答：直接采纳（不是刷新发起的，没有旧页回声）', async () => {
  mocks.activeTab.mockResolvedValue({ id: 7, loading: true })
  mocks.ask.mockResolvedValueOnce(null).mockResolvedValue(reply())
  await open()
  await vi.advanceTimersByTimeAsync(LOADING_RETRY_MS)
  expect(seen.at(-1)).toEqual({ status: 'reply', tabId: 7, reply: reply(), settled: true })
})

it('starting：settled=false 并每 SETTLE_RETRY_MS 重查，转为 ready 后 settled 并停止；相同结果不重复发出', async () => {
  const starting = reply({ phase: 'starting', translated: 0, search: 'none' })
  mocks.ask
    .mockResolvedValueOnce(starting)
    .mockResolvedValueOnce(starting)
    .mockResolvedValue(reply())
  await open()
  expect(seen.at(-1)).toEqual({ status: 'reply', tabId: 7, reply: starting, settled: false })
  await vi.advanceTimersByTimeAsync(SETTLE_RETRY_MS * 2)
  expect(seen).toEqual([
    { status: 'reading' },
    { status: 'reply', tabId: 7, reply: starting, settled: false },
    { status: 'reply', tabId: 7, reply: reply(), settled: true },
  ])
  await vi.advanceTimersByTimeAsync(20_000)
  expect(mocks.ask).toHaveBeenCalledTimes(3)
})

it('page=unknown 持续：从第一次应答起满 SETTLE_LIMIT_MS 以 settled=true 发出，然后停止', async () => {
  const unknown = reply({ page: 'unknown', translated: 0, search: 'none' })
  mocks.ask.mockResolvedValue(unknown)
  await open()
  await vi.advanceTimersByTimeAsync(SETTLE_LIMIT_MS - 1)
  expect(seen.at(-1)).toEqual({ status: 'reply', tabId: 7, reply: unknown, settled: false })
  await vi.advanceTimersByTimeAsync(1)
  expect(seen.at(-1)).toEqual({ status: 'reply', tabId: 7, reply: unknown, settled: true })
  expect(mocks.ask).toHaveBeenCalledTimes(SETTLE_LIMIT_MS / SETTLE_RETRY_MS + 1)
  await vi.advanceTimersByTimeAsync(20_000)
  expect(mocks.ask).toHaveBeenCalledTimes(SETTLE_LIMIT_MS / SETTLE_RETRY_MS + 1)
})

it('refresh：立即重查、不先显示“读取中”，并取消进行中的轮询', async () => {
  mocks.activeTab.mockResolvedValue({ id: 7, loading: true })
  mocks.ask.mockResolvedValue(null)
  const page = await open()
  await vi.advanceTimersByTimeAsync(LOADING_RETRY_MS * 2 + 200)
  const before = mocks.ask.mock.calls.length
  mocks.activeTab.mockResolvedValue({ id: 7, loading: false })
  mocks.ask.mockResolvedValue(reply({ translated: 99 }))
  page.refresh()
  await vi.advanceTimersByTimeAsync(0)
  expect(seen).toEqual([
    { status: 'reading' },
    { status: 'reply', tabId: 7, reply: reply({ translated: 99 }), settled: true },
  ])
  await vi.advanceTimersByTimeAsync(20_000)
  expect(mocks.ask).toHaveBeenCalledTimes(before + 1)
})

it('reload：刷新拿到应答的标签页；旧页卸载前的回声被忽略，出现过无应答后才采纳新页应答', async () => {
  const partial = reply({ search: 'missing', searchMissing: ['base'] })
  mocks.ask.mockResolvedValueOnce(partial)
  const page = await open()
  expect(seen.at(-1)).toEqual({ status: 'reply', tabId: 7, reply: partial, settled: true })
  mocks.activeTab.mockResolvedValue({ id: 7, loading: true })
  mocks.ask
    .mockResolvedValueOnce(partial)
    .mockResolvedValueOnce(null)
    .mockResolvedValue(reply({ translated: 30 }))
  await page.reload()
  expect(mocks.reload).toHaveBeenCalledExactlyOnceWith(7)
  expect(seen.at(-1)).toEqual({ status: 'reading' })
  await vi.advanceTimersByTimeAsync(0)
  expect(seen.at(-1)).toEqual({ status: 'reading' })
  await vi.advanceTimersByTimeAsync(LOADING_RETRY_MS)
  expect(seen.at(-1)).toEqual({ status: 'reading' })
  await vi.advanceTimersByTimeAsync(LOADING_RETRY_MS)
  expect(seen.at(-1)).toEqual({
    status: 'reply',
    tabId: 7,
    reply: reply({ translated: 30 }),
    settled: true,
  })
})

it('reload：一直有应答时，等标签页加载完才采纳', async () => {
  mocks.ask.mockResolvedValue(reply())
  const page = await open()
  mocks.activeTab
    .mockResolvedValueOnce({ id: 7, loading: true })
    .mockResolvedValue({ id: 7, loading: false })
  mocks.ask.mockResolvedValue(reply({ translated: 40 }))
  await page.reload()
  await vi.advanceTimersByTimeAsync(0)
  expect(seen.at(-1)).toEqual({ status: 'reading' })
  await vi.advanceTimersByTimeAsync(LOADING_RETRY_MS)
  expect(seen.at(-1)).toEqual({
    status: 'reply',
    tabId: 7,
    reply: reply({ translated: 40 }),
    settled: true,
  })
})

it('reload：还没拿到过应答（状态 5）时什么都不做', async () => {
  mocks.ask.mockResolvedValue(null)
  const page = await open()
  await vi.advanceTimersByTimeAsync(IDLE_RETRY_MS)
  await page.reload()
  expect(mocks.reload).not.toHaveBeenCalled()
  expect(statuses()).toEqual(['reading', 'none'])
})

it('dispose：之后不再询问，也不回调（含已发出的询问晚到）', async () => {
  let answer!: (value: unknown) => void
  mocks.activeTab.mockResolvedValue({ id: 7, loading: true })
  mocks.ask.mockImplementationOnce(
    () =>
      new Promise((done) => {
        answer = done
      }),
  )
  const page = await open()
  page.dispose()
  answer(reply())
  await vi.advanceTimersByTimeAsync(20_000)
  expect(statuses()).toEqual(['reading'])
  expect(mocks.ask).toHaveBeenCalledOnce()
})

it('本轮已拿到过应答后又无应答：按“读取中”重查到 SETTLE_LIMIT_MS，不报“本页没有中文助手”（裁定 R-T3a）', async () => {
  const unknown = reply({ page: 'unknown', translated: 0, search: 'none' })
  mocks.ask.mockResolvedValueOnce(unknown).mockResolvedValue(null)
  await open()
  expect(seen.at(-1)).toEqual({ status: 'reply', tabId: 7, reply: unknown, settled: false })
  await vi.advanceTimersByTimeAsync(SETTLE_LIMIT_MS - 1)
  expect(statuses()).not.toContain('none')
  expect(seen.at(-1)).toEqual({ status: 'reading' })
  await vi.advanceTimersByTimeAsync(1)
  // 这一页已证明是 beta 页：到点以最后一次应答 settled 发出
  expect(seen.at(-1)).toEqual({ status: 'reply', tabId: 7, reply: unknown, settled: true })
  expect(mocks.ask).toHaveBeenCalledTimes(SETTLE_LIMIT_MS / SETTLE_RETRY_MS + 1)
  await vi.advanceTimersByTimeAsync(20_000)
  expect(statuses()).not.toContain('none')
  expect(mocks.ask).toHaveBeenCalledTimes(SETTLE_LIMIT_MS / SETTLE_RETRY_MS + 1)
})

it('reload 的刷新模式进行中调用 refresh：仍忽略旧页回声，不提前采纳（裁定 R-T3b）', async () => {
  const partial = reply({ search: 'missing', searchMissing: ['base'] })
  mocks.ask.mockResolvedValueOnce(partial)
  const page = await open()
  mocks.activeTab.mockResolvedValue({ id: 7, loading: true })
  // 旧页卸载前一直回声
  mocks.ask.mockResolvedValue(partial)
  await page.reload()
  await vi.advanceTimersByTimeAsync(0)
  expect(seen.at(-1)).toEqual({ status: 'reading' })
  // 设置变化或 300 ms 补查在刷新模式中途触发
  page.refresh()
  await vi.advanceTimersByTimeAsync(0)
  expect(seen.at(-1)).toEqual({ status: 'reading' })
  mocks.ask.mockResolvedValueOnce(null).mockResolvedValue(reply({ translated: 30 }))
  await vi.advanceTimersByTimeAsync(LOADING_RETRY_MS * 2)
  expect(seen.at(-1)).toEqual({
    status: 'reply',
    tabId: 7,
    reply: reply({ translated: 30 }),
    settled: true,
  })
})

it('reload 等待浏览器刷新期间调用 refresh：不抢先询问旧页，刷新模式随后照常开始', async () => {
  mocks.ask.mockResolvedValueOnce(reply())
  const page = await open()
  let reloaded!: () => void
  mocks.reload.mockImplementationOnce(
    () =>
      new Promise<void>((done) => {
        reloaded = done
      }),
  )
  mocks.activeTab.mockResolvedValue({ id: 7, loading: true })
  mocks.ask.mockResolvedValue(reply())
  const pending = page.reload()
  page.refresh()
  await vi.advanceTimersByTimeAsync(0)
  expect(mocks.ask).toHaveBeenCalledOnce()
  expect(seen.at(-1)).toEqual({ status: 'reading' })
  reloaded()
  await pending
  await vi.advanceTimersByTimeAsync(0)
  // 刷新模式：标签页仍加载中、尚未出现无应答，回声被忽略
  expect(seen.at(-1)).toEqual({ status: 'reading' })
  expect(mocks.ask).toHaveBeenCalledTimes(2)
})

it('刷新模式采纳新页应答后结束：之后的 refresh 按普通查询处理', async () => {
  mocks.ask.mockResolvedValueOnce(reply())
  const page = await open()
  mocks.activeTab.mockResolvedValue({ id: 7, loading: true })
  mocks.ask.mockResolvedValueOnce(null).mockResolvedValue(reply({ translated: 30 }))
  await page.reload()
  await vi.advanceTimersByTimeAsync(LOADING_RETRY_MS)
  expect(seen.at(-1)).toMatchObject({ status: 'reply', reply: reply({ translated: 30 }) })
  // 标签页仍在加载（如原站继续拉资源）：普通查询直接采纳，不当作旧页回声
  mocks.ask.mockResolvedValue(reply({ translated: 31 }))
  page.refresh()
  await vi.advanceTimersByTimeAsync(0)
  expect(seen.at(-1)).toMatchObject({ status: 'reply', reply: reply({ translated: 31 }) })
})
