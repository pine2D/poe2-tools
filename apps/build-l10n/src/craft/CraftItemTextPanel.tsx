import {
  type CraftCatalog,
  type CraftState,
  exportCraftItemText,
  type ItemLocale,
} from '@poe2-tools/item-core'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createDictLoader, type FetchJson, type LoadDictResult } from '../dict/loadDict'
import './item-text.css'

const LANGUAGES = { en: '英文', 'zh-CN': '简体中文', 'zh-TW': '繁体中文' }

export function CraftItemTextPanel({
  catalog,
  state,
  pending,
  fetchImpl,
}: {
  catalog: CraftCatalog
  state: CraftState
  pending: boolean
  fetchImpl?: FetchJson
}) {
  const [open, setOpen] = useState(false)
  const [locale, setLocale] = useState<ItemLocale>('zh-CN')
  const [retry, setRetry] = useState(0)
  const loader = useMemo(() => createDictLoader(import.meta.env.BASE_URL, fetchImpl), [fetchImpl])
  const context = useMemo(
    () => ({ catalog, state, locale, open, retry }),
    [catalog, state, locale, open, retry],
  )
  const [loaded, setLoaded] = useState<{ context: typeof context; result: LoadDictResult } | null>(
    null,
  )
  const dictionaryResult = loaded?.context === context ? loaded.result : null
  const loading =
    open && state.grantedSkillLevel !== 20 && locale !== 'en' && dictionaryResult === null
  useEffect(() => {
    if (!context.open || context.locale === 'en' || context.state.grantedSkillLevel === 20) return
    let active = true
    void loader(context.locale).then((result) => {
      if (active) setLoaded({ context, result })
    })
    return () => {
      active = false
    }
  }, [context, loader])
  const result = useMemo(
    () =>
      !open
        ? null
        : locale === 'en' || state.grantedSkillLevel === 20
          ? exportCraftItemText(catalog, state)
          : dictionaryResult?.ok
            ? exportCraftItemText(catalog, state, {
                locale,
                dictionary: dictionaryResult.dict.bundle,
              })
            : null,
    [catalog, state, open, locale, dictionaryResult],
  )
  const [feedback, setFeedback] = useState<{ result: typeof result; message: string } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const languageRef = useRef<HTMLSelectElement>(null)
  const requestRef = useRef(0)
  const panelId = useId()
  const textId = useId()
  const languageId = useId()

  useEffect(() => {
    if (open) (textRef.current ?? languageRef.current)?.focus()
  }, [open])
  useEffect(() => {
    if (!result) return
    // 当前装备、展开状态改变或卸载后，旧的剪贴板完成消息失效。
    return () => {
      requestRef.current += 1
    }
  }, [result])

  const close = () => {
    requestRef.current += 1
    setOpen(false)
    triggerRef.current?.focus()
  }
  const copy = async () => {
    if (!result?.ok) return
    const request = ++requestRef.current
    setFeedback({ result, message: '正在复制…' })
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable')
      await navigator.clipboard.writeText(result.value.text)
      if (request === requestRef.current)
        setFeedback({ result, message: `已复制${LANGUAGES[locale]}装备文本。` })
    } catch {
      if (request === requestRef.current)
        setFeedback({ result, message: '无法访问剪贴板，请选中全部文本后手动复制。' })
    }
  }
  const download = () => {
    if (!result?.ok) return
    requestRef.current += 1
    let url: string | undefined
    const anchor = document.createElement('a')
    try {
      url = URL.createObjectURL(new Blob([result.value.text], { type: 'text/plain;charset=utf-8' }))
      anchor.href = url
      anchor.download =
        locale === 'en' ? 'poe2-simulated-item.txt' : `poe2-simulated-item.${locale}.txt`
      document.body.append(anchor)
      anchor.click()
      setFeedback({ result, message: '已发起装备文本下载。' })
    } catch {
      setFeedback({ result, message: '下载失败，请复制或选中全部文本后手动保存。' })
    } finally {
      anchor.remove()
      if (url !== undefined) URL.revokeObjectURL(url)
    }
  }

  return (
    <section className="craft-item-text" aria-label="演练装备文本导出">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => (open ? close() : setOpen(true))}
      >
        导出装备文本
      </button>
      <label className="craft-item-text-language" htmlFor={languageId}>
        装备文本语言
        <select
          id={languageId}
          ref={languageRef}
          value={locale}
          onChange={(event) => {
            requestRef.current += 1
            setLocale(event.target.value as ItemLocale)
          }}
        >
          <option value="zh-CN">简体中文</option>
          <option value="zh-TW">繁体中文</option>
          <option value="en">English</option>
        </select>
      </label>
      {open ? (
        <div id={panelId}>
          <p>演练文本用于分享与重新核对；完整历史和精确装备状态请保存演练项目（.craft.json）。</p>
          {pending ? <p>只导出当前已应用装备，待应用结果尚未计入。</p> : null}
          {result?.ok ? (
            <>
              <label htmlFor={textId}>演练装备{LANGUAGES[locale]}文本</label>
              <textarea
                id={textId}
                ref={textRef}
                readOnly
                value={result.value.text}
                rows={12}
                spellCheck={false}
              />
              <ul>
                {result.value.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
              <div className="craft-item-text-actions">
                <button type="button" onClick={copy}>
                  复制{LANGUAGES[locale]}装备文本
                </button>
                <button type="button" onClick={download}>
                  下载装备文本
                </button>
                <button
                  type="button"
                  onClick={() => {
                    textRef.current?.focus()
                    textRef.current?.select()
                  }}
                >
                  选中全部文本
                </button>
              </div>
            </>
          ) : loading ? null : dictionaryResult && !dictionaryResult.ok ? (
            <>
              <p role="alert">
                词典加载失败：{dictionaryResult.error}。可重试或选择 English 导出。
              </p>
              <button type="button" onClick={() => setRetry((value) => value + 1)}>
                重试词典加载
              </button>
            </>
          ) : (
            <p role="alert">{result && !result.ok ? result.error : '无法导出装备文本。'}</p>
          )}
          <p role="status">
            {loading
              ? `正在加载${LANGUAGES[locale]}词典…`
              : feedback?.result === result
                ? feedback?.message
                : ''}
          </p>
          <button type="button" onClick={close}>
            收起装备文本
          </button>
        </div>
      ) : null}
    </section>
  )
}
