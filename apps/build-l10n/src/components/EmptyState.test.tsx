import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EmptyState } from './EmptyState'

afterEach(() => {
  cleanup()
})

describe('EmptyState', () => {
  it('一眼说清这是什么、怎么用、文件去哪儿', () => {
    render(<EmptyState dictVersion="zh-CN 0.5（奥杜尔秘符）" onFiles={vi.fn()} onPaste={vi.fn()} />)
    expect(screen.getByRole('heading', { level: 2, name: '英文构筑，中文读懂。' })).toBeDefined()
    expect(screen.getByText(/攻略网站或作者提供/)).toBeDefined()
    expect(screen.getByText(/自由备注与未收录内容保留原文/)).toBeDefined()
    expect(screen.queryByText(/在游戏.*导出/)).toBeNull()
    expect(screen.getByText('文件只在你的浏览器里解析，不会上传到任何服务器')).toBeDefined()
    expect(screen.getByText('词典 zh-CN 0.5（奥杜尔秘符）')).toBeDefined()
  })

  it('词典还没就绪时不显示版本行，其余照常', () => {
    render(<EmptyState dictVersion={null} onFiles={vi.fn()} onPaste={vi.fn()} />)
    expect(screen.queryByText(/^词典 /)).toBeNull()
    expect(screen.getByLabelText('选择 .build 文件')).toBeDefined()
  })

  it('内嵌的是大号拖放区，粘贴入口照常工作', () => {
    const onPaste = vi.fn()
    render(<EmptyState dictVersion={null} onFiles={vi.fn()} onPaste={onPaste} />)
    fireEvent.change(screen.getByLabelText('粘贴 .build 内容'), {
      target: { value: '{"name":"x"}' },
    })
    fireEvent.click(screen.getByText('添加粘贴内容'))
    expect(onPaste).toHaveBeenCalledWith('{"name":"x"}')
  })
})
