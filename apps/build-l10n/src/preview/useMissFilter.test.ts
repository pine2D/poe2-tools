import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useMissFilter } from './useMissFilter'

afterEach(() => {
  cleanup()
})

describe('useMissFilter', () => {
  it('默认关；toggle 一次开、再一次关', () => {
    const { result } = renderHook(() => useMissFilter(true))
    expect(result.current.only).toBe(false)
    act(() => result.current.toggle())
    expect(result.current.only).toBe(true)
    act(() => result.current.toggle())
    expect(result.current.only).toBe(false)
  })

  it('未命中归零时自动复位，用户不会停在一块空屏上', () => {
    const { result, rerender } = renderHook(({ has }) => useMissFilter(has), {
      initialProps: { has: true },
    })
    act(() => result.current.toggle())
    expect(result.current.only).toBe(true)
    // 换一份全命中的文件 / 关掉某个选项之后
    rerender({ has: false })
    expect(result.current.only).toBe(false)
  })

  it('一条未命中都没有时 toggle 不生效：F 键不能绕过禁用的开关', () => {
    const { result } = renderHook(() => useMissFilter(false))
    act(() => result.current.toggle())
    expect(result.current.only).toBe(false)
  })

  it('toggle 的函数身份稳定，挂到全局键盘监听上不会每次渲染都重订阅', () => {
    const { result, rerender } = renderHook(() => useMissFilter(true))
    const first = result.current.toggle
    rerender()
    expect(result.current.toggle).toBe(first)
  })
})
