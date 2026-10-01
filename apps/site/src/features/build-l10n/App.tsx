import type { Locale } from '@poe2-tools/build-core'
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../../shared/components/Icon'
import { PtFrame } from '../../shared/components/PtFrame'
import { PtPanel } from '../../shared/components/PtPanel'
import { SiteHeader } from '../../shared/components/SiteHeader'
import { createDictLoader, type FetchJson, type LoadedDict } from '../../shared/dict/loadDict'
import { DropZone } from './components/DropZone'
import { EmptyState } from './components/EmptyState'
import { FileList } from './components/FileList'
import { OptionsBar } from './components/OptionsBar'
import { Toast } from './components/Toast'
import { saveBlob, textBlob, zipBlob, zipName } from './download/download'
import { EXAMPLE_BUILD } from './example'
import { pastedSource, readFiles } from './files/readSources'
import { buildFieldRows } from './preview/fields'
import { collectMisses } from './preview/locate'
import { Preview } from './preview/Preview'
import {
  type SourceFile,
  type TranslateOptions,
  type TranslateResult,
  translateSource,
} from './translate/runTranslation'
import { NARROW_QUERY, useMediaQuery } from './useMediaQuery'

export type DictState =
  | { status: 'loading' }
  | { status: 'ready'; dict: LoadedDict }
  | { status: 'error'; error: string }

export interface AppProps {
  // 测试注入；生产用全局 fetch 取本站静态文件
  fetchImpl?: FetchJson
}

const BASE = import.meta.env.BASE_URL

// 词典版本一句话：只在词典状态条显示（脚注不再重复，spec §6.4.1、§6.4.2，B14）
function dictVersion(dict: LoadedDict): string {
  const league = dict.info.leagueName === null ? '' : `（${dict.info.leagueName}）`
  return `${dict.locale} ${dict.info.gameVersion ?? '?'}${league}`
}

// 页头下方的词典状态条（spec §5.12）：外层 role=status 常驻、三态只换内容，读屏按礼貌播报追踪切换；
// 失败态自带恢复动作
function DictBadge({ state, onRetry }: { state: DictState; onRetry(): void }) {
  return (
    <div className="pt-dictbar app__dictbar" role="status" aria-live="polite">
      {state.status === 'loading' && (
        <>
          <span className="pt-dictbar__dot pt-dictbar__dot--loading" aria-hidden="true" />
          <span>词典加载中…</span>
        </>
      )}
      {state.status === 'error' && (
        <>
          <span className="pt-dictbar__dot pt-dictbar__dot--failed" aria-hidden="true" />
          <span>词典加载失败</span>
          <button
            type="button"
            className="pt-btn pt-btn--quiet pt-btn--xs"
            aria-label="重试加载词典"
            onClick={onRetry}
          >
            重试
          </button>
        </>
      )}
      {state.status === 'ready' && (
        <>
          <span className="pt-dictbar__dot" aria-hidden="true" />
          <span>词典就绪</span>
          <b>{dictVersion(state.dict)}</b>
          {state.dict.missing.length > 0 && (
            <span className="app__dictbar-lack">缺少 {state.dict.missing.join('、')}</span>
          )}
        </>
      )}
    </div>
  )
}

// 阻断性错误（spec §5.4、§6.4.1）：pt-panel card，一句人话 + 恢复动作（默认 pt-btn）+ 折叠起来的原始错误
function ErrorCard(props: {
  title: string
  hint: ReactNode
  detail: string
  action?: { label: string; onClick(): void }
  /** 标题元素：框外为 h2（默认）；放在标题栏为 h2 的 pt-frame 里时用 h3，读屏大纲才有层次 */
  headingAs?: 'h2' | 'h3'
}) {
  const { title, hint, detail, action, headingAs: Heading = 'h2' } = props
  return (
    <PtPanel as="section" variant="card" className="app__error">
      <Heading className="app__error-title">
        <Icon name="warning" size={18} />
        {title}
      </Heading>
      <p className="app__error-hint">{hint}</p>
      {action !== undefined && (
        <button type="button" className="pt-btn" onClick={action.onClick}>
          <Icon name="refresh" />
          {action.label}
        </button>
      )}
      <details className="app__error-detail">
        <summary>查看原始错误</summary>
        <code>{detail}</code>
      </details>
    </PtPanel>
  )
}

