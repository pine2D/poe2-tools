import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
    const bilingual = screen.getByLabelText('双语（保留英文原行）')
    const uniques = screen.getByLabelText('传奇名注入')
    const hintId = bilingual.getAttribute('aria-describedby')
    expect(hintId).not.toBeNull()
    expect(document.getElementById(hintId ?? '')?.textContent).toContain(
      '译文下面再保留一行英文原文',
    )
    expect(
      document.getElementById(uniques.getAttribute('aria-describedby') ?? '')?.textContent,
    ).toContain('补一行中文名')
  })

  it('ⓘ 对明眼用户也有反馈：整个开关带原生 title 提示', () => {
    render(<OptionsBar {...base} onLocale={vi.fn()} onOptions={vi.fn()} />)
    const opt = screen.getByLabelText('双语（保留英文原行）').closest('.opt')
    expect(opt?.getAttribute('title')).toContain('译文下面再保留一行英文原文')
  })

  it('勾选开关把新的选项对象交回去', () => {
    const onOptions = vi.fn()
    render(<OptionsBar {...base} onLocale={vi.fn()} onOptions={onOptions} />)
    fireEvent.click(screen.getByLabelText('双语（保留英文原行）'))
    expect(onOptions).toHaveBeenCalledWith({ bilingual: true, annotateUniques: true })
    fireEvent.click(screen.getByLabelText('传奇名注入'))
    expect(onOptions).toHaveBeenCalledWith({ bilingual: false, annotateUniques: false })
  })

  it('不再自带下载按钮（下载入口在顶栏状态区，由 App 渲染）', () => {
    render(<OptionsBar {...base} onLocale={vi.fn()} onOptions={vi.fn()} />)
    expect(screen.queryByText('全部下载')).toBeNull()
  })
})
