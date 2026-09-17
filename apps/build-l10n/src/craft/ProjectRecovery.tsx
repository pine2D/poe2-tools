import { useCallback, useEffect, useRef, useState } from 'react'
import { RECOVERY_KEY, readRecovery, sameRecoveryProject, writeRecovery } from './projectRecovery'

type TextResult = { ok: true; value: string } | { ok: false; error: string }
interface Props {
  project?: unknown
  context?: unknown
  getText: () => TextResult
  onRestoreText: (text: string) => void
}

export function ProjectRecovery({ project, context, getText, onRestoreText }: Props) {
  const [raw, setRaw] = useState<string | null>(null)
  const [mode, setMode] = useState<'loading' | 'ready' | 'paused'>('loading')
  const [message, setMessage] = useState('正在读取自动恢复记录。新更改约半秒后保存。')
  const current = useRef({ project, context, getText, onRestoreText, mode })
  current.current = { project, context, getText, onRestoreText, mode }
  const observed = useRef<string | null>(null)
  const generation = useRef(0)
  const writing = useRef<number | null>(null)

  const accept = useCallback((value: string | null) => {
    observed.current = value
    setRaw(value)
  }, [])
  useEffect(() => {
    try {
      const value = localStorage.getItem(RECOVERY_KEY)
      accept(value)
      setMode(value === null ? 'ready' : 'paused')
      setMessage(
        value === null
          ? '开始演练后自动保存已应用进度。'
          : '发现自动恢复记录，核对前不会覆盖。每次恢复仍需通过项目校验。',
      )
    } catch {
      setMode('paused')
      setMessage('浏览器禁止读取恢复记录，请手动导出项目。')
    }
    const changed = (event: StorageEvent) => {
      if (event.key !== null && event.key !== RECOVERY_KEY) return
      generation.current++
      try {
        accept(localStorage.getItem(RECOVERY_KEY))
      } catch {
        /* 保留上次观察值。 */
      }
      setMode('paused')
      setMessage('其他页面已更新恢复记录，自动保存已暂停，请先核对。')
    }
    window.addEventListener('storage', changed)
    return () => {
      generation.current++
      window.removeEventListener('storage', changed)
    }
  }, [accept])

  const save = useCallback(
    async (token: number) => {
      if (writing.current === token || current.current.project === undefined) return
      const snapshot = current.current
      const checked = snapshot.getText()
      if (!checked.ok) {
        setMessage(checked.error)
        return
      }
      writing.current = token
      try {
        const value = await writeRecovery(
          observed.current,
          checked.value,
          () =>
            generation.current === token &&
            current.current.project === snapshot.project &&
            current.current.context === snapshot.context,
        )
        if (generation.current !== token || value === null) return
        accept(value)
        setMode('ready')
        setMessage(
          `已自动保存于 ${new Date(readRecovery(value)?.savedAt ?? '').toLocaleTimeString()}。`,
        )
      } catch (error) {
        if (generation.current !== token) return
        try {
          accept(localStorage.getItem(RECOVERY_KEY))
        } catch {
          /* 不删除不能读取的记录。 */
        }
        setMode('paused')
        setMessage(
          error instanceof Error && error.message.includes('恢复')
            ? error.message
            : '自动保存失败，可能是存储空间不足或浏览器限制；请手动导出项目。',
        )
      } finally {
        if (writing.current === token) writing.current = null
      }
    },
    [accept],
  )

  useEffect(() => {
    // 校验目录或词典变化时重新核对相同项目。
    void context
    if (project === undefined || current.current.mode === 'ready') return
    const saved = readRecovery(observed.current)
    if (!saved) return
    const checked = current.current.getText()
    if (checked.ok && sameRecoveryProject(saved.text, checked.value)) setMode('ready')
  }, [project, context])

  useEffect(() => {
    // 即使项目引用相同，新的校验上下文也须取消旧写入。
    void context
    const token = ++generation.current
    if (project === undefined || mode !== 'ready') return
    setMessage('有更改待自动保存；刷新前请等待保存完成。')
    const timer = window.setTimeout(() => {
      void save(token)
    }, 500)
    const hidden = () => {
      if (document.visibilityState === 'hidden') {
        window.clearTimeout(timer)
        void save(token)
      }
    }
    document.addEventListener('visibilitychange', hidden)
    return () => {
      generation.current++
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', hidden)
    }
  }, [project, context, mode, save])

  const restore = () => {
    try {
      const value = localStorage.getItem(RECOVERY_KEY)
      if (value !== observed.current) {
        accept(value)
        setMode('paused')
        setMessage('恢复记录已变化，请核对后再次恢复。')
        return
      }
      const record = readRecovery(value)
      if (!record) {
        setMessage('恢复记录损坏或格式不支持；原记录仍保留。')
        return
      }
      current.current.onRestoreText(record.text)
    } catch {
      setMessage('无法读取自动恢复记录，请检查浏览器存储设置。')
    }
  }
  const record = readRecovery(raw)
  return (
    <section aria-label="自动恢复">
      <p aria-live="polite">{message}</p>
      <p>自动恢复保留已应用进度和可重做历史；未应用草稿不保存。手动存档与收藏独立保留。</p>
      {record ? (
        <p>恢复记录：{new Date(record.savedAt).toLocaleString()}</p>
      ) : raw !== null ? (
        <p>恢复记录格式无法读取，原记录仍保留。</p>
      ) : null}
      {raw !== null ? (
        <button type="button" onClick={restore}>
          恢复自动保存的演练
        </button>
      ) : null}
      {mode === 'paused' && project !== undefined ? (
        <button
          type="button"
          onClick={() => {
            void save(generation.current)
          }}
        >
          用当前演练替换自动恢复记录
        </button>
      ) : null}
    </section>
  )
}
