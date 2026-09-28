import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isTypingTarget, useHotkeys } from './useHotkeys'

afterEach(() => {
  cleanup()
})

function Harness({ next, toggleFilter }: { next(): void; toggleFilter(): void }) {
  useHotkeys({ next, toggleFilter })
  return (
    <div>
      <input aria-label="打字用" />
      <textarea aria-label="粘贴用" />
      <button type="button">别的按钮</button>
    </div>
  )
}

describe('useHotkeys', () => {
  it('N 调 next，F 调 toggleFilter，大小写都认', () => {
    const next = vi.fn()
    const toggleFilter = vi.fn()
    render(<Harness next={next} toggleFilter={toggleFilter} />)
    fireEvent.keyDown(window, { key: 'n' })
    fireEvent.keyDown(window, { key: 'N' })
    fireEvent.keyDown(window, { key: 'f' })
    expect(next).toHaveBeenCalledTimes(2)
    expect(toggleFilter).toHaveBeenCalledTimes(1)
  })

  it('焦点在输入框里时一律不触发——用户在打字', () => {
    const next = vi.fn()
    const toggleFilter = vi.fn()
    render(<Harness next={next} toggleFilter={toggleFilter} />)
    fireEvent.keyDown(screen.getByLabelText('打字用'), { key: 'n' })
    fireEvent.keyDown(screen.getByLabelText('粘贴用'), { key: 'f' })
    expect(next).not.toHaveBeenCalled()
    expect(toggleFilter).not.toHaveBeenCalled()
    // 普通按钮上按键仍然生效：只挡真正的输入控件
    fireEvent.keyDown(screen.getByText('别的按钮'), { key: 'n' })
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('带 Ctrl / Meta / Alt 的组合键放行给浏览器', () => {
    const next = vi.fn()
    render(<Harness next={next} toggleFilter={vi.fn()} />)
    fireEvent.keyDown(window, { key: 'n', ctrlKey: true })
    fireEvent.keyDown(window, { key: 'n', metaKey: true })
    fireEvent.keyDown(window, { key: 'n', altKey: true })
    expect(next).not.toHaveBeenCalled()
  })

  it('输入法组合期不触发：中文输入法按 n 先进候选框', () => {
    const next = vi.fn()
    render(<Harness next={next} toggleFilter={vi.fn()} />)
    fireEvent.keyDown(window, { key: 'n', isComposing: true })
    fireEvent.keyDown(window, { key: 'Process' })
    expect(next).not.toHaveBeenCalled()
  })

  it('长按不连跳：autorepeat 的 keydown 一概忽略', () => {
    const next = vi.fn()
    const toggleFilter = vi.fn()
    render(<Harness next={next} toggleFilter={toggleFilter} />)
    // 按住 N 不放，浏览器会按系统重复率连发 keydown（event.repeat === true）。不挡的话
    // 游标一秒跳掉几十处未命中，松手时用户早已不知道自己停在哪一行。
    fireEvent.keyDown(window, { key: 'n', repeat: true })
    fireEvent.keyDown(window, { key: 'f', repeat: true })
    expect(next).not.toHaveBeenCalled()
    expect(toggleFilter).not.toHaveBeenCalled()
    // 第一下（repeat 为 false）照常触发
    fireEvent.keyDown(window, { key: 'n' })
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('别的键一概不管，卸载后不再监听', () => {
    const next = vi.fn()
    const { unmount } = render(<Harness next={next} toggleFilter={vi.fn()} />)
    fireEvent.keyDown(window, { key: 'j' })
    expect(next).not.toHaveBeenCalled()
    unmount()
    fireEvent.keyDown(window, { key: 'n' })
    expect(next).not.toHaveBeenCalled()
  })
})

describe('isTypingTarget', () => {
  it('认得三种输入控件与 contenteditable，其它一律不是', () => {
    const editable = document.createElement('div')
    editable.contentEditable = 'true'
    document.body.append(editable)
    for (const tag of ['input', 'textarea', 'select']) {
      expect(isTypingTarget(document.createElement(tag))).toBe(true)
    }
    expect(isTypingTarget(editable)).toBe(true)
    expect(isTypingTarget(document.createElement('div'))).toBe(false)
    expect(isTypingTarget(null)).toBe(false)
    editable.remove()
  })
})
