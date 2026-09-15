import {
  type CraftCatalog,
  type CraftProject,
  IDENTITY_CRAFT_RULES_VERSION,
  type IdentityCraftProject,
  type ItemDictionary,
  loadTargetWorkbenchProject,
  MAX_CRAFT_PROJECT_BYTES,
  type RestoredTargetCraftProject,
  reuseTargetCraftPlan,
  serializeCraftProject,
  serializeIdentityCraftProject,
  serializeTargetCraftProject,
  TARGET_CRAFT_RULES_VERSION,
  type TargetCraftProject,
} from '@poe2-tools/item-core'
import { useEffect, useRef, useState } from 'react'

import { ProjectLibrary } from './ProjectLibrary'

export const REHEARSAL_PROJECT_KEY = 'poe2-tools:craft-rehearsal:v1'
export interface ProjectControlsProps {
  catalog: CraftCatalog
  dictionary?: ItemDictionary
  project?: CraftProject | IdentityCraftProject | TargetCraftProject
  onRestore: (restored: RestoredTargetCraftProject) => void
}

export function ProjectControls({ catalog, dictionary, project, onRestore }: ProjectControlsProps) {
  const [message, setMessage] = useState('')
  const requestRef = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const previewRef = useRef<HTMLElement>(null)
  const planTrigger = useRef<HTMLElement | null>(null)
  const [planPreview, setPlanPreview] = useState<{
    text: string
    name: string
    restored: RestoredTargetCraftProject
  } | null>(null)
  useEffect(() => {
    if (planPreview) previewRef.current?.focus()
  }, [planPreview])

  useEffect(() => {
    // 恢复所依赖的上下文变化后，先前文件读取结果已经过期。
    void catalog
    void dictionary
    void project
    setPlanPreview(null)
    requestRef.current += 1
    return () => {
      requestRef.current += 1
    }
  }, [catalog, dictionary, project])

  const validatedText = () => {
    if (!project) return { ok: false as const, error: '当前没有可保存的演练项目。' }
    try {
      if (project.rulesVersion === TARGET_CRAFT_RULES_VERSION)
        return serializeTargetCraftProject(project, catalog, dictionary)
      const saved =
        project.rulesVersion === IDENTITY_CRAFT_RULES_VERSION
          ? serializeIdentityCraftProject(project, catalog, dictionary)
          : { ok: true as const, value: serializeCraftProject(project) }
      if (!saved.ok) return saved
      const checked = loadTargetWorkbenchProject(saved.value, catalog, dictionary)
      return checked.ok
        ? serializeTargetCraftProject(checked.value.project, catalog, dictionary)
        : checked
    } catch {
      return { ok: false as const, error: '演练项目无法序列化。' }
    }
  }

  const restoreText = (text: string, request: number) => {
    const restored = loadTargetWorkbenchProject(text, catalog, dictionary)
    if (request !== requestRef.current) return
    setPlanPreview(null)
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

  const preparePlan = (text: string, name: string) => {
    planTrigger.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    ++requestRef.current
    setPlanPreview(null)
    const current = validatedText()
    if (!current.ok) {
      setMessage(current.error)
      return
    }
    const reused = reuseTargetCraftPlan(current.value, text, catalog, dictionary)
    if (!reused.ok) {
      setMessage(reused.error)
      return
    }
    setMessage('方案已核对，请预览将要沿用的目标与指引。')
    setPlanPreview({ text, name, restored: reused.value })
  }
  const applyPlan = () => {
    if (!planPreview) return
    ++requestRef.current
    const current = validatedText()
    if (!current.ok) {
      setMessage(current.error)
      setPlanPreview(null)
      return
    }
    const reused = reuseTargetCraftPlan(current.value, planPreview.text, catalog, dictionary)
    setPlanPreview(null)
    if (!reused.ok) {
      setMessage(reused.error)
      return
    }
    onRestore(reused.value)
    if (planTrigger.current?.isConnected) planTrigger.current.focus()
    setMessage(
      '已沿用收藏的目标与指引；装备、历史和报价保留，未应用草稿已清除，分阶段流程从当前步骤重新开始。',
    )
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
        {...(project ? { onReuseText: preparePlan } : {})}
        onMessage={setMessage}
      />
      {planPreview ? (
        <section
          ref={previewRef}
          tabIndex={-1}
          className="project-plan-preview"
          aria-label="沿用方案预览"
        >
          <h3>沿用方案：{planPreview.name}</h3>
          <p>
            将替换当前制作目标和条件指引。当前装备、已应用 {planPreview.restored.project.cursor}{' '}
            步、可重做{' '}
            {planPreview.restored.project.operations.length - planPreview.restored.project.cursor}{' '}
            步及报价保留；未应用草稿会清除。
          </p>
          <p>
            显式目标 {planPreview.restored.project.targetDefinitions.targets.length} 组，固有目标{' '}
            {planPreview.restored.project.targetImplicitValues?.length ?? 0} 行。
          </p>
          {planPreview.restored.project.strategy ? (
            <p>
              条件规则 {planPreview.restored.project.strategy.rules.length} 条，
              {planPreview.restored.project.strategy.flow?.stages.length ?? 0} 个阶段。步骤上限仍为{' '}
              {planPreview.restored.project.strategy.maxSteps}
              ，包含当前已有历史；分阶段流程从入口重新判断。
            </p>
          ) : (
            <p>此方案未启用条件指引。</p>
          )}
          <p>
            动作仍按当前装备核对，孔位或数值未知的条件保持未知。应用方案本身不消耗材料，也不修改收藏。
          </p>
          {planPreview.restored.project.orphanedTargets.length > 0 ? (
            <p>
              此方案仍引用 {planPreview.restored.project.orphanedTargets.length}{' '}
              个已移除目标；沿用后需编辑条件，重新选择目标。
            </p>
          ) : null}
          <button type="button" onClick={applyPlan}>
            应用收藏方案
          </button>
          <button
            type="button"
            onClick={() => {
              setPlanPreview(null)
              setMessage('已取消沿用，当前演练保持不变。')
              if (planTrigger.current?.isConnected) planTrigger.current.focus()
            }}
          >
            取消沿用
          </button>
        </section>
      ) : null}
      {message && <p role="status">{message}</p>}
    </section>
  )
}
