import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EmptyState } from './EmptyState'

afterEach(() => {
  cleanup()
})

const HERO = /^英文构筑，\s*中文读懂。$/

function show(onPaste = vi.fn()) {
  return render(<EmptyState onExample={vi.fn()} onFiles={vi.fn()} onPaste={onPaste} />)
}

describe('EmptyState（spec §6.4.1）', () => {
  it('一眼说清这是什么、怎么用、文件去哪儿', () => {
    show()
    expect(screen.getByRole('heading', { level: 2, name: HERO })).toBeDefined()
    expect(screen.getByText(/攻略网站或作者提供/)).toBeDefined()
    expect(screen.getByText(/自由备注和未收录的内容保留原文/)).toBeDefined()
    expect(screen.queryByText(/在游戏.*导出/)).toBeNull()
    expect(screen.getByText('文件只在你的浏览器里解析，不会上传到任何服务器')).toBeDefined()
  })

  it('脚注不写词典版本，版本只在词典状态条（B14）', () => {
    show()
    expect(screen.queryByText(/^词典 /)).toBeNull()
  })

  it('一扇 hero 框：标题栏“导入 .build”用 <p>，hero 标题保持 h2 并带金色渐变字', () => {
    const { container } = show()
    const frame = container.querySelector('.pt-frame') as HTMLElement
    expect(frame.className).toBe('pt-frame pt-frame--hero app__empty')
    const title = frame.querySelector('.pt-titlebar__title') as HTMLElement
    expect(title.tagName).toBe('P')
    expect(title.textContent).toBe('导入 .build')
    expect(title.querySelector('.pt-ext')?.textContent).toBe('.build')
    const hero = screen.getByRole('heading', { level: 2, name: HERO })
    expect(hero.className).toBe('pt-hero-title pt-hero-title--build')
    expect(hero.querySelector('.pt-hero-title__gold')?.textContent).toBe('中文读懂。')
    expect(hero.querySelector('br')?.className).toBe('mobile-break')
  })

  it('“选择 .build 文件”是唯一的 pt-forge-btn；“试用示例构筑”是默认 pt-btn', () => {
    const { container } = show()
    const forges = container.querySelectorAll('.pt-forge-btn')
    expect(forges).toHaveLength(1)
    expect(forges[0]?.getAttribute('for')).toBe('file-input')
    expect(screen.getByLabelText('选择 .build 文件')).toBeDefined()
    expect(screen.getByRole('button', { name: '试用示例构筑' }).className).toBe('pt-btn')
  })

  it('中英示例是 pt-panel inset，两行之间是分隔线；信任说明与脚注在拖放区外', () => {
    const { container } = show()
    const example = screen.getByRole('region', { name: '词缀翻译示例' })
    expect(example.className).toBe('pt-panel pt-panel--inset app__empty-example')
    expect(example.querySelector('.pt-divider.app__ex-divider')).not.toBeNull()
    const drop = container.querySelector('.app__drop') as HTMLElement
    expect(drop.textContent).not.toContain('不会上传到任何服务器')
    const nw = [...container.querySelectorAll('.app__empty-foot .nw')].map(
      (node) => node.textContent,
    )
    expect(nw).toEqual(['单独标出', '游戏中'])
  })

  it('内嵌的是大号拖放区，粘贴入口照常工作', () => {
    const onPaste = vi.fn()
    show(onPaste)
    fireEvent.change(screen.getByLabelText('粘贴 .build 内容'), {
      target: { value: '{"name":"x"}' },
    })
    fireEvent.click(screen.getByText('添加粘贴内容'))
    expect(onPaste).toHaveBeenCalledWith('{"name":"x"}')
  })
})
