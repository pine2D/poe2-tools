// 下载后的落地引导条：下载是任务流的最后一步，此前点完什么都不说（研究报告 G8 / P2-11）。
// role="status" + aria-live="polite" 让读屏也听得到且不打断当前朗读；4 秒自动消失也能手动
// 关掉；进场动效在 prefers-reduced-motion 下归零（见 styles.css）。
import { useEffect } from 'react'
import { Icon } from './Icon'

export interface ToastProps {
  message: string
  onClose(): void
  /** 自动消失的毫秒数；给 0 表示不自动消失 */
  duration?: number
}

export function Toast({ message, onClose, duration = 4000 }: ToastProps) {
  // 连续下载导致文案在条还没消失时换掉，也要重新起一次 4 秒倒计时，不然后一条消息只剩前一条剩下的
  // 时间就被关掉。onClose 仍要求调用方给稳定身份（见 App.tsx）。
  // biome-ignore lint/correctness/useExhaustiveDependencies: message 不出现在 effect 体里是故意的，见上两行
  useEffect(() => {
    if (duration <= 0) return
    const timer = setTimeout(onClose, duration)
    return () => {
      clearTimeout(timer)
    }
  }, [duration, onClose, message])
  return (
    <div className="toast" role="status" aria-live="polite">
      <Icon name="check" size={15} />
      <p className="toast__text">{message}</p>
      <button type="button" className="toast__close" aria-label="关闭提示" onClick={onClose}>
        <Icon name="close" size={14} />
      </button>
    </div>
  )
}
