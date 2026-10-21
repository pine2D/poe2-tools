// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPageSession } from '../src/extract/session'

function required<T>(value: T | null | undefined): T {
  if (value == null) throw Error('missing fixture')
  return value
}
const sessions: ReturnType<typeof createPageSession>[] = []
function setup(html: string) {
  document.body.innerHTML = html
  const location = {
    href: 'https://example.com/guide',
    hostname: 'example.com',
    pathname: '/guide',
  }
  const session = createPageSession(document, location)
  sessions.push(session)
  const result = session.read({ scope: 'full' })
  if (!result.ok || !result.doc.source.snapshotId) throw Error('fixture extraction failed')
  return { session, location, guide: result.doc, snapshot: result.doc.source.snapshotId }
}
const translated = (id: string) => ({
  id,
  text: '本地合成译文',
  origin: 'engine' as const,
  issues: [],
})
afterEach(() => {
  for (const session of sessions.splice(0)) session.clear()
  vi.useRealTimers()
})

describe('页面会话与原文旁对照', () => {
  it('重复原文各自挂到对应节点，重读不收译文，恢复不改变原站控件', () => {
    const { session, guide, snapshot } = setup(
      '<main><input type="checkbox" checked><p id="a">Same instructions here.</p><p id="b">Same instructions here.</p></main>',
    )
    const original = document.body.innerHTML
    expect(session.render(snapshot, translated(required(guide.blocks[1]).id)).state).toBe('inline')
    expect(document.querySelector('#a')?.nextElementSibling?.id).toBe('b')
    const host = document.querySelector('#b > [data-poe2-guide-owned]')
    expect(host?.hasAttribute('data-poe2-guide-owned')).toBe(true)
    expect(host?.shadowRoot?.textContent).toContain('本地合成译文')
    expect(document.querySelector('input')?.checked).toBe(true)
    session.setMode('sidebar')
    expect((host as HTMLElement).hidden).toBe(true)
    session.setMode('inline')
    expect((host as HTMLElement).hidden).toBe(false)
    const again = session.read({ scope: 'full' })
    expect(again.ok && again.doc.blocks.map((b) => b.text)).toEqual(guide.blocks.map((b) => b.text))
    expect(session.render(snapshot, translated(required(guide.blocks[0]).id)).state).toBe('stale')
    session.clear()
    expect(document.body.innerHTML).toBe(original)
  })
  it('替换为相同文字的新节点也拒绝旧定位，不靠文字猜位置', () => {
    const { session, guide, snapshot } = setup(
      '<main><p>Repeat original.</p><p>Repeat original.</p></main>',
    )
    const first = required(document.querySelector('p'))
    first.replaceWith(first.cloneNode(true))
    expect(session.locate(snapshot, required(guide.blocks[0]).id).state).toBe('stale')
    expect(session.render(snapshot, translated(required(guide.blocks[0]).id)).state).toBe('stale')
    expect(document.querySelectorAll('[data-poe2-guide-owned]')).toHaveLength(0)
  })
  it('内容变动清理译文，SPA地址变化阻止旧结果', async () => {
    const { session, guide, snapshot, location } = setup(
      '<main><p>Original instructions here.</p></main>',
    )
    session.render(snapshot, translated(required(guide.blocks[0]).id))
    required(required(document.querySelector('p')).firstChild).textContent = 'Changed source.'
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(document.querySelector('[data-poe2-guide-owned]')).toBeNull()
    expect(session.status().changedIds).toContain(required(guide.blocks[0]).id)
    location.href = 'https://example.com/new'
    expect(session.locate(snapshot, required(guide.blocks[0]).id).state).toBe('stale')
  })
  it('表格和交互标签使用侧栏，普通链接不被替换', () => {
    const { session, guide, snapshot } = setup(
      '<main><label>Choose this option.</label><table><tr><td>Cell instructions.</td></tr></table><p>Visit <a href="/next">next guide</a>.</p></main>',
    )
    const link = document.querySelector('a')
    const click = vi.fn()
    link?.addEventListener('click', click)
    expect(
      session.render(
        snapshot,
        translated(required(guide.blocks.find((b) => b.text.startsWith('Choose'))).id),
      ).state,
    ).toBe('sidebar')
    expect(
      session.render(
        snapshot,
        translated(required(guide.blocks.find((b) => b.kind === 'table-cell')).id),
      ).state,
    ).toBe('sidebar')
    expect(session.render(snapshot, translated(required(guide.blocks.at(-1)).id)).state).toBe(
      'inline',
    )
    expect(document.querySelector('a')).toBe(link)
    link?.dispatchEvent(new MouseEvent('click'))
    expect(click).toHaveBeenCalledOnce()
  })
  it('点选区域取消和超时均清理，确认不触发原站click', async () => {
    vi.useFakeTimers()
    const { session } = setup(
      '<main><section><h2>Zone</h2><p>Only this region.</p></section></main>',
    )
    const canceled = session.pickRegion()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(await canceled).toBeNull()
    expect(document.querySelector('[data-poe2-guide-owned]')).toBeNull()
    const expired = session.pickRegion()
    await vi.advanceTimersByTimeAsync(30000)
    expect(await expired).toBeNull()
    const picked = session.pickRegion()
    const clicked = vi.fn()
    document.querySelector('p')?.addEventListener('click', clicked)
    document
      .querySelector('p')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    const result = await picked
    expect(result?.ok && result.doc.source.scope).toBe('region')
    expect(result?.ok && result.doc.blocks.map((b) => b.text)).toEqual([
      'Zone',
      'Only this region.',
    ])
    expect(clicked).not.toHaveBeenCalled()
    expect(document.querySelector('[data-poe2-guide-owned]')).toBeNull()
  })
})

