import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PtTabs, ptTabId } from './PtTabs'

afterEach(cleanup)

type Key = 'gear' | 'skills' | 'passives'
const TABS = [
  { key: 'gear', label: '装备', count: 4 },
  { key: 'skills', label: '技能', count: 2 },
  { key: 'passives', label: '天赋', count: 3 },
] as const

function Harness({ spy }: { spy?: (key: Key) => void }) {
  const [selected, setSelected] = useState<Key>('gear')
  return (
    <PtTabs
      tabs={TABS}
      selected={selected}
      onSelect={(key) => {
        setSelected(key)
        spy?.(key)
      }}
      label="构筑内容"
      panelId="build-tabpanel"
    />
  )
}

const tab = (name: string) => screen.getByRole('tab', { name: new RegExp(`^${name}`) })

describe('PtTabs', () => {
  it('ptTabId 生成 tab-<key>', () => {
    expect(ptTabId('gear')).toBe('tab-gear')
  })

  it('tablist + tab 语义：id、aria-controls、aria-selected 与计数', () => {
    render(<Harness />)
    const list = screen.getByRole('tablist', { name: '构筑内容' })
    expect(list.className).toBe('pt-tabs')
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((node) => node.id)).toEqual(['tab-gear', 'tab-skills', 'tab-passives'])
    for (const node of tabs) {
      expect(node.className).toBe('pt-tab')
      expect(node.getAttribute('type')).toBe('button')
      expect(node.getAttribute('aria-controls')).toBe('build-tabpanel')
    }
    expect(tabs.map((node) => node.getAttribute('aria-selected'))).toEqual([
      'true',
      'false',
      'false',
    ])
    expect(tab('装备').querySelector('.pt-tab__count')?.textContent).toBe('4')
  })

  it('roving tabindex：只有选中页签可 Tab 进入', () => {
    render(<Harness />)
    expect(screen.getAllByRole('tab').map((node) => node.tabIndex)).toEqual([0, -1, -1])
    fireEvent.click(tab('天赋'))
    expect(screen.getAllByRole('tab').map((node) => node.tabIndex)).toEqual([-1, -1, 0])
  })

  it('←/→ 立即切换并首尾循环，焦点跟到新页签', () => {
    const spy = vi.fn()
    render(<Harness spy={spy} />)
    tab('装备').focus()
    fireEvent.keyDown(tab('装备'), { key: 'ArrowRight' })
    expect(tab('技能').getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(tab('技能'))
    fireEvent.keyDown(tab('技能'), { key: 'ArrowRight' })
    fireEvent.keyDown(tab('天赋'), { key: 'ArrowRight' })
    expect(tab('装备').getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(tab('装备'))
    fireEvent.keyDown(tab('装备'), { key: 'ArrowLeft' })
    expect(tab('天赋').getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(tab('天赋'))
    expect(spy.mock.calls.map(([key]) => key)).toEqual(['skills', 'passives', 'gear', 'passives'])
  })

  it('Home/End 到第一个与最后一个', () => {
    render(<Harness />)
    fireEvent.keyDown(tab('装备'), { key: 'End' })
    expect(tab('天赋').getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(tab('天赋'))
    fireEvent.keyDown(tab('天赋'), { key: 'Home' })
    expect(tab('装备').getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(tab('装备'))
  })

  it('其他按键不切换；点击照常切换', () => {
    const spy = vi.fn()
    render(<Harness spy={spy} />)
    fireEvent.keyDown(tab('装备'), { key: 'a' })
    fireEvent.keyDown(tab('装备'), { key: 'ArrowDown' })
    expect(spy).not.toHaveBeenCalled()
    fireEvent.click(tab('技能'))
    expect(spy).toHaveBeenCalledWith('skills')
    expect(tab('技能').getAttribute('aria-selected')).toBe('true')
  })
})
