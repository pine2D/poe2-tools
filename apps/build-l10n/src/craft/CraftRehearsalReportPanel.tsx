import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { buildCraftRehearsalReport, type CraftRehearsalReportInput } from './craftRehearsalReport'
import './item-text.css'

export function CraftRehearsalReportPanel(props: CraftRehearsalReportInput) {
  const [open, setOpen] = useState(false)
  const { catalog, initialState, operations, cursor, translations, translateLine, pricing } = props
  const result = useMemo(
    () =>
      open
        ? buildCraftRehearsalReport({
            catalog,
            initialState,
            operations,
            cursor,
            translations,
            ...(translateLine === undefined ? {} : { translateLine }),
            ...(pricing === undefined ? {} : { pricing }),
          })
        : null,
    [open, catalog, initialState, operations, cursor, translations, translateLine, pricing],
  )
  const [feedback, setFeedback] = useState<{ result: typeof result; message: string } | null>(null)
  const requestRef = useRef(0)
  const trigger = useRef<HTMLButtonElement>(null)
  const textarea = useRef<HTMLTextAreaElement>(null)
  const panelId = useId()
  const textId = useId()
  useEffect(() => {
    if (open) textarea.current?.focus()
  }, [open])
  useEffect(() => {
    if (!result) return
    return () => {
      requestRef.current++
    }
  }, [result])
  const close = () => {
    requestRef.current++
    setOpen(false)
    trigger.current?.focus()
  }
  const copy = async () => {
    if (!result?.ok) return
    const request = ++requestRef.current
    try {
      if (!navigator.clipboard?.writeText) throw Error('clipboard unavailable')
      await navigator.clipboard.writeText(result.value)
      if (request === requestRef.current) setFeedback({ result, message: '已复制步骤清单。' })
    } catch {
      if (request === requestRef.current)
        setFeedback({ result, message: '无法访问剪贴板，请选中全文后手动复制。' })
    }
  }
  const download = () => {
    if (!result?.ok) return
    requestRef.current++
    let url: string | undefined
    const anchor = document.createElement('a')
    try {
      url = URL.createObjectURL(new Blob([result.value], { type: 'text/plain;charset=utf-8' }))
      anchor.href = url
      anchor.download = 'poe2-craft-steps.zh-CN.txt'
      document.body.append(anchor)
      anchor.click()
      setFeedback({ result, message: '已发起步骤清单下载。' })
    } catch {
      setFeedback({ result, message: '下载失败，请复制清单后手动保存。' })
    } finally {
      anchor.remove()
      if (url !== undefined) URL.revokeObjectURL(url)
    }
  }
  return (
    <section className="craft-item-text" aria-label="制作步骤清单">
      <button
        type="button"
        ref={trigger}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => (open ? close() : setOpen(true))}
      >
        导出制作步骤清单
      </button>
      {open ? (
        <div id={panelId}>
          <p>
            按当前历史位置生成材料与结果清单，可在游戏中逐步核对。随机结果不符时，请回工作台重新判断。
          </p>
          {result?.ok ? (
            <>
              <label htmlFor={textId}>制作步骤清单文本</label>
              <textarea
                id={textId}
                ref={textarea}
                readOnly
                value={result.value}
                rows={16}
                spellCheck={false}
              />
              <div className="craft-item-text-actions">
                <button type="button" onClick={copy}>
                  复制步骤清单
                </button>
                <button type="button" onClick={download}>
                  下载步骤清单
                </button>
                <button
                  type="button"
                  onClick={() => {
                    textarea.current?.focus()
                    textarea.current?.select()
                  }}
                >
                  选中清单全文
                </button>
              </div>
            </>
          ) : (
            <p role="alert">{result && !result.ok ? result.error : '无法生成步骤清单。'}</p>
          )}
          <p role="status">{feedback?.result === result ? feedback.message : ''}</p>
          <button type="button" onClick={close}>
            收起步骤清单
          </button>
        </div>
      ) : null}
    </section>
  )
}
