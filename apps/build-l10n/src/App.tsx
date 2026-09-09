import type { Locale } from '@poe2-tools/build-core'
import { useEffect, useMemo, useState } from 'react'
import { DropZone } from './components/DropZone'
import { FileList } from './components/FileList'
import { OptionsBar } from './components/OptionsBar'
import { createDictLoader, type FetchJson, type LoadedDict } from './dict/loadDict'
import { saveBlob, textBlob, zipBlob, zipName } from './download/download'
import { pastedSource, readFiles } from './files/readSources'
import { Preview } from './preview/Preview'
import {
  type SourceFile,
  type TranslateOptions,
  type TranslateResult,
  translateSource,
} from './translate/runTranslation'

export type DictState =
  | { status: 'loading' }
  | { status: 'ready'; dict: LoadedDict }
  | { status: 'error'; error: string }

export interface AppProps {
  // 测试注入；生产用全局 fetch 取本站静态文件
  fetchImpl?: FetchJson
}

const BASE = import.meta.env.BASE_URL

function dictStatusText(state: DictState): string {
  if (state.status === 'loading') return '词典加载中…'
  if (state.status === 'error') return `词典加载失败：${state.error}`
  const { locale, info, missing } = state.dict
  const league = info.leagueName === null ? '' : `（${info.leagueName}）`
  const lack = missing.length === 0 ? '' : `，缺少 ${missing.join('、')}`
  return `词典就绪：${locale} ${info.gameVersion ?? '?'}${league}${lack}`
}

export function App({ fetchImpl }: AppProps) {
  const [loader] = useState(() => createDictLoader(BASE, fetchImpl))
  const [locale, setLocale] = useState<Locale>('zh-CN')
  const [options, setOptions] = useState<TranslateOptions>({
    bilingual: false,
    annotateUniques: true,
  })
  const [dictState, setDictState] = useState<DictState>({ status: 'loading' })
  const [sources, setSources] = useState<SourceFile[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pasteCount, setPasteCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    setDictState({ status: 'loading' })
    loader(locale).then((result) => {
      if (cancelled) return
      setDictState(
        result.ok
          ? { status: 'ready', dict: result.dict }
          : { status: 'error', error: result.error },
      )
    })
    return () => {
      cancelled = true
    }
  }, [loader, locale])

  // 兜底：拖到 DropZone 区域外松手时浏览器会打开/导航到该文件，丢失当前页面状态；
  // DropZone 自身的 onDrop 已 preventDefault，这里在冒泡到 window 时再挡一次
  useEffect(() => {
    const stop = (event: Event) => event.preventDefault()
    window.addEventListener('dragover', stop)
    window.addEventListener('drop', stop)
    return () => {
      window.removeEventListener('dragover', stop)
      window.removeEventListener('drop', stop)
    }
  }, [])

  const results = useMemo<TranslateResult[]>(
    () =>
      dictState.status === 'ready'
        ? sources.map((source) => translateSource(source, dictState.dict, options))
        : [],
    [dictState, sources, options],
  )
  const selected = results.find((result) => result.id === selectedId) ?? null
  const translated = results.flatMap((result) => (result.ok ? [result.file] : []))

  const addSources = (added: SourceFile[]) => {
    if (added.length === 0) return
    setSources((previous) => [...previous, ...added])
    setSelectedId((current) => current ?? added[0]?.id ?? null)
  }
  const onFiles = (files: File[]) => {
    readFiles(files).then(addSources)
  }
  const onPaste = (text: string) => {
    const n = pasteCount + 1
    setPasteCount(n)
    addSources([pastedSource(text, n)])
  }
  const remove = (id: string) => {
    setSources((previous) => previous.filter((source) => source.id !== id))
    setSelectedId((current) => (current === id ? null : current))
  }
  const downloadOne = (id: string) => {
    const result = results.find((item) => item.id === id)
    if (result?.ok) saveBlob(textBlob(result.file.output), result.file.name)
  }
  const downloadAll = () => {
    if (translated.length === 1) {
      const only = translated[0]
      if (only !== undefined) saveBlob(textBlob(only.output), only.name)
    } else if (translated.length > 1) {
      saveBlob(zipBlob(translated), zipName(locale))
    }
  }

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__brand">
          <h1>PoE2 构筑汉化</h1>
          <p className="app__subtitle">流放之路 2 构筑汉化</p>
        </div>
        <OptionsBar
          locale={locale}
          options={options}
          canDownload={translated.length > 0}
          onLocale={setLocale}
          onOptions={setOptions}
          onDownloadAll={downloadAll}
        />
      </header>
      <div className="app__body">
        <aside className="app__side">
          <DropZone onFiles={onFiles} onPaste={onPaste} />
          <FileList
            sources={sources}
            results={results}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onRemove={remove}
            onDownload={downloadOne}
          />
        </aside>
        <main className="app__main">
          {selected?.ok ? (
            <Preview file={selected.file} />
          ) : (
            <p className="placeholder">选择左侧文件查看对照预览</p>
          )}
        </main>
      </div>
      <footer className="app__footer">{dictStatusText(dictState)}</footer>
    </div>
  )
}
