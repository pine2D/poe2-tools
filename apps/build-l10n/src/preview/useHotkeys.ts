// N 跳下一处未命中 / F 切换「仅看未命中」（研究报告 §5.4 G9）。只收这两个键：全套
// J/K/P// 键盘系统对「一年用三次」的目标用户是过度工程。作用域三条纪律缺一不可：
//  1. 焦点在 input / textarea / select / contenteditable 里不触发（首屏就摆着粘贴框）；
//  2. 带 Ctrl / Meta / Alt 的组合键放行（Ctrl+N 是新窗口）；3. 输入法组合期不触发——中文
//     输入法按 n 先进候选框、keydown 仍冒到 window，不挡就会随机跳转；判据用 isComposing
//     与 key === 'Process' 并联，不用已废弃的 keyCode === 229。
import { useEffect } from 'react'

export interface Hotkeys {
  next(): void
  toggleFilter(): void
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

export function useHotkeys({ next, toggleFilter }: Hotkeys): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.ctrlKey || event.metaKey || event.altKey) return
      if (event.isComposing || event.key === 'Process') return
      if (isTypingTarget(event.target)) return
      const key = event.key.toLowerCase()
      if (key === 'n') {
        event.preventDefault()
        next()
        return
      }
      if (key === 'f') {
        event.preventDefault()
        toggleFilter()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [next, toggleFilter])
}
