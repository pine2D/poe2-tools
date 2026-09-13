import { useCallback, useEffect, useRef, useState } from 'react'
import {
  addLibraryEntry,
  LIBRARY_PREFIX,
  type LibraryEntry,
  readLibrary,
  removeLibraryEntry,
} from './projectLibrary'
import './project-library.css'

interface Props {
  canSave: boolean
  getText: () => { ok: true; value: string } | { ok: false; error: string }
  onRestoreText: (text: string) => void
  onMessage: (message: string) => void
}
export function ProjectLibrary({ canSave, getText, onRestoreText, onMessage }: Props) {
  const [entries, setEntries] = useState<LibraryEntry[]>([])
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const summary = useRef<HTMLElement>(null)
  const refresh = useCallback(() => {
    try {
      setEntries(readLibrary(localStorage))
    } catch {
      onMessage('浏览器禁止读取演练收藏。')
    }
  }, [onMessage])
  useEffect(() => {
    refresh()
    const changed = (event: StorageEvent) => {
      if (event.key === null || event.key.startsWith(LIBRARY_PREFIX)) refresh()
    }
    window.addEventListener('storage', changed)
    return () => window.removeEventListener('storage', changed)
  }, [refresh])
  const save = async () => {
    if (saving) return
    const checked = getText()
    if (!checked.ok) {
      onMessage(checked.error)
      return
    }
    try {
      setSaving(true)
      await addLibraryEntry(localStorage, name, checked.value)
      refresh()
      onMessage('已收藏当前演练的完整副本；未应用草稿不会保存，同名收藏不会覆盖。')
    } catch (error) {
      onMessage(
        error instanceof Error && /收藏|演练项目/.test(error.message)
          ? error.message
          : '浏览器禁止本机存储或空间不足，收藏未保存。',
      )
    } finally {
      setSaving(false)
    }
  }
  const restore = (key: string) => {
    try {
      const entry = readLibrary(localStorage).find((item) => item.key === key)
      if (!entry || entry.text === null) {
        onMessage(entry?.error ?? '这份收藏已被移除，请刷新列表。')
        refresh()
        return
      }
      onRestoreText(entry.text)
    } catch {
      onMessage('浏览器无法读取这份演练收藏。')
    }
  }
  const remove = async (key: string) => {
    if (saving) return
    try {
      setSaving(true)
      await removeLibraryEntry(localStorage, key)
      refresh()
      onMessage('收藏已移除，当前演练不受影响。')
      summary.current?.focus()
    } catch {
      onMessage('浏览器无法移除这份演练收藏。')
    } finally {
      setSaving(false)
    }
  }
  return (
    <details
      className="project-library"
      onToggle={(event) => {
        if (event.currentTarget.open) refresh()
      }}
    >
      <summary ref={summary}>演练收藏</summary>
      <p>
        保存在当前浏览器，最多 20 份；清理站点数据会丢失，请定期导出项目备份。恢复会切换当前演练。
      </p>
      {canSave && (
        <div className="project-library-save">
          <label>
            收藏名称
            <input
              aria-label="收藏名称"
              maxLength={80}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="例如：召唤戒指·保留抗性"
            />
          </label>
          <button type="button" onClick={() => void save()} disabled={saving || !name.trim()}>
            收藏当前演练
          </button>
        </div>
      )}
      <button type="button" onClick={refresh}>
        刷新收藏
      </button>
      <p>已收藏 {entries.length} 份</p>
      <ul>
        {entries.map((entry) => (
          <li key={entry.key}>
            <div>
              <strong>{entry.name}</strong>
              {entry.savedAt && (
                <time dateTime={entry.savedAt}>
                  {new Date(entry.savedAt).toLocaleString('zh-CN')}
                </time>
              )}
              {entry.error && <p>{entry.error}</p>}
            </div>
            <div className="project-library-actions">
              <button
                type="button"
                aria-label={`恢复收藏 ${entry.name}`}
                disabled={entry.text === null}
                onClick={() => restore(entry.key)}
              >
                恢复
              </button>
              <button
                type="button"
                aria-label={`移除收藏 ${entry.name}`}
                disabled={saving}
                onClick={() => void remove(entry.key)}
              >
                移除
              </button>
            </div>
          </li>
        ))}
      </ul>
    </details>
  )
}
