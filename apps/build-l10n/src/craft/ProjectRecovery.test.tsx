import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ProjectRecovery } from './ProjectRecovery'
import { RECOVERY_KEY, readRecovery } from './projectRecovery'

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request: async (_key: string, action: () => unknown) => action(),
    },
  })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  Reflect.deleteProperty(navigator, 'locks')
})
const text = '{"project":"complete future"}'
const getText = () => ({ ok: true as const, value: text })
const record = (value: string) =>
  JSON.stringify({ version: 1, savedAt: '2026-09-18T00:00:00.000Z', text: value })
const advance = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(600)
  })
it('等待稳定后自动保存，卸载后的待写更新不覆盖最后成功记录', async () => {
  const props = { project: {}, getText, onRestoreText: vi.fn() }
  const view = render(<ProjectRecovery {...props} />)
  expect(localStorage.getItem(RECOVERY_KEY)).toBeNull()
  await advance()
  expect(readRecovery(localStorage.getItem(RECOVERY_KEY))?.text).toBe(text)
  view.rerender(
    <ProjectRecovery {...props} project={{}} getText={() => ({ ok: true, value: 'new' })} />,
  )
  view.unmount()
  await advance()
  expect(readRecovery(localStorage.getItem(RECOVERY_KEY))?.text).toBe(text)
})
it('首次打开不覆盖已有进度，恢复读取原记录，替换须明确点击', async () => {
  const old = record('old')
  localStorage.setItem(RECOVERY_KEY, old)
  const onRestoreText = vi.fn()
  render(<ProjectRecovery project={{}} getText={getText} onRestoreText={onRestoreText} />)
  await advance()
  expect(localStorage.getItem(RECOVERY_KEY)).toBe(old)
  fireEvent.click(screen.getByRole('button', { name: '恢复自动保存的演练' }))
  expect(onRestoreText).toHaveBeenCalledWith('old')
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '用当前演练替换自动恢复记录' }))
  })
  expect(readRecovery(localStorage.getItem(RECOVERY_KEY))?.text).toBe(text)
})
it('空白入口仍可恢复；坏记录和无效项目不会自动写入', async () => {
  localStorage.setItem(RECOVERY_KEY, '{broken')
  const props = {
    getText: () => ({ ok: false as const, error: '项目核对失败' }),
    onRestoreText: vi.fn(),
  }
  const view = render(<ProjectRecovery {...props} />)
  expect(screen.queryByRole('button', { name: '用当前演练替换自动恢复记录' })).toBeNull()
  await advance()
  expect(localStorage.getItem(RECOVERY_KEY)).toBe('{broken')
  view.rerender(<ProjectRecovery {...props} project={{}} />)
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '用当前演练替换自动恢复记录' }))
  })
  expect(screen.getByText('项目核对失败')).toBeDefined()
  expect(localStorage.getItem(RECOVERY_KEY)).toBe('{broken')
})
it('其他标签页更新后暂停，不恢复未显示的新记录', async () => {
  const onRestoreText = vi.fn()
  render(<ProjectRecovery project={{}} getText={getText} onRestoreText={onRestoreText} />)
  await advance()
  const foreign = record('foreign')
  localStorage.setItem(RECOVERY_KEY, foreign)
  fireEvent(window, new StorageEvent('storage', { key: RECOVERY_KEY }))
  await advance()
  expect(localStorage.getItem(RECOVERY_KEY)).toBe(foreign)
  localStorage.setItem(RECOVERY_KEY, record('newer'))
  fireEvent.click(screen.getByRole('button', { name: '恢复自动保存的演练' }))
  expect(onRestoreText).not.toHaveBeenCalled()
})

it('存储失败明确暂停并保留旧记录，不循环自动重试', async () => {
  const storage = window.localStorage
  const set = vi.fn(() => {
    throw new Error('quota')
  })
  vi.spyOn(window, 'localStorage', 'get').mockReturnValue({
    length: storage.length,
    key: storage.key.bind(storage),
    clear: storage.clear.bind(storage),
    removeItem: storage.removeItem.bind(storage),
    getItem: storage.getItem.bind(storage),
    setItem: set,
  })
  render(<ProjectRecovery project={{}} getText={getText} onRestoreText={vi.fn()} />)
  await advance()
  expect(screen.getByText(/自动保存失败/)).toBeDefined()
  await advance()
  expect(set).toHaveBeenCalledTimes(1)
})
it('隐藏页面立即尝试保存，恢复同一项目后继续自动保存', async () => {
  const old = record(text)
  localStorage.setItem(RECOVERY_KEY, old)
  const view = render(<ProjectRecovery project={{}} getText={getText} onRestoreText={vi.fn()} />)
  await advance()
  expect(localStorage.getItem(RECOVERY_KEY)).toBe(old)
  view.rerender(
    <ProjectRecovery
      project={{}}
      getText={() => ({ ok: true, value: 'updated' })}
      onRestoreText={vi.fn()}
    />,
  )
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
  await act(async () => {
    fireEvent(document, new Event('visibilitychange'))
  })
  expect(readRecovery(localStorage.getItem(RECOVERY_KEY))?.text).toBe('updated')
})
it('等待存储锁期间更新项目，只能写入仍有效的最后一份状态', async () => {
  const actions: (() => void)[] = []
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request: (_name: string, action: () => unknown) =>
        new Promise((resolve) => {
          actions.push(() => resolve(action()))
        }),
    },
  })
  const props = { getText, onRestoreText: vi.fn() }
  const view = render(<ProjectRecovery {...props} project={{}} />)
  await advance()
  view.rerender(
    <ProjectRecovery {...props} project={{}} getText={() => ({ ok: true, value: 'latest' })} />,
  )
  await advance()
  await act(async () => {
    for (const action of actions) action()
  })
  expect(readRecovery(localStorage.getItem(RECOVERY_KEY))?.text).toBe('latest')
})

it('目录或词典上下文变化使等待锁的旧序列化结果失效', async () => {
  const actions: (() => void)[] = []
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request: (_name: string, action: () => unknown) =>
        new Promise((resolve) => {
          actions.push(() => resolve(action()))
        }),
    },
  })
  const props = { project: {}, getText, onRestoreText: vi.fn() }
  const view = render(<ProjectRecovery {...props} context={{ dictionary: 'old' }} />)
  await advance()
  view.rerender(
    <ProjectRecovery
      {...props}
      context={{ dictionary: 'new' }}
      getText={() => ({ ok: false, error: '新目录校验失败' })}
    />,
  )
  await act(async () => {
    for (const action of actions) action()
  })
  await advance()
  expect(localStorage.getItem(RECOVERY_KEY)).toBeNull()
  expect(screen.getByText('新目录校验失败')).toBeDefined()
})

it('连续编辑不提前回放完整历史，仅稳定后的保存校验一次', async () => {
  const serialize = vi.fn(getText)
  const props = { getText: serialize, onRestoreText: vi.fn() }
  const view = render(<ProjectRecovery {...props} project={{}} />)
  view.rerender(<ProjectRecovery {...props} project={{}} />)
  view.rerender(<ProjectRecovery {...props} project={{}} />)
  expect(serialize).not.toHaveBeenCalled()
  await advance()
  expect(serialize).toHaveBeenCalledTimes(1)
  view.rerender(<ProjectRecovery {...props} project={{}} />)
  expect(serialize).toHaveBeenCalledTimes(1)
  await advance()
  expect(serialize).toHaveBeenCalledTimes(2)
})
