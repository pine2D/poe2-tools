// 「仅看未命中」的开关状态。住在 Preview 而不是 App：这个筛选只在有预览时才有意义，
// 而 Preview 已经持有 fields。未命中归零时自动复位是刚需——换一份全命中的文件之后
// 若还开着，主区会是一整屏「这一区没有未命中」，用户会以为工具坏了。
import { useCallback, useEffect, useRef, useState } from 'react'

export interface MissFilter {
  only: boolean
  toggle(): void
}

export function useMissFilter(hasMisses: boolean): MissFilter {
  const [only, setOnly] = useState(false)
  // hasMisses 走 ref 而不是进 toggle 的依赖数组：toggle 的身份必须稳定（Task 5 把它直接挂进
  // window 的 keydown 监听，每次渲染换一个新函数会让那个 effect 每帧退订再订阅），
  // 同时 toggle 又必须看得到最新的 hasMisses。
  const has = useRef(hasMisses)
  useEffect(() => {
    has.current = hasMisses
    if (!hasMisses) setOnly(false)
  }, [hasMisses])
  const toggle = useCallback(() => {
    // 一条未命中都没有时不许开：复位 effect 只在 hasMisses 变化时跑，拦不住「hasMisses
    // 恒为 false，用户按了 F」——开起来后三区全是「这一区没有未命中」，而唯一可见的开关
    // 这时正是 disabled（点不动、Tab 也到不了），≤560 连键位提示都隐藏，用户没有退路。
    if (!has.current) return
    setOnly((value) => !value)
  }, [])
  return { only, toggle }
}
