import type { GuideDocument, Issue, PreparedBlock } from '@poe2-tools/guide-core'
import { annotate } from './annotate'
import { el } from './dom'

export type BlockState = 'idle' | 'pending' | 'failed' | 'missing' | 'skipped'
export type Origin = 'engine' | 'cache' | 'dictionary'
export type StageState = 'idle' | 'translating' | 'done'

export interface ReadingHandlers {
  onStage(stageId: string): void
  onRetryBlock(id: string): void
  onStop(): void
  onReload(): void
  onSettings(): void
  onFullPage(): void
  onIntroSeen(): void
}

export interface ReadingView {
  root: HTMLElement
  showIntro(show: boolean): void
  showDocument(doc: GuideDocument, blocks: readonly PreparedBlock[], stageId: string | null): void
  /** 读取失败时清空旧文档（标题、站点行、阶段条与段落） */
  clearDocument(): void
  showStage(stageId: string): void
  setTranslation(blockId: string, text: string, origin: Origin, issues: readonly Issue[]): void
  setBlockState(blockId: string, state: BlockState, message?: string): void
  setStageState(stageId: string, state: StageState): void
  setBanner(kind: 'none' | 'setup' | 'error' | 'info', message: string): void
  /** signal 中止或被新的确认框取代时按“取消”（false）结束 */
  ask(message: string, okLabel: string, signal?: AbortSignal): Promise<boolean>
  setUsage(text: string): void
  setBusy(busy: boolean): void
}

const ORIGIN: Record<Origin, string> = {
  engine: '引擎译文',
  cache: '缓存译文',
  dictionary: '词典确认',
}
const STATE: Record<BlockState, string> = {
  idle: '',
  pending: '翻译中…',
  failed: '翻译失败',
  missing: '模型没有返回这一段',
  skipped: '',
}
const STAGE: Record<StageState, string> = { idle: '未翻译', translating: '翻译中', done: '已翻译' }
const UPDATE_URL = 'https://poe2-tools.pine2d.com/extension/'

// Mobalytics 站内跳转后内嵌数据仍是上一个构筑，回退通用读取是预期情况，刷新即可恢复
const fallbackNote = (siteId: GuideDocument['source']['siteId']) =>
  siteId === 'mobalytics'
    ? '页面数据与地址不一致（站内跳转后常见），已改用通用读取；刷新页面可恢复完整阶段'
    : '站点可能改版，可检查扩展更新'

