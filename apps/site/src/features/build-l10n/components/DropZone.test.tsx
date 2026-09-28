import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DropZone } from './DropZone'

afterEach(() => {
  cleanup()
})

describe('DropZone', () => {
  it('粘贴入口默认折叠；点开后提交回调并清空', () => {
    const onPaste = vi.fn()
    const { container } = render(<DropZone onFiles={vi.fn()} onPaste={onPaste} />)
    const details = container.querySelector('details.paste') as HTMLDetailsElement | null
    expect(details).not.toBeNull()
    expect(details?.open).toBe(false)
    // happy-dom 会跟随 <summary> 点击切换 details.open（已实测），不用手工置位
    fireEvent.click(screen.getByText('或粘贴内容'))
    expect(details?.open).toBe(true)
    const box = screen.getByLabelText('粘贴 .build 内容') as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: '{"name":"x"}' } })
    fireEvent.click(screen.getByText('添加粘贴内容'))
    expect(onPaste).toHaveBeenCalledWith('{"name":"x"}')
    expect(box.value).toBe('')
  })

  it('空白内容不提交，按钮保持禁用；折叠不影响「选择 .build 文件」这条主路径', () => {
    const onPaste = vi.fn()
    render(<DropZone onFiles={vi.fn()} onPaste={onPaste} />)
    expect(screen.getByLabelText('选择 .build 文件')).toBeDefined()
    const button = screen.getByText('添加粘贴内容') as HTMLButtonElement
    expect(button.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('粘贴 .build 内容'), { target: { value: '   ' } })
    expect(button.disabled).toBe(true)
    fireEvent.click(button)
    expect(onPaste).not.toHaveBeenCalled()
  })
})
