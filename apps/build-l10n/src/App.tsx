import type { Locale } from '@poe2-tools/build-core'
import { useEffect, useMemo, useState } from 'react'
import { DropZone } from './components/DropZone'
import { EmptyState } from './components/EmptyState'
import { FileList } from './components/FileList'
import { Icon } from './components/Icon'
import { OptionsBar } from './components/OptionsBar'
import { createDictLoader, type FetchJson, type LoadedDict } from './dict/loadDict'
import { saveBlob, textBlob, zipBlob, zipName } from './download/download'
import { pastedSource, readFiles } from './files/readSources'
import { buildFieldRows } from './preview/fields'
import { jumpTo, meterCells } from './preview/locate'
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

// 词典版本一句话：徽章与侧栏脚注共用
function dictVersion(dict: LoadedDict): string {
  const league = dict.info.leagueName === null ? '' : `（${dict.info.leagueName}）`
  return `${dict.locale} ${dict.info.gameVersion ?? '?'}${league}`
}

// 顶栏右侧的词典状态徽章：三态各有图标与颜色，失败态自带恢复动作（审计 P0-3）
function DictBadge({ state, onRetry }: { state: DictState; onRetry(): void }) {
  if (state.status === 'loading') {
    return (
      <p className="badge badge--loading">
        <Icon name="refresh" size={14} />
        <span>词典加载中…</span>
      </p>
    )
  }
  if (state.status === 'error') {
    return (
      <p className="badge badge--error">
        <Icon name="warning" size={14} />
        <span>词典加载失败</span>
        <button type="button" className="badge__retry" aria-label="重试加载词典" onClick={onRetry}>
          重试
        </button>
      </p>
    )
  }
  return (
    <p className="badge">
      <span className="badge__dot" />
      <span>词典就绪</span>
      <span className="badge__ver">{dictVersion(state.dict)}</span>
      {state.dict.missing.length > 0 && (
        <span className="badge__lack">缺少 {state.dict.missing.join('、')}</span>
      )}
    </p>
  )
}

// 阻断性错误统一长这样：一句人话 + 恢复动作 + 折叠起来的原始错误
function ErrorCard(props: {
  title: string
  hint: string
  detail: string
  action?: { label: string; onClick(): void }
}) {
  const { title, hint, detail, action } = props
  return (
    <section className="errorcard">
      <h2 className="errorcard__title">
        <Icon name="warning" size={18} />
        {title}
      </h2>
      <p>{hint}</p>
      {action !== undefined && (
        <button type="button" className="cta" onClick={action.onClick}>
          <Icon name="refresh" />
          {action.label}
        </button>
      )}
      <details className="errorcard__detail">
        <summary>查看原始错误</summary>
        <code>{detail}</code>
      </details>
    </section>
  )
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
  // 重试用：createDictLoader 不缓存失败结果，所以再调一次就是真的重来一遍
  const [reloadKey, setReloadKey] = useState(0)

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadKey 不出现在 effect 体里是故意的——它就是「重跑一次」的开关，删掉重试按钮会失效
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
  }, [loader, locale, reloadKey])

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
  // 侧栏迷你轨与概览卡的轨用同一个 meterCells，两处的第 N 格必定是同一行
  const meters = useMemo(
    () =>
      new Map(
        results.flatMap((result) =>
          result.ok
            ? [[result.id, meterCells(buildFieldRows(result.file, options.bilingual))] as const]
            : [],
        ),
      ),
    [results, options.bilingual],
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
  // 文案固定「全部下载」（既有术语），这次点下去到底发生什么写在 title 里
  const downloadTitle =
    translated.length === 1
      ? `下载 ${translated[0]?.name ?? ''}`
      : `打包下载 ${translated.length} 个文件（${zipName(locale)}）`

  const empty = sources.length === 0

  // 主区四选一：词典失败（阻断）→ 空态引导 → 解析失败 → 预览 / 中性提示。
  // 写成带早返回的函数而不是四层嵌套三元：嵌套三元既难读，也可能撞上 lint 规则。
  const renderMain = () => {
    if (dictState.status === 'error') {
      // 词典失败 + 一个文件都没有时，侧栏整条不渲染 —— 如果这里只给一张错误卡，
      // 整页就没有任何文件入口了。补一个 hero 拖放区：先粘贴内容，词典就绪后
      // 翻译结果会自动出现。按钮文案叫「重新加载词典」，与徽章里的「重试」不撞名。
      return (
        <>
          <ErrorCard
            title="词典没能加载"
            hint="没有词典就没法翻译。多半是网络或缓存出了问题，重试一次通常就好。"
            detail={dictState.error}
            action={{ label: '重新加载词典', onClick: () => setReloadKey((n) => n + 1) }}
          />
          {empty && <DropZone variant="hero" onFiles={onFiles} onPaste={onPaste} />}
        </>
      )
    }
    if (empty) {
      return (
        <EmptyState
          dictVersion={dictState.status === 'ready' ? dictVersion(dictState.dict) : null}
          onFiles={onFiles}
          onPaste={onPaste}
        />
      )
    }
    if (selected !== null && !selected.ok) {
      return (
        <ErrorCard
          title="这个文件没法解析"
          hint="它不是合法的 JSON，常见原因是复制内容时被截断了，或者拖错了文件。换一份文件再试。"
          detail={selected.error}
        />
      )
    }
    if (selected?.ok) {
      return (
        <Preview
          file={selected.file}
          locale={locale}
          bilingual={options.bilingual}
          onDownload={() => downloadOne(selected.id)}
        />
      )
    }
    return <p className="hint">从文件列表里选一个，查看中英对照</p>
  }

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__brand">
          <Icon name="brand" size={22} className="app__mark" />
          <h1>PoE2 构筑汉化</h1>
        </div>
        <OptionsBar locale={locale} options={options} onLocale={setLocale} onOptions={setOptions} />
        <div className="app__status">
          <DictBadge state={dictState} onRetry={() => setReloadKey((n) => n + 1)} />
          <button
            type="button"
            className="cta"
            title={downloadTitle}
            disabled={translated.length === 0}
            onClick={downloadAll}
          >
            <Icon name="download" />
            全部下载
          </button>
        </div>
      </header>
      <div className="app__body">
        {!empty && (
          <aside className="app__side">
            <DropZone onFiles={onFiles} onPaste={onPaste} />
            <div className="rail-h">
              <span className="eyebrow">Files</span>
              <span className="rail-h__zh">文件</span>
              <span className="rail-h__n">{sources.length}</span>
            </div>
            <FileList
              sources={sources}
              results={results}
              selectedId={selectedId}
              meters={meters}
              onSelect={setSelectedId}
              onRemove={remove}
              onDownload={downloadOne}
              onJump={(id, domId) => {
                setSelectedId(id)
                jumpTo(domId)
              }}
            />
            {dictState.status === 'ready' && (
              <p className="app__side-note">
                词典 {dictVersion(dictState.dict)}
                <br />
                未命中的行保留英文原文，不做猜测替换
              </p>
            )}
          </aside>
        )}
        <main className="app__main">{renderMain()}</main>
      </div>
    </div>
  )
}
