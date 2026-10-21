import { afterEach, expect, it, vi } from 'vitest'
import { installSelection } from '../src/selection/bubble'
import type { SelectionResult } from '../src/selection/protocol'

function required<T>(value: T | null | undefined): T {
  if (value == null) throw new Error('missing fixture')
  return value
}
let dispose = () => {}
afterEach(() => {
  dispose()
  document.body.replaceChildren()
  vi.restoreAllMocks()
})
const trusted = (event: Event) => {
  Object.defineProperty(event, 'isTrusted', { value: true })
  return event
}
function setup() {
  document.body.innerHTML = '<p>Keep moving through this area.</p>'
  const range = document.createRange()
  range.selectNodeContents(required(document.querySelector('p')))
  const selection = required(window.getSelection())
  selection.removeAllRanges()
  selection.addRange(range)
  const run = vi.fn(
    async (_b, _signal): Promise<SelectionResult> => ({
      ok: true,
      text: '继续穿过这片区域。',
      origin: 'engine',
      issues: [],
      usage: '本地测试',
    }),
  )
  dispose = installSelection(document, window, run).destroy
  document.dispatchEvent(trusted(new Event('pointerup')))
  const root = required(required(document.querySelector('[data-poe2-selection]')).shadowRoot)
  return { root, run, range }
}
it('选择与伪造点击零请求，真实点击才请求；只按纯文本显示', async () => {
  const { root, run } = setup()
  expect(run).not.toHaveBeenCalled()
  const start = required(root.querySelector<HTMLButtonElement>('[data-action="translate"]'))
  start.click()
  expect(run).not.toHaveBeenCalled()
  run.mockResolvedValue({
    ok: true,
    text: '<img src=x> 继续',
    origin: 'engine',
    issues: [],
    usage: '',
  })
  start.dispatchEvent(trusted(new MouseEvent('click')))
  await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1))
  await vi.waitFor(() => expect(root.textContent).toContain('<img src=x> 继续'))
  expect(root.querySelector('img')).toBeNull()
})
it('关闭取消请求，晚到结果不能复活气泡；Esc 恢复页面', async () => {
  const { root, run } = setup()
  let finish!: (r: SelectionResult) => void
  run.mockImplementation(async (_, signal) => {
    const result = await new Promise<SelectionResult>((resolve) => {
      finish = resolve
    })
    expect(signal.aborted).toBe(true)
    return result
  })
  required(root.querySelector('[data-action="translate"]')).dispatchEvent(
    trusted(new MouseEvent('click')),
  )
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
  finish({ ok: true, text: '旧结果', origin: 'engine', issues: [], usage: '' })
  await Promise.resolve()
  expect(document.querySelector('[data-poe2-selection]')).toBeNull()
})
it('选区变化后不发旧文本；输入与空选区不出现翻译入口', () => {
  const { root, run } = setup()
  required(document.querySelector('p')).textContent = 'Changed text'
  required(root.querySelector('[data-action="translate"]')).dispatchEvent(
    trusted(new MouseEvent('click')),
  )
  expect(run).not.toHaveBeenCalled()
  required(window.getSelection()).removeAllRanges()
  document.dispatchEvent(trusted(new Event('pointerup')))
  expect(document.querySelector('[data-poe2-selection]')).toBeNull()
})

it.each(['source', 'navigation'])(
  '完成后的气泡遇到 %s 变化也会退出，不保留旧译文',
  async (reason) => {
    vi.useFakeTimers()
    const originalUrl = window.location.href
    try {
      const { root } = setup()
      root
        .querySelector('[data-action="translate"]')
        ?.dispatchEvent(trusted(new MouseEvent('click')))
      await vi.advanceTimersByTimeAsync(1)
      expect(root.querySelector('.output')?.textContent).toBe('继续穿过这片区域。')
      if (reason === 'source') document.querySelector('p')?.remove()
      else window.history.pushState({}, '', '/next-guide')
      await vi.advanceTimersByTimeAsync(500)
      expect(document.querySelector('[data-poe2-selection]')).toBeNull()
    } finally {
      dispose()
      window.history.replaceState({}, '', originalUrl)
      vi.useRealTimers()
    }
  },
)