export function createReadingView(doc: Document, h: ReadingHandlers, version: string): ReadingView {
  const title = el(doc, 'p', { class: 'guide-title' })
  const site = el(doc, 'p', { class: 'guide-site' })
  const scopeText = el(doc, 'span')
  const full = el(doc, 'button', { class: 'pt-btn pt-btn--quiet', type: 'button' }, '改为全文')
  full.addEventListener('click', () => {
    scopeText.textContent = '请先在页面上点一下空白处取消选中，再点改为全文。 '
    h.onFullPage()
  })
  const scope = el(doc, 'p', { class: 'guide-scope', hidden: true }, scopeText, full)
  const btn = (label: string, on: () => void) => {
    const b = el(doc, 'button', { class: 'pt-btn pt-btn--quiet', type: 'button' }, label)
    b.addEventListener('click', on)
    return b
  }
  const stop = btn('停止', () => h.onStop())
  stop.hidden = true
  const header = el(
    doc,
    'header',
    { class: 'guide-header' },
    title,
    site,
    scope,
    el(
      doc,
      'div',
      { class: 'guide-actions' },
      btn('重新读取', () => h.onReload()),
      btn('设置', () => h.onSettings()),
      stop,
    ),
  )

  const introOk = btn('知道了', () => {
    intro.hidden = true
    h.onIntroSeen()
  })
  const intro = el(
    doc,
    'section',
    { class: 'guide-intro', hidden: true },
    el(doc, 'p', {}, '点“翻译此页”时，扩展会读取当前标签页的正文一次，不改动原页面。'),
    el(
      doc,
      'p',
      {},
      '只有在你配置了翻译服务后，选中的段落和本段术语才会发给你选择的服务商；扩展不内置任何 Key。',
    ),
    el(doc, 'p', {}, 'Key 与译文缓存只存在本机扩展存储里，未加密，网页读不到；可在“设置”里清除。'),
    introOk,
  )
  const bannerText = el(doc, 'span')
  const bannerAction = btn('配置翻译服务', () => h.onSettings())
  const banner = el(
    doc,
    'div',
    { class: 'guide-banner', role: 'status', hidden: true },
    bannerText,
    bannerAction,
  )
  const askBox = el(doc, 'div', { class: 'guide-ask', role: 'alertdialog', hidden: true })
  let pendingAsk: ((value: boolean) => void) | null = null
  const stagesBar = el(doc, 'nav', {
    class: 'guide-stages',
    'aria-label': '构筑阶段',
    hidden: true,
  })
  const list = el(doc, 'div', { class: 'guide-blocks' })
  const usage = el(doc, 'span', { class: 'guide-usage' })
  const link = el(
    doc,
    'a',
    { href: UPDATE_URL, target: '_blank', rel: 'noopener noreferrer' },
    '检查更新',
  )
  const footer = el(
    doc,
    'footer',
    { class: 'guide-footer' },
    usage,
    el(doc, 'span', {}, `版本 ${version} · `, link),
  )
  const root = el(
    doc,
    'main',
    { class: 'guide' },
    header,
    intro,
    banner,
    askBox,
    stagesBar,
    list,
    footer,
  )

  const items = new Map<
    string,
    {
      node: HTMLElement
      dst: HTMLElement
      status: HTMLElement
      issues: HTMLElement
      retry: HTMLButtonElement
      stageId: string | undefined
    }
  >()
  const stageButtons = new Map<string, HTMLButtonElement>()

  const showStage = (stageId: string) => {
    for (const [id, b] of stageButtons) b.setAttribute('aria-pressed', String(id === stageId))
    for (const item of items.values())
      item.node.hidden = item.stageId !== undefined && item.stageId !== stageId
  }

  return {
    root,
    showIntro(show) {
      intro.hidden = !show
    },
    showDocument(guide, blocks, stageId) {
      title.textContent = guide.source.title
      // 常驻说明写在站点行，不占横幅（横幅会被“配置服务”“出错”覆盖）
      const notes = [
        guide.source.siteId === 'generic' || guide.source.fallback
          ? '通用提取，仅支持 PoE2 术语'
          : '',
        guide.source.fallback ? fallbackNote(guide.source.siteId) : '',
        guide.diagnostics?.length ? '提取达到长度或段数上限，部分内容未完整读取；请缩小选区' : '',
      ].filter(Boolean)
      site.textContent = [new URL(guide.source.url).hostname, ...notes].join(' · ')
      scope.hidden = guide.source.scope !== 'selection'
      scopeText.textContent =
        guide.source.scope === 'selection'
          ? `仅选区（${blocks.reduce((n, b) => n + b.source.length, 0)} 字） · `
          : ''
      stagesBar.replaceChildren()
      stageButtons.clear()
      stagesBar.hidden = guide.stages.length === 0
      for (const s of guide.stages) {
        const b = el(
          doc,
          'button',
          {
            class: 'stage',
            type: 'button',
            'aria-pressed': 'false',
            'data-state': 'idle',
            'aria-description': STAGE.idle,
          },
          s.name,
        )
        b.addEventListener('click', () => h.onStage(s.id))
        stageButtons.set(s.id, b)
        stagesBar.append(b)
      }
      list.replaceChildren()
      items.clear()
      for (const b of blocks) {
        const dst = el(doc, 'p', { class: 'dst', lang: 'zh-CN' })
        const status = el(doc, 'p', { class: 'block-status' })
        const issues = el(doc, 'details', { class: 'issues', hidden: true })
        const retry = el(
          doc,
          'button',
          { class: 'pt-btn pt-btn--quiet retry-block', type: 'button', hidden: true },
          '重新翻译',
        )
        retry.addEventListener('click', () => h.onRetryBlock(b.id))
        const copy = el(
          doc,
          'button',
          { class: 'pt-btn pt-btn--quiet copy-block', type: 'button', hidden: true },
          '复制译文',
        )
        copy.addEventListener(
          'click',
          () => void navigator.clipboard?.writeText(dst.textContent ?? '').catch(() => {}),
        )
        const src = el(doc, 'p', { class: 'src', lang: 'en' })
        src.append(annotate(doc, b.source, b.terms, b.abbreviations))
        const node = el(
          doc,
          'article',
          { class: 'block', 'data-id': b.id, 'data-kind': b.kind },
          src,
          dst,
          status,
          issues,
          el(doc, 'div', { class: 'block-actions' }, copy, retry),
        )
        items.set(b.id, { node, dst, status, issues, retry, stageId: b.stageId })
        list.append(node)
      }
      if (stageId) showStage(stageId)
    },
    clearDocument() {
      title.textContent = ''
      site.textContent = ''
      scope.hidden = true
      scopeText.textContent = ''
      stagesBar.replaceChildren()
      stageButtons.clear()
      stagesBar.hidden = true
      list.replaceChildren()
      items.clear()
    },
    showStage,
    setTranslation(blockId, text, origin, issueList) {
      const item = items.get(blockId)
      if (!item) return
      item.dst.textContent = text
      item.status.textContent = ORIGIN[origin]
      item.node.dataset.origin = origin
      item.retry.hidden = origin === 'dictionary'
      const copy = item.node.querySelector<HTMLButtonElement>('.copy-block')
      if (copy) copy.hidden = false
      item.issues.replaceChildren()
      item.issues.hidden = issueList.length === 0
      if (issueList.length) {
        item.issues.append(el(doc, 'summary', {}, `⚠ 核对提示 ${issueList.length} 条`))
        for (const i of issueList) item.issues.append(el(doc, 'p', {}, i.detail))
      }
    },
    setBlockState(blockId, state, message) {
      const item = items.get(blockId)
      if (!item) return
      item.node.dataset.state = state
      item.status.textContent = message ?? STATE[state]
      item.retry.hidden = !(state === 'failed' || state === 'missing')
    },
    setStageState(stageId, state) {
      const b = stageButtons.get(stageId)
      if (!b) return
      // 状态有文字（CSS ::after 显示，读屏读 aria-description），不只靠颜色
      b.dataset.state = state
      b.setAttribute('aria-description', STAGE[state])
    },
    setBanner(kind, message) {
      banner.hidden = kind === 'none'
      banner.dataset.kind = kind
      bannerText.textContent = message
      bannerAction.hidden = kind !== 'setup'
    },
    ask(message, okLabel, signal) {
      // 同一时间只有一个确认框：旧的先按取消结束，避免其 Promise 永远挂起
      pendingAsk?.(false)
      if (signal?.aborted) return Promise.resolve(false)
      return new Promise<boolean>((resolve) => {
        const onAbort = () => finish(false)
        const finish = (value: boolean) => {
          if (pendingAsk !== finish) return
          pendingAsk = null
          signal?.removeEventListener('abort', onAbort)
          askBox.hidden = true
          askBox.replaceChildren()
          resolve(value)
        }
        pendingAsk = finish
        signal?.addEventListener('abort', onAbort, { once: true })
        const ok = el(doc, 'button', { class: 'pt-btn ask-ok', type: 'button' }, okLabel)
        const cancel = el(
          doc,
          'button',
          { class: 'pt-btn pt-btn--quiet ask-cancel', type: 'button' },
          '取消',
        )
        ok.addEventListener('click', () => finish(true))
        cancel.addEventListener('click', () => finish(false))
        askBox.replaceChildren(el(doc, 'p', {}, message), ok, cancel)
        askBox.hidden = false
        ok.focus()
      })
    },
    setUsage(text) {
      usage.textContent = text
    },
    setBusy(busy) {
      stop.hidden = !busy
      root.setAttribute('aria-busy', String(busy))
    },
  }
}
