import { afterEach, expect, it, vi } from 'vitest'
import { setupSelectionButton } from '../src/popup/selection-button'

const html =
  '<button id="selection" hidden>启用本页划词</button><p id="selection-notice" hidden></p>'
afterEach(() => {
  document.body.textContent = ''
})
type Reply = { ok: boolean; enabled?: boolean }
function api(selection: (id: number, action: 'status' | 'enable' | 'disable') => Promise<Reply>) {
  return { activeTab: vi.fn(async () => ({ id: 3 })), selection }
}

it('请求期间用 aria-disabled 保留焦点，忽略重复点击；不带 aria-pressed', async () => {
  document.body.innerHTML = html
  let done: (v: Reply) => void = () => {}
  const selection = vi.fn((_id: number, action: 'status' | 'enable' | 'disable') =>
    action === 'status'
      ? Promise.resolve({ ok: true, enabled: true })
      : new Promise<Reply>((r) => {
          done = r
        }),
  )
  await setupSelectionButton(document, api(selection), vi.fn())
  const button = document.querySelector<HTMLButtonElement>('#selection')
  expect(button?.textContent).toBe('关闭本页划词')
  expect(button?.hasAttribute('aria-pressed')).toBe(false)
  button?.focus()
  button?.click()
  button?.click()
  expect(selection).toHaveBeenCalledTimes(2) // status + 一次 disable
  expect(button?.disabled).toBe(false)
  expect(button?.getAttribute('aria-disabled')).toBe('true')
  expect(document.activeElement).toBe(button)
  done({ ok: true, enabled: false })
  await vi.waitFor(() => expect(button?.hasAttribute('aria-disabled')).toBe(false))
  expect(button?.textContent).toBe('启用本页划词')
  expect(document.activeElement).toBe(button)
})
