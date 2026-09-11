import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readStoredMode, systemScheme, THEME_KEY, useTheme } from './useTheme'

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

afterEach(() => {
  cleanup()
})

describe('readStoredMode', () => {
  it('没存过、存了脏值、存了合法值三种情况', () => {
    expect(readStoredMode()).toBe('system')
    localStorage.setItem(THEME_KEY, 'sepia')
    expect(readStoredMode()).toBe('system')
    localStorage.setItem(THEME_KEY, 'dark')
    expect(readStoredMode()).toBe('dark')
  })
})

describe('systemScheme', () => {
  it('问系统要一个明确的 light / dark（happy-dom 默认 light）', () => {
    expect(systemScheme()).toBe('light')
  })
})

describe('useTheme', () => {
  it('默认跟随系统，并把结果写进 <html data-theme>', () => {
    const { result } = renderHook(() => useTheme())
    expect(result.current.mode).toBe('system')
    expect(result.current.scheme).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('显式选深色：立刻改 data-theme，并记进 localStorage', () => {
    const { result } = renderHook(() => useTheme())
    act(() => {
      result.current.setMode('dark')
    })
    expect(result.current.mode).toBe('dark')
    expect(result.current.scheme).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(localStorage.getItem(THEME_KEY)).toBe('dark')
  })

  it('选回「跟随系统」时把记忆清掉，重新交给系统决定', () => {
    localStorage.setItem(THEME_KEY, 'dark')
    const { result } = renderHook(() => useTheme())
    expect(result.current.mode).toBe('dark')
    act(() => {
      result.current.setMode('system')
    })
    expect(localStorage.getItem(THEME_KEY)).toBeNull()
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('localStorage 抛异常时不炸，退回跟随系统', () => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = () => {
      throw new Error('QuotaExceeded')
    }
    const { result } = renderHook(() => useTheme())
    act(() => {
      result.current.setMode('light')
    })
    expect(result.current.mode).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('light')
    Storage.prototype.setItem = original
  })
})
