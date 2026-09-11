// 三态主题：跟随系统 / 浅色 / 深色。三态在这里收敛成两态写进 <html data-theme>，
// CSS 里因此只需要一份浅色令牌块（理由见 styles.css 的浅色分区注释）。
// 键名与取值必须与 index.html 的首帧引导脚本逐字一致——那段脚本负责首帧之前定妆，
// 这个 hook 负责之后的维护，两边对不上就会「刷新一下主题变了」。
import { useCallback, useEffect, useState } from 'react'

export type ThemeMode = 'system' | 'light' | 'dark'
export type Scheme = 'light' | 'dark'

export const THEME_KEY = 'poe2-tools.theme'

const LIGHT_QUERY = '(prefers-color-scheme: light)'

// localStorage 在隐私模式与某些内核里会直接抛异常，读写都得包起来。
// 读不到、读到脏值一律按「跟随系统」处理，不做纠错也不清库。
export function readStoredMode(): ThemeMode {
  try {
    const saved = localStorage.getItem(THEME_KEY)
    return saved === 'light' || saved === 'dark' ? saved : 'system'
  } catch {
    return 'system'
  }
}

function store(mode: ThemeMode): void {
  try {
    if (mode === 'system') localStorage.removeItem(THEME_KEY)
    else localStorage.setItem(THEME_KEY, mode)
  } catch {
    // 存不进去就只在本次会话里生效，不影响当前这次切换
  }
}

export function systemScheme(): Scheme {
  return window.matchMedia?.(LIGHT_QUERY).matches === true ? 'light' : 'dark'
}

export function useTheme(): { mode: ThemeMode; scheme: Scheme; setMode(mode: ThemeMode): void } {
  const [mode, setModeState] = useState<ThemeMode>(readStoredMode)
  const [system, setSystem] = useState<Scheme>(systemScheme)

  // 跟随系统时，用户在操作系统里改配色要立刻反映过来。非跟随态也订阅：
  // 退订再订阅的成本比「切回跟随时才订阅」的分支逻辑低，且不会漏事件。
  useEffect(() => {
    const query = window.matchMedia?.(LIGHT_QUERY)
    if (query === undefined) return
    const onChange = () => {
      setSystem(query.matches ? 'light' : 'dark')
    }
    query.addEventListener('change', onChange)
    return () => {
      query.removeEventListener('change', onChange)
    }
  }, [])

  const scheme: Scheme = mode === 'system' ? system : mode

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', scheme)
  }, [scheme])

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next)
    store(next)
    // 切回「跟随系统」时立刻重新问一次系统，不等 change 事件——那个事件只有系统配色
    // 真的变了才会来，而这一次变的是我们自己。
    if (next === 'system') setSystem(systemScheme())
  }, [])

  return { mode, scheme, setMode }
}
