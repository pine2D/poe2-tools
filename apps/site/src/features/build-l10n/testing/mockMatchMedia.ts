// 测试用：把 window.matchMedia 换成可控实现。happy-dom 默认按 1024 宽求值，(max-width: 1099px) 恒为真，
// 宽屏布局的用例必须显式给 false。返回的 set() 切换匹配结果并通知订阅者，listeners() 返回当前订阅数（核对退订）。
import { vi } from 'vitest'

export function mockMatchMedia(initial: boolean): {
  set(matches: boolean): void
  listeners(): number
} {
  let matches = initial
  const listeners = new Set<() => void>()
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        get matches() {
          return matches
        },
        media: query,
        onchange: null,
        addEventListener: (_type: string, listener: () => void) => {
          listeners.add(listener)
        },
        removeEventListener: (_type: string, listener: () => void) => {
          listeners.delete(listener)
        },
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => true,
      }) as unknown as MediaQueryList,
  )
  return {
    set(next: boolean) {
      matches = next
      for (const listener of listeners) listener()
    },
    listeners() {
      return listeners.size
    },
  }
}
