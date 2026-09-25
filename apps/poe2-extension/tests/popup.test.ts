import { afterEach, expect, it, vi } from 'vitest'

const storage = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn(), subscribe: vi.fn() }))
vi.mock('../src/platform', () => ({ platform: storage }))
afterEach(() => {
  vi.resetModules()
  vi.resetAllMocks()
  document.body.innerHTML = ''
})
async function setup() {
  document.body.innerHTML =
    '<input id="enabled" type="checkbox"><input id="bilingual" type="checkbox"><p id="status"></p>'
  storage.read.mockResolvedValue({ enabled: true, bilingual: false })
  await import('../src/popup/index')
  await vi.waitFor(() =>
    expect(document.querySelector<HTMLInputElement>('#enabled')?.disabled).toBe(false),
  )
  return {
    enabled: document.querySelector('#enabled') as HTMLInputElement,
    bilingual: document.querySelector('#bilingual') as HTMLInputElement,
  }
}
it('保存中禁用控件，失败恢复已保存值，再次操作可成功', async () => {
  const { enabled, bilingual } = await setup()
  let reject!: (error: Error) => void
  storage.write.mockImplementationOnce(
    () =>
      new Promise((_resolve, fail) => {
        reject = fail
      }),
  )
  enabled.checked = false
  enabled.dispatchEvent(new Event('change'))
  expect(enabled.disabled).toBe(true)
  expect(bilingual.disabled).toBe(true)
  reject(new Error('storage failed'))
  await vi.waitFor(() => expect(enabled.disabled).toBe(false))
  expect(enabled.checked).toBe(true)
  expect(document.querySelector('#status')?.textContent).toContain('未保存')
  storage.write.mockResolvedValue(undefined)
  bilingual.checked = true
  bilingual.dispatchEvent(new Event('change'))
  await vi.waitFor(() => expect(bilingual.disabled).toBe(false))
  expect(storage.write).toHaveBeenLastCalledWith({ enabled: true, bilingual: true })
  expect(document.querySelector('#status')?.textContent).toContain('已保存')
})
it('停用翻译时保留中英对照偏好但禁用其开关', async () => {
  const { enabled, bilingual } = await setup()
  storage.write.mockResolvedValue(undefined)
  enabled.checked = false
  enabled.dispatchEvent(new Event('change'))
  await vi.waitFor(() => expect(enabled.disabled).toBe(false))
  expect(bilingual.disabled).toBe(true)
  expect(document.querySelector('#status')?.textContent).toContain('已关闭')
})

it('已打开的弹窗同步其他窗口的设置，后续保存不覆盖新偏好', async () => {
  const { enabled, bilingual } = await setup()
  const update = storage.subscribe.mock.calls[0]?.[0]
  expect(update).toBeTypeOf('function')
  update({ enabled: false, bilingual: true })
  expect(enabled.checked).toBe(false)
  expect(bilingual.checked).toBe(true)
  expect(bilingual.disabled).toBe(true)
  expect(document.querySelector('#status')?.textContent).toContain('已关闭')
  storage.write.mockResolvedValue(undefined)
  enabled.checked = true
  enabled.dispatchEvent(new Event('change'))
  await vi.waitFor(() => expect(enabled.disabled).toBe(false))
  expect(storage.write).toHaveBeenLastCalledWith({ enabled: true, bilingual: true })
})
it('保存期间收到外部设置仍保持锁定，失败恢复最近保存的设置', async () => {
  const { enabled, bilingual } = await setup()
  let reject!: (error: Error) => void
  storage.write.mockImplementationOnce(
    () =>
      new Promise((_resolve, fail) => {
        reject = fail
      }),
  )
  enabled.checked = false
  enabled.dispatchEvent(new Event('change'))
  const update = storage.subscribe.mock.calls[0]?.[0]
  expect(update).toBeTypeOf('function')
  update({ enabled: true, bilingual: true })
  expect(enabled.disabled).toBe(true)
  expect(bilingual.disabled).toBe(true)
  expect(document.querySelector('#status')?.textContent).toBe('正在保存…')
  reject(new Error('storage failed'))
  await vi.waitFor(() => expect(enabled.disabled).toBe(false))
  expect(enabled.checked).toBe(true)
  expect(bilingual.checked).toBe(true)
})

it('启动先监听变化，晚返回的读取结果不能覆盖较新事件', async () => {
  document.body.innerHTML =
    '<input id="enabled" type="checkbox"><input id="bilingual" type="checkbox"><p id="status"></p>'
  let resolve!: (value: { enabled: boolean; bilingual: boolean }) => void
  storage.read.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  await import('../src/popup/index')
  expect(storage.subscribe).toHaveBeenCalledOnce()
  storage.subscribe.mock.calls[0]?.[0]({ enabled: false, bilingual: true })
  resolve({ enabled: true, bilingual: false })
  await vi.waitFor(() =>
    expect(document.querySelector<HTMLInputElement>('#enabled')?.disabled).toBe(false),
  )
  expect(document.querySelector<HTMLInputElement>('#enabled')?.checked).toBe(false)
  expect(document.querySelector<HTMLInputElement>('#bilingual')?.checked).toBe(true)
  expect(document.querySelector('#status')?.textContent).toContain('已关闭')
})
it('保存完成回执不覆盖等待期间收到的较新已保存事件', async () => {
  const { enabled, bilingual } = await setup()
  let resolve!: () => void
  storage.write.mockImplementationOnce(
    () =>
      new Promise<void>((done) => {
        resolve = done
      }),
  )
  bilingual.checked = true
  bilingual.dispatchEvent(new Event('change'))
  const update = storage.subscribe.mock.calls[0]?.[0]
  update({ enabled: true, bilingual: true })
  update({ enabled: false, bilingual: true })
  resolve()
  await vi.waitFor(() => expect(enabled.disabled).toBe(false))
  expect(enabled.checked).toBe(false)
  expect(bilingual.checked).toBe(true)
  expect(bilingual.disabled).toBe(true)
  expect(document.querySelector('#status')?.textContent).toContain('已关闭')
})
