import {
  type CraftCatalog,
  compareCraftProjects,
  type ItemDictionary,
  parseItem,
} from '@poe2-tools/item-core'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { createDictLoader } from '../../shared/dict/loadDict'
import { type ComparisonPreview, ProjectComparisonResult } from './ProjectComparisonResult'
import { type LibraryEntry, readLibrary } from './projectLibrary'

export const ComparisonDictionaryLoader = createContext<ReturnType<typeof createDictLoader> | null>(
  null,
)

type Props = {
  entries: LibraryEntry[]
  catalog: CraftCatalog
  dictionary: ItemDictionary | undefined
}

export function ProjectComparison({ entries, catalog, dictionary }: Props) {
  const loader = useContext(ComparisonDictionaryLoader)
  const [selecting, setSelecting] = useState(false)
  const [left, setLeft] = useState('')
  const [right, setRight] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<ComparisonPreview | null>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const firstSelect = useRef<HTMLSelectElement>(null)
  const region = useRef<HTMLElement>(null)
  const request = useRef(0)
  // 更换目录或关闭此入口后，迟到的地区词典不能发布旧结果。
  useEffect(() => {
    void catalog
    void dictionary
    setPreview(null)
    setBusy(false)
    return () => {
      request.current++
    }
  }, [catalog, dictionary])
  useEffect(() => {
    if (preview || busy) region.current?.focus()
    else if (selecting) firstSelect.current?.focus()
  }, [selecting, preview, busy])
  function close() {
    request.current++
    setBusy(false)
    setPreview(null)
    setSelecting(false)
    setError('')
    setLeft('')
    setRight('')
    trigger.current?.focus()
  }
  async function dictionaryFor(text: string) {
    if (!loader) return dictionary
    let source: unknown
    try {
      source = JSON.parse(text)?.initialState?.sourceText
    } catch {
      return dictionary
    }
    if (typeof source !== 'string') return dictionary
    const parsed = parseItem(source)
    if (!parsed.ok || parsed.item.locale === 'en') return dictionary
    const result = await loader(parsed.item.locale)
    if (!result.ok) throw Error(`无法加载收藏原文的地区词典。${result.error}`)
    return result.dict.bundle
  }
  async function compare() {
    const token = ++request.current
    setError('')
    setBusy(true)
    try {
      const current = readLibrary(localStorage)
      function selected(key: string) {
        const found = current.find((e) => e.key === key)
        if (!found || found.text === null) throw Error(found?.error ?? '收藏已移除，请重新选择。')
        return { ...found, text: found.text }
      }
      const first = selected(left)
      const second = selected(right)
      if (first.key === second.key) throw Error('请选择两份不同的收藏。')
      const [leftDict, rightDict] = await Promise.all([
        dictionaryFor(first.text),
        dictionaryFor(second.text),
      ])
      if (token !== request.current) return
      const result = compareCraftProjects(first.text, second.text, catalog, leftDict, rightDict)
      if (result.ok)
        setPreview({ names: { left: first.name, right: second.name }, comparison: result.value })
      else setError(result.error)
    } catch (err) {
      if (token === request.current)
        setError(err instanceof Error ? err.message : '无法读取收藏，请刷新后重试。')
    } finally {
      if (token === request.current) setBusy(false)
    }
  }
  const options = (other: string) =>
    entries.map((e, i) => (
      <option key={e.key} value={e.key} disabled={e.key === other || e.text === null}>
        {i + 1}. {e.name}
      </option>
    ))
  return (
    <>
      <button
        type="button"
        ref={trigger}
        aria-expanded={selecting}
        onClick={() => (selecting ? close() : setSelecting(true))}
      >
        比较收藏
      </button>
      {selecting && (
        <section
          className="project-comparison"
          aria-label={preview ? '收藏比较结果' : '选择比较的收藏'}
          tabIndex={-1}
          ref={region}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              close()
            }
          }}
        >
          {preview ? (
            <>
              <ProjectComparisonResult
                preview={preview}
                catalog={catalog}
                dictionary={dictionary}
              />
              <button type="button" onClick={() => setPreview(null)}>
                重新选择
              </button>
              <button type="button" onClick={close}>
                退出比较
              </button>
            </>
          ) : (
            <>
              <p>选择同一起始装备的两份收藏，比较各自保存时的装备、目标和材料。</p>
              <div className="project-comparison-pair">
                <label>
                  第一份收藏
                  <select
                    ref={firstSelect}
                    value={left}
                    disabled={busy}
                    onChange={(e) => {
                      setLeft(e.target.value)
                      setError('')
                    }}
                  >
                    <option value="">选择收藏</option>
                    {options(right)}
                  </select>
                </label>
                <label>
                  第二份收藏
                  <select
                    value={right}
                    disabled={busy}
                    onChange={(e) => {
                      setRight(e.target.value)
                      setError('')
                    }}
                  >
                    <option value="">选择收藏</option>
                    {options(left)}
                  </select>
                </label>
              </div>
              {entries.filter((e) => e.text !== null).length < 2 && <p>需要先收藏两份演练。</p>}
              {error && <p role="alert">{error}</p>}
              <button
                type="button"
                disabled={!left || !right || left === right || busy}
                onClick={() => void compare()}
              >
                {busy ? '正在核对…' : '查看比较'}
              </button>
              <button type="button" onClick={close}>
                取消比较
              </button>
            </>
          )}
        </section>
      )}
    </>
  )
}
