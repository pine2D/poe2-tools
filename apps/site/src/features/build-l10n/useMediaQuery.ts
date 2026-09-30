// 订阅一条媒体查询。构筑页在 ≤1099px 不渲染侧栏 pt-frame（spec §6.7，M0 V10），只靠 CSS 隐藏不够：
// 框仍在 DOM 里，同屏角饰计数与“框中框”检查都会把它算进去。
import { useCallback, useSyncExternalStore } from 'react'

/** 构筑页侧栏折叠为抽屉的断点（spec §6.7 “≤1099px（构筑页）”） */
export const NARROW_QUERY = '(max-width: 1099px)'

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (notify: () => void) => {
      if (typeof window.matchMedia !== 'function') return () => {}
      const list = window.matchMedia(query)
      list.addEventListener('change', notify)
      return () => list.removeEventListener('change', notify)
    },
    [query],
  )
  const snapshot = () => typeof window.matchMedia === 'function' && window.matchMedia(query).matches
  return useSyncExternalStore(subscribe, snapshot, () => false)
}
