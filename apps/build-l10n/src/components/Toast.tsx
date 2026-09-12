// 播报容器与视觉提示常驻：重复下载可以再次播报，开关过渡可以从当前位置反向。
import { useEffect, useState } from 'react'
import { Icon } from './Icon'

export interface ToastProps {
  message: string | null
  onClose(): void
  /** 自动消失的毫秒数；给 0 表示不自动消失 */
  duration?: number
  eventId?: number
}

export function Toast({ message, onClose, duration = 4000, eventId = 0 }: ToastProps) {
  // 退出时保留最后一条可见文本；播报区域在关闭时立即清空。
  const [lastMessage, setLastMessage] = useState(message)
  useEffect(() => {
    if (message !== null) setLastMessage(message)
  }, [message])
  // biome-ignore lint/correctness/useExhaustiveDependencies: 每次下载事件都重新计时，即使文案相同
  useEffect(() => {
    if (message === null || duration <= 0) return
    const timer = setTimeout(onClose, duration)
    return () => clearTimeout(timer)
  }, [duration, onClose, message, eventId])
  return (
    <>
      <div
        className="toast-live visually-hidden"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {message !== null && <span key={eventId}>{message}</span>}
      </div>
      <div
        className="toast"
        data-open={message !== null}
        aria-hidden={message === null}
        inert={message === null}
      >
        <Icon name="check" size={16} />
        <p className="toast__text">{message ?? lastMessage}</p>
        <button type="button" className="toast__close" aria-label="关闭提示" onClick={onClose}>
          <Icon name="close" size={14} />
        </button>
      </div>
    </>
  )
}
