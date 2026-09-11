// 下载后的落地引导条：下载是任务流的最后一步，此前点完什么都不说（研究报告 G8 / P2-11）。
// role="status" + aria-live="polite" 让读屏也听得到且不打断当前朗读；4 秒自动消失也能手动
// 关掉；进场动效在 prefers-reduced-motion 下归零（见 a11y.css）。
// 外层 .toast-live 是始终渲染的空容器，message 为 null 时也不卸载——role="status" 挂在
// 不换的这一层上，视觉样式的 .toast 只在有文案时才出现（控制者追加 g，理由同 App.tsx 的
// .app__live：live region 整块卸载重挂会让部分读屏漏播下一条更新）。
import { useEffect } from 'react'
import { Icon } from './Icon'

export interface ToastProps {
  message: string | null
  onClose(): void
  /** 自动消失的毫秒数；给 0 表示不自动消失 */
  duration?: number
}

export function Toast({ message, onClose, duration = 4000 }: ToastProps) {
  // 连续下载导致文案在条还没消失时换掉，也要重新起一次 4 秒倒计时，不然后一条消息只剩前一条剩下的
  // 时间就被关掉。onClose 仍要求调用方给稳定身份（见 App.tsx）。message 为 null 时没有可关闭的
  // 条，不起计时器。
  useEffect(() => {
    if (message === null || duration <= 0) return
    const timer = setTimeout(onClose, duration)
    return () => {
      clearTimeout(timer)
    }
  }, [duration, onClose, message])
  return (
    <div className="toast-live" role="status" aria-live="polite">
      {message !== null && (
        <div className="toast">
          <Icon name="check" size={15} />
          <p className="toast__text">{message}</p>
          <button type="button" className="toast__close" aria-label="关闭提示" onClick={onClose}>
            <Icon name="close" size={14} />
          </button>
        </div>
      )}
    </div>
  )
}