const IMPORT_TITLE = (
  <>
    导入 <span className="pt-ext">.build</span>
  </>
)

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
  // 下载后的落地引导条。onClose 必须是稳定身份：Toast 用它做自动消失的定时器依赖，
  // 每次渲染换一个新函数会让 4 秒的倒计时被不断重置，条永远不会自己消失。
  const [toast, setToast] = useState<{ message: string; id: number } | null>(null)
  const toastSequence = useRef(0)
  const notifyDownload = (message: string) => {
    toastSequence.current += 1
    setToast({ message, id: toastSequence.current })
  }
  const closeToast = useCallback(() => {
    setToast(null)
  }, [])
  // ≤1099px 侧栏折叠为抽屉，不渲染侧栏 pt-frame（spec §6.7）；抽屉按需展开，切换文件后归还焦点
  const narrow = useMediaQuery(NARROW_QUERY)
  const [sideOpen, setSideOpen] = useState(false)
  const sideToggle = useRef<HTMLButtonElement>(null)

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

  // 输入方式只影响反馈动效，不进入翻译或预览状态。
  useEffect(() => {
    const root = document.documentElement
    const pointer = () => {
      root.dataset.input = 'pointer'
    }
    const keyboard = () => {
      root.dataset.input = 'keyboard'
    }
    window.addEventListener('pointerdown', pointer, true)
    window.addEventListener('keydown', keyboard, true)
    return () => {
      window.removeEventListener('pointerdown', pointer, true)
      window.removeEventListener('keydown', keyboard, true)
      delete root.dataset.input
    }
  }, [])

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
      dictState.status === 'ready' && dictState.dict.locale === locale
        ? sources.map((source) => translateSource(source, dictState.dict, options))
        : [],
    [dictState, sources, options, locale],
  )
  // 翻译结果与导出选项共同生成行模型，预览视图不参与翻译。
  const fieldsById = useMemo(
    () =>
      new Map(
        results.flatMap((result) =>
          result.ok ? [[result.id, buildFieldRows(result.file, options.bilingual)] as const] : [],
        ),
      ),
    [results, options.bilingual],
  )
  // 侧栏文件项的“待核对 n”：与信息行同一口径，按文件用 collectMisses 计算（spec §5.12，B1）
  const missCounts = useMemo(
    () =>
      new Map(
        results.flatMap((result) =>
          result.ok
            ? [
                [
                  result.id,
                  collectMisses(fieldsById.get(result.id) ?? [], result.file.preview).length,
                ] as const,
              ]
            : [],
        ),
      ),
    [results, fieldsById],
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
  const selectFile = (id: string) => {
    setSelectedId(id)
    // 抽屉开着才收起并交还焦点：≤1099px 收起后 <aside> 会 display:none，刚被点击的文件按钮随之消失，
    // 焦点会被重置到 <body>——键盘与读屏用户正好在「选文件 → 看概览」的中间丢掉光标。
    if (sideOpen) {
      setSideOpen(false)
      sideToggle.current?.focus()
    }
  }
  const remove = (id: string) => {
    const index = sources.findIndex((source) => source.id === id)
    const remaining = sources.filter((source) => source.id !== id)
    setSources(remaining)
    if (selectedId === id) {
      setSelectedId(remaining[Math.min(index, remaining.length - 1)]?.id ?? null)
    }
    // 移除按钮即将消失，提交 DOM 后交给相邻文件；最后一份回到导入入口。
    requestAnimationFrame(() => {
      if (remaining.length === 0) {
        document.getElementById('file-input')?.focus()
      } else if (sideOpen) {
        sideToggle.current?.focus()
      } else {
        document.querySelector<HTMLButtonElement>('.pt-file__pick[aria-current="true"]')?.focus()
      }
    })
  }
  const downloadOne = (id: string) => {
    const result = results.find((item) => item.id === id)
    if (!result?.ok) return
    saveBlob(textBlob(result.file.output), result.file.name)
    notifyDownload(`已开始下载 ${result.file.name}`)
  }
  const downloadAll = () => {
    if (translated.length === 1) {
      const only = translated[0]
      if (only === undefined) return
      saveBlob(textBlob(only.output), only.name)
      notifyDownload(
        `已开始下载 ${only.name}，共 1 份${sources.length > 1 ? `；另有 ${sources.length - 1} 份失败未导出` : ''}`,
      )
    } else if (translated.length > 1) {
      const name = zipName(locale)
      saveBlob(zipBlob(translated), name)
      notifyDownload(
        `已开始下载 ${name}，共 ${translated.length} 份${sources.length > translated.length ? `；另有 ${sources.length - translated.length} 份失败未导出` : ''}`,
      )
    }
  }
  // 批量操作只导出成功结果，界面明确给出实际份数。
  const downloadTitle =
    translated.length === 0
      ? '先导入 .build 文件'
      : translated.length === 1
        ? `下载 ${translated[0]?.name ?? ''}`
        : `打包下载 ${translated.length} 个文件（${zipName(locale)}）`

  const empty = sources.length === 0

  // 主区（spec §6.4.1）：词典失败 → 空态引导 → 解析失败 → 预览 → 等词典。
  // 写成带早返回的函数而不是多层嵌套三元：嵌套三元既难读，也可能撞上 lint 规则。
  const renderMain = () => {
    if (dictState.status === 'error') {
      // 词典失败：ErrorCard 在框外（spec §5.4 唯一例外）。没有文件时下面再放一扇“导入 .build”框，
      // 框内只有 DropZone hero（默认 pt-btn，本状态没有 pt-forge-btn）；有文件时主区只放这张 ErrorCard。
      return (
        <>
          <ErrorCard
            title="词典没能加载"
            hint={
              <>
                没有词典就没法翻译。多半是网络或缓存出了<span className="nw">问题</span>
                ，重试一次通常就好。
              </>
            }
            detail={dictState.error}
            action={{ label: '重新加载词典', onClick: () => setReloadKey((n) => n + 1) }}
          />
          {empty && (
            <PtFrame
              variant="hero"
              className="app__import"
              titlebar={{ title: IMPORT_TITLE, as: 'p' }}
            >
              <DropZone variant="hero" onFiles={onFiles} onPaste={onPaste} />
            </PtFrame>
          )}
        </>
      )
    }
    if (empty) {
      return (
        <EmptyState
          onFiles={onFiles}
          onPaste={onPaste}
          onExample={() =>
            onFiles([new File([EXAMPLE_BUILD], 'example.build', { type: 'application/json' })])
          }
        />
      )
    }
    if (selected !== null && !selected.ok) {
      return (
        <PtFrame titlebar={{ title: selected.name, fullText: selected.name, userText: true }}>
          <ErrorCard
            headingAs="h3"
            title="这个文件没法解析"
            hint="它不是合法的 JSON，常见原因是复制内容时被截断了，或者拖错了文件。换一份文件再试。"
            detail={selected.error}
            action={{ label: `移除 ${selected.name}`, onClick: () => remove(selected.id) }}
          />
        </PtFrame>
      )
    }
    if (selected?.ok) {
      return (
        <Preview
          key={selected.id}
          file={selected.file}
          fields={fieldsById.get(selected.id) ?? []}
          locale={locale}
          bilingual={options.bilingual}
          onDownload={() => downloadOne(selected.id)}
        />
      )
    }
    const waiting = sources.find((source) => source.id === selectedId)?.name ?? ''
    return (
      <PtFrame titlebar={{ title: waiting, fullText: waiting, userText: true }}>
        <p className="app__hint" role="status">
          正在准备{locale === 'zh-CN' ? '简体' : '繁体'}中文词典，文件已保留…
        </p>
      </PtFrame>
    )
  }

  // 侧栏内容（spec §6.4.2）：DropZone rail、本次文件、文件列表、批量下载、失败提示、下载帮助
  const side = (
    <>
      <DropZone onFiles={onFiles} onPaste={onPaste} />
      <div className="app__rail-h">
        <span>本次文件</span>
        <span className="pt-num">{sources.length}</span>
      </div>
      <FileList
        sources={sources}
        results={results}
        misses={missCounts}
        selectedId={selectedId}
        onSelect={selectFile}
        onRemove={remove}
      />
      <button
        type="button"
        className="pt-btn pt-btn--quiet pt-btn--block"
        title={downloadTitle}
        disabled={translated.length === 0}
        onClick={downloadAll}
      >
        <Icon name="download" size={18} />
        <span>
          {translated.length < sources.length && dictState.status === 'ready'
            ? `下载成功的 ${translated.length} 份`
            : `下载全部 ${translated.length} 份`}
        </span>
      </button>
      {results.some((result) => !result.ok) && (
        <p className="app__side-warn">解析失败的文件不会导出。</p>
      )}
      <details className="app__download-help">
        <summary className="pt-textbtn pt-textbtn--underline">下载后怎么使用？</summary>
        <p>
          将 .build 文件放进文档目录下的 My Games / Path of Exile 2 /
          BuildPlanner。同名替换前请保留原文件备份。
        </p>
        <p>多文件包先解压。同名文件会加序号区分，按需要选用。</p>
      </details>
    </>
  )

  return (
    <div className="pt-backdrop app">
      <a className="skip-link" href="#build-main">
        跳到主要内容
      </a>
      <SiteHeader active="build">
        <OptionsBar locale={locale} options={options} onLocale={setLocale} onOptions={setOptions} />
      </SiteHeader>
      <DictBadge state={dictState} onRetry={() => setReloadKey((n) => n + 1)} />
      <div className="app__body">
        {!empty && (
          <>
            {/* ≤1099px 才出现的抽屉开关；桌面由 CSS 隐藏，不占网格单元。放在 {!empty} 分支里也是硬要求：
                空态时 <main> 必须仍是 .app__body 的唯一子元素，:only-child 才成立。 */}
            <button
              type="button"
              className="pt-sidetoggle app__sidetoggle"
              ref={sideToggle}
              aria-controls="app-side"
              aria-expanded={sideOpen}
              onClick={() => setSideOpen((open) => !open)}
            >
              <Icon name="chevron-down" size={14} className="app__sidechev" />
              文件 · {selected?.name ?? sources[0]?.name ?? '未选择'}
              <span className="app__sidecount">{sources.length}</span>
            </button>
            <aside id="app-side" className={sideOpen ? 'app__side app__side--open' : 'app__side'}>
              {narrow ? (
                <div className="app__side-inner">{side}</div>
              ) : (
                <PtFrame
                  variant="side"
                  aria-labelledby="side-title"
                  titlebar={{ title: '文件', id: 'side-title' }}
                >
                  {side}
                </PtFrame>
              )}
              <p className="app__side-note">未命中的行保留原文，不做猜测替换</p>
            </aside>
          </>
        )}
        <main id="build-main" tabIndex={-1} className="app__main">
          <h1 className="visually-hidden">PoE2 构筑汉化</h1>
          {renderMain()}
        </main>
      </div>
      {/* Toast 自带一个始终渲染的空容器承载 role="status"，这里不再按 toast !== null 整体卸载/挂载——
          那样每次都是一个新 live region，读屏不保证追踪到。 */}
      <Toast message={toast?.message ?? null} eventId={toast?.id ?? 0} onClose={closeToast} />
    </div>
  )
}
