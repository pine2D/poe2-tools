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

  it('容器始终渲染，文案出现时才在容器内出现，节点不换（控制者追加 g）', () => {
    const { rerender } = render(<Toast message={null} onClose={vi.fn()} />)
    const live = screen.getByRole('status')
    expect(live.textContent).toBe('')
    rerender(<Toast message="已下载 rich.build" onClose={vi.fn()} />)
    // 同一个节点：live region 不能整块卸载重挂，否则部分读屏不会播报后续更新
    expect(screen.getByRole('status')).toBe(live)
    expect(live.textContent).toContain('已下载 rich.build')
    rerender(<Toast message={null} onClose={vi.fn()} />)
    expect(screen.getByRole('status')).toBe(live)
    expect(live.textContent).toBe('')
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

  it('连发时换文案会重新起 4 秒倒计时，不会被前一条的剩余时间打断', () => {
    vi.useFakeTimers()
    const onClose = vi.fn()
    const { rerender } = render(<Toast message="已下载 a.build" onClose={onClose} />)
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    rerender(<Toast message="已下载 b.build" onClose={onClose} />)
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(onClose).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(1500)
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
