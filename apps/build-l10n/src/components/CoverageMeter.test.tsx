import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CoverageMeter, type MeterCell } from './CoverageMeter'

afterEach(() => {
  cleanup()
})

const cells: MeterCell[] = [
  { domId: 'line-a-0', where: '主手 · 第 1 行', hit: true },
  { domId: 'line-a-1', where: '主手 · 第 2 行', hit: false },
  { domId: 'line-b-0', where: '戒指 2 · 第 1 行', hit: true },
]

describe('CoverageMeter', () => {
  it('一格一条编号行，整条轨有一句完整的可访问说明', () => {
    const { container } = render(<CoverageMeter cells={cells} onJump={vi.fn()} />)
    expect(container.querySelectorAll('.meter__cell')).toHaveLength(3)
    expect(container.querySelectorAll('.meter__cell--hit')).toHaveLength(2)
    expect(container.querySelectorAll('.meter__cell--miss')).toHaveLength(1)
    expect(
      screen.getByRole('group', { name: '共 3 条编号行，命中 2 条，未命中 1 条' }),
    ).toBeDefined()
  })

  it('只有未命中格进 Tab 序，命中格是装饰', () => {
    const { container } = render(<CoverageMeter cells={cells} onJump={vi.fn()} />)
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(screen.getByRole('button', { name: '跳到未命中：主手 · 第 2 行' })).toBeDefined()
    for (const hit of container.querySelectorAll('.meter__cell--hit'))
      expect(hit.getAttribute('aria-hidden')).toBe('true')
  })

  it('点未命中格跳到对应行；键盘 Enter 同样触发', () => {
    const onJump = vi.fn()
    render(<CoverageMeter cells={cells} onJump={onJump} />)
    const button = screen.getByRole('button', { name: '跳到未命中：主手 · 第 2 行' })
    fireEvent.click(button)
    expect(onJump).toHaveBeenCalledWith('line-a-1')
  })

  it('一条编号行都没有时不渲染轨', () => {
    const { container } = render(<CoverageMeter cells={[]} onJump={vi.fn()} />)
    expect(container.querySelector('.meter')).toBeNull()
  })

  it('lg / sm 各有一个修饰类，格子结构不变', () => {
    const { container } = render(<CoverageMeter cells={cells} onJump={vi.fn()} />)
    expect(container.querySelector('.meter')?.getAttribute('class')).toContain('meter--lg')
    cleanup()
    const sm = render(<CoverageMeter cells={cells} size="sm" />)
    expect(sm.container.querySelector('.meter')?.getAttribute('class')).toContain('meter--sm')
    expect(sm.container.querySelectorAll('.meter__cell')).toHaveLength(3)
  })

  it('sm 轨整条是装饰：缺口格不是按钮，也不进 Tab 序', () => {
    const { container } = render(<CoverageMeter cells={cells} size="sm" />)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    const miss = container.querySelector('.meter__cell--miss')
    expect(miss?.tagName).toBe('SPAN')
    expect(miss?.getAttribute('aria-hidden')).toBe('true')
  })

  it('label 前缀进可访问名，多条轨同页时不重名', () => {
    render(<CoverageMeter cells={cells} size="sm" label="a.build" />)
    expect(
      screen.getByRole('group', { name: 'a.build：共 3 条编号行，命中 2 条，未命中 1 条' }),
    ).toBeDefined()
  })
})
