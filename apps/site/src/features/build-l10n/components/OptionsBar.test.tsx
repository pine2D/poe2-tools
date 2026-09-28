import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OptionsBar } from './OptionsBar'

afterEach(() => {
  cleanup()
})

const base = {
  locale: 'zh-CN' as const,
  options: { bilingual: false, annotateUniques: true },
}

describe('OptionsBar', () => {
  it('点击外部或焦点移出设置时关闭，不抢回外部焦点', () => {
    render(
      <>
        <OptionsBar {...base} onLocale={vi.fn()} onOptions={vi.fn()} />
        <button type="button">外部</button>
      </>,
    )
    const trigger = screen.getByRole('button', { name: '设置' })
    fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    const outside = screen.getByRole('button', { name: '外部' })
    fireEvent.pointerDown(outside)
    act(() => outside.focus())
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(outside)
    fireEvent.click(trigger)
    act(() => outside.focus())
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })

  it('关闭面板不进入焦点序列，键盘打开和 Escape 关闭即时响应', () => {
    render(<OptionsBar {...base} onLocale={vi.fn()} onOptions={vi.fn()} />)
    const trigger = screen.getByRole('button', { name: '设置' })
    const panel = document.getElementById(trigger.getAttribute('aria-controls') ?? '')
    expect(panel?.hasAttribute('inert')).toBe(true)
    fireEvent.click(trigger, { detail: 0 })
    expect(panel?.hasAttribute('inert')).toBe(false)
    expect(panel?.getAttribute('data-motion')).toBe('false')
    expect(document.activeElement).toBe(screen.getByLabelText('导出时保留英文原行'))
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape' })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(trigger)
  })

  it('目标语言是一组单选：两个选项都直接可见，选中的那个 aria-checked', () => {
    const onLocale = vi.fn()
    render(<OptionsBar {...base} onLocale={onLocale} onOptions={vi.fn()} />)
    const group = screen.getByRole('radiogroup', { name: '目标语言' })
    expect(group).toBeDefined()
    const cn = screen.getByLabelText('简体中文（国服）') as HTMLInputElement
    const tw = screen.getByLabelText('繁体中文（台服）') as HTMLInputElement
    expect(cn.checked).toBe(true)
    expect(tw.checked).toBe(false)
    fireEvent.click(tw)
    expect(onLocale).toHaveBeenCalledWith('zh-TW')
  })

  it('两个开关的可访问名不含说明文字，说明通过 aria-describedby 关联', () => {
    render(<OptionsBar {...base} onLocale={vi.fn()} onOptions={vi.fn()} />)
    const bilingual = screen.getByLabelText('导出时保留英文原行')
    const uniques = screen.getByLabelText('补充传奇装备中文名')
    const hintId = bilingual.getAttribute('aria-describedby')
    expect(hintId).not.toBeNull()
    expect(document.getElementById(hintId ?? '')?.textContent).toContain(
      '译文下面再保留一行英文原文',
    )
    expect(
      document.getElementById(uniques.getAttribute('aria-describedby') ?? '')?.textContent,
    ).toContain('补一行中文名')
  })

  it('设置说明直接可见，Escape 关闭并把焦点交还触发器', () => {
    render(<OptionsBar {...base} onLocale={vi.fn()} onOptions={vi.fn()} />)
    const trigger = screen.getByRole('button', { name: '设置' })
    fireEvent.click(trigger)
    const input = screen.getByLabelText('导出时保留英文原行')
    const hint = document.getElementById(input.getAttribute('aria-describedby') ?? '')
    expect(hint?.className).not.toContain('visually-hidden')
    input.focus()
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(trigger)
  })

  it('勾选开关把新的选项对象交回去', () => {
    const onOptions = vi.fn()
    render(<OptionsBar {...base} onLocale={vi.fn()} onOptions={onOptions} />)
    fireEvent.click(screen.getByLabelText('导出时保留英文原行'))
    expect(onOptions).toHaveBeenCalledWith({ bilingual: true, annotateUniques: true })
    fireEvent.click(screen.getByLabelText('补充传奇装备中文名'))
    expect(onOptions).toHaveBeenCalledWith({ bilingual: false, annotateUniques: false })
  })

  it('不再自带下载按钮（下载入口在顶栏状态区，由 App 渲染）', () => {
    render(<OptionsBar {...base} onLocale={vi.fn()} onOptions={vi.fn()} />)
    expect(screen.queryByText('全部下载')).toBeNull()
  })
})
