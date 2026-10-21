import { afterEach, expect, it, vi } from 'vitest'
import { installSelection } from '../src/selection/bubble'
import type { SelectionResult } from '../src/selection/protocol'

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
  range.selectNodeContents(document.querySelector('p')!)
  const selection = window.getSelection()!
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
  const root = document.querySelector('[data-poe2-selection]')!.shadowRoot!
  return { root, run, range }
}
it('选择与伪造点击零请求，真实点击才请求；只按纯文本显示', async () => {
  const { root, run } = setup()
  expect(run).not.toHaveBeenCalled()
  const start = root.querySelector<HTMLButtonElement>('[data-action="translate"]')!
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
  root.querySelector('[data-action="translate"]')!.dispatchEvent(trusted(new MouseEvent('click')))
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
  finish({ ok: true, text: '旧结果', origin: 'engine', issues: [], usage: '' })
  await Promise.resolve()
  expect(document.querySelector('[data-poe2-selection]')).toBeNull()
})
it('选区变化后不发旧文本；输入与空选区不出现翻译入口', () => {
  const { root, run } = setup()
  document.querySelector('p')!.textContent = 'Changed text'
  root.querySelector('[data-action="translate"]')!.dispatchEvent(trusted(new MouseEvent('click')))
  expect(run).not.toHaveBeenCalled()
  window.getSelection()!.removeAllRanges()
  document.dispatchEvent(trusted(new Event('pointerup')))
  expect(document.querySelector('[data-poe2-selection]')).toBeNull()
})
