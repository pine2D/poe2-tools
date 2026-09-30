import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockMatchMedia } from './testing/mockMatchMedia'
import { NARROW_QUERY, useMediaQuery } from './useMediaQuery'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function Probe() {
  return <p>{useMediaQuery(NARROW_QUERY) ? '窄屏' : '宽屏'}</p>
}

describe('useMediaQuery', () => {
  it('断点是 spec §6.7 的 1099px', () => {
    expect(NARROW_QUERY).toBe('(max-width: 1099px)')
  })

  it('读取当前匹配结果，媒体查询变化时重新渲染', () => {
    const media = mockMatchMedia(false)
    render(<Probe />)
    expect(screen.getByText('宽屏')).toBeDefined()
    act(() => media.set(true))
    expect(screen.getByText('窄屏')).toBeDefined()
    act(() => media.set(false))
    expect(screen.getByText('宽屏')).toBeDefined()
  })

  it('卸载后退订，不再收到变化', () => {
    const media = mockMatchMedia(false)
    const { unmount } = render(<Probe />)
    unmount()
    expect(() => act(() => media.set(true))).not.toThrow()
  })
})
