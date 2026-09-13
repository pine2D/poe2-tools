import {
  type CraftCatalog,
  type CraftProject,
  type ItemDictionary,
  MAX_CRAFT_PROJECT_BYTES,
  parseCraftProject,
  type RestoredCraftProject,
  serializeCraftProject,
} from '@poe2-tools/item-core'
import { useEffect, useRef, useState } from 'react'

import { ProjectLibrary } from './ProjectLibrary'

export const REHEARSAL_PROJECT_KEY = 'poe2-tools:craft-rehearsal:v1'
export interface ProjectControlsProps {
  catalog: CraftCatalog
  dictionary?: ItemDictionary
  project?: CraftProject
  onRestore: (restored: RestoredCraftProject) => void
}

export function ProjectControls({ catalog, dictionary, project, onRestore }: ProjectControlsProps) {
  const [message, setMessage] = useState('')
  const requestRef = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // 恢复所依赖的上下文变化后，先前文件读取结果已经过期。
    void catalog
    void dictionary
    void project
    requestRef.current += 1
    return () => {
      requestRef.current += 1
    }
  }, [catalog, dictionary, project])

  const validatedText = () => {
    if (!project) return { ok: false as const, error: '当前没有可保存的演练项目。' }
    try {
      const text = serializeCraftProject(project)
      if (new Blob([text]).size > MAX_CRAFT_PROJECT_BYTES)
        return { ok: false as const, error: '演练项目超过 2 MB 限制，无法保存。' }
      const checked = parseCraftProject(text, catalog, dictionary)
      if (!checked.ok) return checked
      return { ok: true as const, value: text }
    } catch {
      return { ok: false as const, error: '演练项目无法序列化。' }
    }
  }

  const restoreText = (text: string, request: number) => {
    const restored = parseCraftProject(text, catalog, dictionary)
    if (request !== requestRef.current) return
    if (!restored.ok) {
      setMessage(restored.error)
      return
    }
    onRestore(restored.value)
    setMessage('演练项目已恢复。')
  }
  const restoreLocal = () => {
    const request = ++requestRef.current
    try {
      const text = localStorage.getItem(REHEARSAL_PROJECT_KEY)
      if (text === null) {
        setMessage('本机没有已保存的演练项目。')
        return
      }
      restoreText(text, request)
    } catch {
      setMessage('浏览器禁止读取本机存储。')
    }
  }
  const saveLocal = () => {
    const checked = validatedText()
    if (!checked.ok) {
      setMessage(checked.error)
      return
    }
    try {
      localStorage.setItem(REHEARSAL_PROJECT_KEY, checked.value)
      setMessage('演练项目已保存到本机；未应用的草稿不会保存。')
    } catch {
      setMessage('浏览器禁止本机存储或空间不足，项目未保存。')
    }
  }
  const exportProject = () => {
    const checked = validatedText()
    if (!checked.ok) {
      setMessage(checked.error)
      return
    }
    let url: string | null = null
    try {
      url = URL.createObjectURL(
        new Blob([checked.value], { type: 'application/json;charset=utf-8' }),
      )
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'poe2-craft-rehearsal.craft.json'
      anchor.click()
      setMessage('演练项目已导出；未应用的草稿不会导出。')
    } catch {
      setMessage('浏览器无法导出演练项目。')
    } finally {
      if (url !== null) URL.revokeObjectURL(url)
    }
  }
  const importFile = async (file: File | undefined) => {
    if (!file) return
    const request = ++requestRef.current
    if (file.size > MAX_CRAFT_PROJECT_BYTES) {
      setMessage('演练项目文件超过 2 MB 限制。')
      return
    }
    try {
      const text = await file.text()
      restoreText(text, request)
    } catch {
      if (request === requestRef.current) setMessage('演练项目文件无法读取。')
    }
  }

  return (
    <section className="project-controls" aria-label="演练项目">
      {project && (
        <>
          <button type="button" onClick={saveLocal}>
            保存演练到本机
          </button>
          <button type="button" onClick={exportProject}>
            导出演练项目
          </button>
        </>
      )}
      <button type="button" onClick={restoreLocal}>
        恢复本机演练
      </button>
      <button type="button" onClick={() => inputRef.current?.click()}>
        导入演练项目
      </button>
      <input
        ref={inputRef}
        hidden
        type="file"
        accept=".craft.json,application/json"
        aria-label="选择演练项目文件"
        onChange={(event) => {
          void importFile(event.target.files?.[0])
          event.target.value = ''
        }}
      />
      <ProjectLibrary
        canSave={Boolean(project)}
        getText={validatedText}
        onRestoreText={(text) => restoreText(text, ++requestRef.current)}
        onMessage={setMessage}
      />
      {message && <p role="status">{message}</p>}
    </section>
  )
}
