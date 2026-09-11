import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fsPathFromMetaUrl } from '../testing/fsPath'
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

// index.html 的首帧引导脚本与这个 hook 是一对硬耦合：脚本负责首帧之前定妆，hook 负责之后
// 的维护，任何一条分支对不上就会闪一帧。下面直接把 <script> 的源码抠出来跑，而不是复述它的
// 逻辑——复述只会让测试跟着实现一起错（三期 3b 审查 I-1 就是这条耦合裂开的结果）。
const indexHtml = readFileSync(
  resolve(dirname(fsPathFromMetaUrl(import.meta.url)), '../../index.html'),
  'utf8',
)
const bootstrap = /<script>([\s\S]*?)<\/script>/.exec(indexHtml)?.[1] ?? ''

function runBootstrap(options: {
  stored: string | null | 'throw'
  systemLight: boolean
}): string | null {
  const applied: { theme: string | null } = { theme: null }
  const fakeDocument = {
    documentElement: {
      setAttribute(name: string, value: string): void {
        if (name === 'data-theme') applied.theme = value
      },
    },
  }
  const fakeWindow = {
    matchMedia: (query: string) => ({
      matches: options.systemLight && query.includes('prefers-color-scheme: light'),
    }),
  }
  const fakeStorage = {
    getItem(): string | null {
      if (options.stored === 'throw') throw new Error('SecurityError')
      return options.stored
    },
  }
  new Function('window', 'document', 'localStorage', bootstrap)(
    fakeWindow,
    fakeDocument,
    fakeStorage,
  )
  return applied.theme
}

describe('index.html 的首帧引导脚本', () => {
  it('抠得到那段内联脚本（正则没匹配上时下面几条会集体假绿）', () => {
    expect(bootstrap).toContain(THEME_KEY)
  })

  it('存过显式选择就照办，与 readStoredMode 一致', () => {
    expect(runBootstrap({ stored: 'dark', systemLight: true })).toBe('dark')
    expect(runBootstrap({ stored: 'light', systemLight: false })).toBe('light')
  })

  it('没存过、或存了脏值：回落去问系统（= readStoredMode 返回 system 后交给 systemScheme）', () => {
    expect(runBootstrap({ stored: null, systemLight: true })).toBe('light')
    expect(runBootstrap({ stored: 'sepia', systemLight: true })).toBe('light')
    expect(runBootstrap({ stored: null, systemLight: false })).toBe('dark')
  })

  it('localStorage 取值抛异常时同样回落去问系统，不硬定深色（I-1）', () => {
    expect(runBootstrap({ stored: 'throw', systemLight: true })).toBe('light')
    expect(runBootstrap({ stored: 'throw', systemLight: false })).toBe('dark')
  })
})
