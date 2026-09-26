import type { Locale } from '@poe2-tools/build-core'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DropZone } from './components/DropZone'
import { EmptyState } from './components/EmptyState'
import { FileList } from './components/FileList'
import { Icon } from './components/Icon'
import { OptionsBar } from './components/OptionsBar'
import { Toast } from './components/Toast'
import { createDictLoader, type FetchJson, type LoadedDict } from './dict/loadDict'
import { saveBlob, textBlob, zipBlob, zipName } from './download/download'
import { pastedSource, readFiles } from './files/readSources'
import { buildFieldRows } from './preview/fields'
import { Preview } from './preview/Preview'
import { type ThemeMode, useTheme } from './theme/useTheme'
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

const THEMES: readonly { value: ThemeMode; label: string }[] = [
  { value: 'system', label: '跟随系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
]

// 主题跟随系统或用户选择，使用原生 radio 保留键盘分组行为。
function ThemeSeg({ mode, onMode }: { mode: ThemeMode; onMode(mode: ThemeMode): void }) {
  return (
    <div className="seg seg--theme" role="radiogroup" aria-label="界面主题">
      {THEMES.map((item) => (
        <label
          key={item.value}
          className={mode === item.value ? 'seg__item seg__item--on' : 'seg__item'}
        >
          <input
            type="radio"
            name="theme-mode"
            value={item.value}
            className="visually-hidden"
            checked={mode === item.value}
            onChange={() => onMode(item.value)}
          />
          {item.label}
        </label>
      ))}
    </div>
  )
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
  const theme = useTheme()
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
  // 中小屏文件区按需展开，桌面常驻；切换文件后归还焦点。
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
    // 抽屉开着才收起并交还焦点：中小屏 收起后 <aside> 会 display:none，刚被点击的
    // .filelist__name 随之消失，焦点被重置到 <body>——键盘与 VoiceOver 用户正好在
    // 「选文件 → 看概览」的中间丢掉光标。桌面 时 sideOpen 恒 false，这里什么都不做。
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
        document.querySelector<HTMLButtonElement>('.filelist__name[aria-current="true"]')?.focus()
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
          action={{ label: `移除 ${selected.name}`, onClick: () => remove(selected.id) }}
        />
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
    return (
      <p className="hint" role="status">
        正在准备{locale === 'zh-CN' ? '简体' : '繁体'}中文词典，文件已保留…
      </p>
    )
  }

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__brand">
          <Icon name="brand" size={22} className="app__mark" />
          <h1>PoE2 构筑汉化</h1>
        </div>
        <a className="app__tool-link" href={`${BASE}craft/`}>
          装备工坊
        </a>
        <OptionsBar locale={locale} options={options} onLocale={setLocale} onOptions={setOptions}>
          <h2>界面主题</h2>
          <ThemeSeg mode={theme.mode} onMode={theme.setMode} />
        </OptionsBar>
      </header>
      <div className="app__live" role="status" aria-live="polite">
        <DictBadge state={dictState} onRetry={() => setReloadKey((n) => n + 1)} />
      </div>
      <div className="app__body">
        {!empty && (
          <>
            {/* 中小屏 才出现的抽屉开关。桌面 时 display:none —— 它必须真的不占 grid 单元，
                否则 .app__body 的两列会被挤成三份。放在 {!empty} 分支里也是硬要求：
                空态时 <main> 必须仍是 .app__body 的唯一子元素，:only-child 才成立。 */}
            <button
              type="button"
              className="app__sidetoggle"
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
              <DropZone onFiles={onFiles} onPaste={onPaste} />
              <div className="rail-h">
                <span className="rail-h__zh">本次文件</span>
                <span className="rail-h__n">{sources.length}</span>
              </div>
              <FileList
                sources={sources}
                results={results}
                selectedId={selectedId}
                onSelect={selectFile}
                onRemove={remove}
              />
              <button
                type="button"
                className="button batch-download"
                title={downloadTitle}
                disabled={translated.length === 0}
                onClick={downloadAll}
              >
                <Icon name="download" />
                {translated.length < sources.length && dictState.status === 'ready'
                  ? `下载成功的 ${translated.length} 份`
                  : `下载全部 ${translated.length} 份`}
              </button>
              {results.some((result) => !result.ok) && (
                <p className="muted">解析失败的文件不会导出。</p>
              )}
              <details className="download-help">
                <summary>下载后怎么使用？</summary>
                <p>
                  将 .build 文件放进文档目录下的 My Games / Path of Exile 2 /
                  BuildPlanner。同名替换前请保留原文件备份。
                </p>
                <p>多文件包先解压。同名文件会加序号区分，按需要选用。</p>
              </details>
              {dictState.status === 'ready' && (
                <p className="app__side-note">
                  词典 {dictVersion(dictState.dict)}
                  <br />
                  未命中的行保留英文原文，不做猜测替换
                </p>
              )}
            </aside>
          </>
        )}
        <main className="app__main">{renderMain()}</main>
      </div>
      {/* Toast 自带一个始终渲染的空容器承载 role="status"（控制者追加 g），这里不再按
          toast !== null 整体卸载/挂载——那样每次都是一个新 live region，读屏不保证追踪到。 */}
      <Toast message={toast?.message ?? null} eventId={toast?.id ?? 0} onClose={closeToast} />
    </div>
  )
}
