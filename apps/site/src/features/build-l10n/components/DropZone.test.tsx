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
    const details = container.querySelector('details.app__paste') as HTMLDetailsElement | null
    expect(details).not.toBeNull()
    expect(details?.open).toBe(false)
    expect(details?.querySelector('summary')?.className).toBe('pt-textbtn')
    // happy-dom 会跟随 <summary> 点击切换 details.open（已实测），不用手工置位
    fireEvent.click(screen.getByText('或粘贴内容'))
    expect(details?.open).toBe(true)
    const box = screen.getByLabelText('粘贴 .build 内容') as HTMLTextAreaElement
    expect(box.className).toBe('pt-textarea')
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
    expect(button.className).toBe('pt-btn pt-btn--quiet')
    fireEvent.change(screen.getByLabelText('粘贴 .build 内容'), { target: { value: '   ' } })
    expect(button.disabled).toBe(true)
    fireEvent.click(button)
    expect(onPaste).not.toHaveBeenCalled()
  })

  it('rail：侧栏紧凑态只有 quiet --block 的“选择 .build 文件”与折叠（spec §6.4.2）', () => {
    const { container } = render(<DropZone onFiles={vi.fn()} onPaste={vi.fn()} />)
    const zone = screen.getByRole('region', { name: '文件输入' })
    expect(zone.className).toBe('pt-droprail app__rail')
    const label = container.querySelector('label[for="file-input"]') as HTMLElement
    expect(label.className).toBe('pt-btn pt-btn--quiet pt-btn--block')
    expect(container.querySelector('.app__drop-title')).toBeNull()
    expect(container.querySelector('.pt-forge-btn')).toBeNull()
  })

  it('hero（词典失败）：默认 pt-btn，提示行与信任说明留在拖放区内', () => {
    const { container } = render(<DropZone variant="hero" onFiles={vi.fn()} onPaste={vi.fn()} />)
    expect(screen.getByRole('region', { name: '文件输入' }).className).toBe('pt-dropzone app__drop')
    expect((container.querySelector('label[for="file-input"]') as HTMLElement).className).toBe(
      'pt-btn',
    )
    expect(screen.getByText('支持一次拖入多个文件 · 也可以粘贴文件内容')).toBeDefined()
    expect(screen.getByText('文件只在你的浏览器里解析，不会上传到任何服务器')).toBeDefined()
  })

  it('hero + forge（构筑空态）：“选择 .build 文件”是 pt-forge-btn label，信任说明不在拖放区内', () => {
    const { container } = render(
      <DropZone variant="hero" forge onFiles={vi.fn()} onPaste={vi.fn()} />,
    )
    const label = container.querySelector('label[for="file-input"]') as HTMLElement
    expect(label.className).toBe('pt-forge-btn')
    expect(label.querySelector('.pt-ext')?.textContent).toBe('.build')
    expect(screen.getByLabelText('选择 .build 文件')).toBeDefined()
    expect(screen.queryByText('文件只在你的浏览器里解析，不会上传到任何服务器')).toBeNull()
  })

  it('拖入时边色换档、图标与文案换成“松手即可导入”', () => {
    render(<DropZone variant="hero" onFiles={vi.fn()} onPaste={vi.fn()} />)
    const zone = screen.getByRole('region', { name: '文件输入' })
    fireEvent.dragOver(zone)
    expect(zone.className).toBe('pt-dropzone pt-dropzone--over app__drop')
    expect(screen.getByText('松手即可导入')).toBeDefined()
    fireEvent.dragLeave(zone)
    expect(zone.className).toBe('pt-dropzone app__drop')
  })
})