function selectMore(text: string) {
  const p = document.createElement('p')
  p.textContent = text
  document.body.append(p)
  const range = document.createRange()
  range.selectNodeContents(p)
  const selection = required(window.getSelection())
  selection.removeAllRanges()
  selection.addRange(range)
  document.dispatchEvent(trusted(new Event('pointerup')))
  return required(
    required([...document.querySelectorAll('[data-poe2-selection]')].at(-1)).shadowRoot,
  )
}
it('并行气泡互不取消，置顶高于后创建的普通气泡，关闭只取消对应请求', async () => {
  const { root, run } = setup()
  const pending: { signal: AbortSignal; finish: (r: SelectionResult) => void }[] = []
  run.mockImplementation((_b, signal) => new Promise((finish) => pending.push({ signal, finish })))
  required(root.querySelector('[data-action=translate]')).dispatchEvent(
    trusted(new MouseEvent('click')),
  )
  required(root.querySelector('[data-action=pin]')).dispatchEvent(trusted(new MouseEvent('click')))
  const second = selectMore('Keep another useful item.')
  required(second.querySelector('[data-action=translate]')).dispatchEvent(
    trusted(new MouseEvent('click')),
  )
  expect(document.querySelectorAll('[data-poe2-selection]')).toHaveLength(2)
  expect(required(pending[0]).signal.aborted).toBe(false)
  expect(Number((root.host as HTMLElement).style.zIndex)).toBeGreaterThan(
    Number((second.host as HTMLElement).style.zIndex),
  )
  required(second.querySelector('[data-action=close]')).dispatchEvent(
    trusted(new MouseEvent('click')),
  )
  expect(required(pending[1]).signal.aborted).toBe(true)
  expect(required(pending[0]).signal.aborted).toBe(false)
  required(pending[0]).finish({
    ok: true,
    text: '保留第一段',
    origin: 'engine',
    issues: [],
    usage: '',
  })
  await vi.waitFor(() => expect(root.querySelector('.output')?.textContent).toBe('保留第一段'))
})
it('拖动/键盘移动后调整视口仍保留气泡，位置受约束且不发请求', () => {
  const { root, run } = setup()
  const handle = required(root.querySelector<HTMLElement>('[data-action=move]'))
  const host = root.host as HTMLElement
  const before = parseFloat(host.style.left)
  handle.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }),
  )
  expect(parseFloat(host.style.left)).toBeGreaterThan(before)
  handle.dispatchEvent(
    new PointerEvent('pointerdown', {
      pointerId: 1,
      button: 0,
      clientX: 100,
      clientY: 100,
      bubbles: true,
    }),
  )
  handle.dispatchEvent(
    new PointerEvent('pointermove', { pointerId: 1, clientX: -900, clientY: -900, bubbles: true }),
  )
  handle.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, bubbles: true }))
  expect(parseFloat(host.style.left)).toBe(12)
  expect(parseFloat(host.style.top)).toBe(12)
  window.dispatchEvent(new Event('resize'))
  expect(host.isConnected).toBe(true)
  expect(run).not.toHaveBeenCalled()
})
it('6 个置顶气泡满额时不删除旧结果；关闭后才接受新选区', () => {
  const { root, run } = setup()
  let current = root
  for (let i = 0; i < 6; i++) {
    if (i) current = selectMore(`Keep item number ${i}.`)
    required(current.querySelector('[data-action=pin]')).dispatchEvent(
      trusted(new MouseEvent('click')),
    )
  }
  selectMore('This seventh item must wait.')
  expect(document.querySelectorAll('[data-poe2-selection]')).toHaveLength(6)
  expect(current.textContent).toContain('请先关闭一个')
  expect(run).not.toHaveBeenCalled()
  required(root.querySelector('[data-action=close]')).dispatchEvent(
    trusted(new MouseEvent('click')),
  )
  const next = selectMore('Now the next item fits.')
  expect(next.querySelector('[data-action=translate]')).not.toBeNull()
  expect(document.querySelectorAll('[data-poe2-selection]')).toHaveLength(6)
})

it('超长选区提示置顶后也随原文失效清理，不永久占用名额', async () => {
  vi.useFakeTimers()
  try {
    setup()
    const root = selectMore('a'.repeat(6001))
    required(root.querySelector('[data-action=pin]')).dispatchEvent(
      trusted(new MouseEvent('click')),
    )
    document.body.replaceChildren()
    await vi.advanceTimersByTimeAsync(500)
    expect(document.querySelector('[data-poe2-selection]')).toBeNull()
  } finally {
    vi.useRealTimers()
  }
})