it('同一页面快速改选章节后，晚到旧修订译文和清理都不能影响新修订', () => {
  const { session, guide, snapshot } = setup('<main><p>Original instructions here.</p></main>')
  const id = required(guide.blocks[0]).id
  session.reset(snapshot, '1')
  session.reset(snapshot, '2')
  expect(session.render(snapshot, { ...translated(id), revision: '1' }).state).toBe('stale')
  expect(session.render(snapshot, { ...translated(id), revision: '2' }).state).toBe('inline')
  session.reset(snapshot, '1')
  session.remove(snapshot, id, '1')
  expect(document.querySelector('[data-poe2-guide-owned="translation"]')).not.toBeNull()
})

it.each([
  '<p>Visible start <span class="reading-hidden">Hidden private text.</span> visible end.</p>',
  '<p>Visible start visible end.</p><p class="reading-hidden">Hidden private text.</p>',
])('选区只提取原页面可见内容，隐藏副本不使会话失效：%s', (content) => {
  const style = document.createElement('style')
  style.textContent = '.reading-hidden { display: none }'
  document.head.append(style)
  try {
    const { session } = setup(`<main>${content}</main>`)
    const original = document.body.innerHTML
    const range = document.createRange()
    range.selectNodeContents(required(document.querySelector('main')))
    const selection = required(document.getSelection())
    selection.removeAllRanges()
    selection.addRange(range)
    const selected = session.read({ scope: 'selection' })
    expect(selected.ok && selected.doc.blocks.map((b) => b.text)).toEqual([
      'Visible start visible end.',
    ])
    expect(session.status().stale).toBe(false)
    expect(document.body.innerHTML).toBe(original)
  } finally {
    style.remove()
    document.getSelection()?.removeAllRanges()
  }
})

it('共享容器的独立正文片段按真实节点顺序显示，避免倒序与错误对应', () => {
  const { session, guide, snapshot } = setup(
    '<main><div>First instructions.<span style="display:block">Middle instructions.</span>Last instructions.</div><p>Separate instructions.</p></main>',
  )
  expect(guide.blocks.map((b) => b.text)).toEqual([
    'First instructions.',
    'Middle instructions.',
    'Last instructions.',
    'Separate instructions.',
  ])
  for (const b of guide.blocks.slice(0, 3))
    expect(session.render(snapshot, translated(b.id)).state).toBe('inline')
  expect(session.render(snapshot, translated(required(guide.blocks[3]).id)).state).toBe('inline')
  expect(
    [...document.querySelectorAll('[data-poe2-guide-owned="translation"]')].map((el) =>
      el.getAttribute('data-block-id'),
    ),
  ).toEqual(guide.blocks.map((b) => b.id))
})

it('网格卡片译文留在原格内，带链接/复选框的独立文字可安全落点', async () => {
  const { session, guide, snapshot } = setup(
    '<main><section style="display:grid;grid-template-columns:1fr 1fr"><p id="card">Visit <a href="/next">the next zone</a>.</p><div><label><input type="checkbox">Done</label><p id="body">Collect the permanent reward.</p></div></section></main>',
  )
  const original = document.body.innerHTML
  const text = required(document.querySelector('#card')).firstChild
  const link = document.querySelector('a')
  const p = guide.blocks.find((b) => b.text.startsWith('Visit'))
  expect(session.render(snapshot, translated(required(p).id)).state).toBe('inline')
  expect(document.querySelector('#card > [data-poe2-guide-owned]')).not.toBeNull()
  expect(required(document.querySelector('section')).children).toHaveLength(2)
  expect(document.querySelector('#card')?.firstChild).toBe(text)
  expect(document.querySelector('a')).toBe(link)
  await new Promise((r) => setTimeout(r, 0))
  expect(session.status().stale).toBe(false)
  session.clear()
  expect(document.body.innerHTML).toBe(original)
})
it('失败提示与合格译文共享同一安全锚点，恢复仅移除扩展内容', () => {
  const { session, guide, snapshot } = setup('<main><p>Read the first paragraph.</p></main>')
  const id = required(guide.blocks[0]).id
  expect(session.notice(snapshot, { id, message: '翻译失败，请在侧栏重试' }).state).toBe('inline')
  expect(document.querySelector('[data-poe2-guide-owned]')?.shadowRoot?.textContent).toContain(
    '翻译失败',
  )
  session.render(snapshot, translated(id))
  expect(document.querySelectorAll('[data-poe2-guide-owned]')).toHaveLength(1)
  expect(document.querySelector('[data-poe2-guide-owned]')?.shadowRoot?.textContent).not.toContain(
    '翻译失败',
  )
})
it('链接卡片的独立标题在卡片内显示，点击仍交给原链接', () => {
  const { session, guide, snapshot } = setup(
    '<main><a class="card" href="/next"><h2>Next zone</h2><p>Read these instructions first.</p></a></main>',
  )
  const link = required(document.querySelector('a'))
  const click = vi.fn((event: Event) => event.preventDefault())
  link.addEventListener('click', click)
  for (const b of guide.blocks)
    expect(session.render(snapshot, translated(b.id)).state).toBe('inline')
  expect(document.querySelector('a')).toBe(link)
  expect(link.getAttribute('href')).toBe('/next')
  link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  expect(click).toHaveBeenCalledOnce()
})
