import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Toast } from './Toast'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Toast', () => {
  it('是一条读屏也听得到的礼貌播报，写清文件名与下一步', () => {
    render(
      <Toast message="已下载 rich.build，放进 Build Planner 目录后同名替换" onClose={vi.fn()} />,
    )
    const live = screen.getByRole('status')
    expect(live.getAttribute('aria-live')).toBe('polite')
    expect(live.textContent).toContain('已下载 rich.build')
    expect(live.textContent).toContain('同名替换')
  })

  it('可以手动关掉', () => {
    const onClose = vi.fn()
    render(<Toast message="已下载 rich.build" onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: '关闭提示' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('到点自动消失，默认 4 秒；duration 给 0 就一直留着', () => {
    vi.useFakeTimers()
    const onClose = vi.fn()
    const { unmount } = render(<Toast message="已下载 rich.build" onClose={onClose} />)
    act(() => {
      vi.advanceTimersByTime(3999)
    })
    expect(onClose).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(onClose).toHaveBeenCalledTimes(1)
    unmount()
    render(<Toast message="x" onClose={onClose} duration={0} />)
    act(() => {
      vi.advanceTimersByTime(60000)
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
