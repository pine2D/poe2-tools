import {
  acceptCachedTranslation,
  acceptTranslation,
  buildMessages,
  type ChatMessage,
  cacheKey,
  chunkBlocks,
  createMatcher,
  createTagSplitter,
  type GuideDictionary,
  type GuideDocument,
  type GuideStats,
  type Issue,
  PROMPT_VERSION,
  type PreparedBlock,
  type PreserveReason,
  parseExtractResult,
  prepareGuideBlocks,
  sendable,
  translatedTerms,
} from '@poe2-tools/guide-core'
import type { PageNotice, PageResult, PageTranslation } from '../extract/inline'
import type { ReadingMode } from '../extract/session'
import { type ChunkResult, EngineError } from './engines/openai'
import { estimateTokens, REQUEST_PARAMS } from './engines/presets'
import type { GuidePrefs } from './prefs'
import type { GuideStore } from './store/types'
import type { Origin, ReadingView } from './view-reading'

export type ReadScope = 'full' | 'selection' | 'region'
export interface PageBridge {
  check(snapshot: string): Promise<boolean>
  notice?(snapshot: string, notice: PageNotice): Promise<PageResult>
  render(snapshot: string, result: PageTranslation): Promise<PageResult>
  remove(snapshot: string, id: string, revision: string): Promise<void>
  reset(snapshot: string, revision: string): Promise<void>
  mode(mode: ReadingMode): Promise<void>
  locate(snapshot: string, id: string): Promise<PageResult>
  clear(): Promise<void>
}

export interface EngineRunner {
  run(
    messages: readonly ChatMessage[],
    onText: (delta: string) => void,
    signal: AbortSignal,
  ): Promise<ChunkResult>
}

export interface EngineHandle {
  runner: EngineRunner
  provider: string
  model: string
  params: string
  costText(prompt: number, completion: number): string
  outputLimit?: number
  /** 发送目标主机，用于开始翻译旁的发送摘要与超限确认 */
  host?: string
}

export interface ControllerDeps {
  extract(scope: ReadScope): Promise<unknown>
  page?: PageBridge
  dictionary(): Promise<GuideDictionary>
  stats: GuideStats
  store: GuideStore
  prefs(): Promise<GuidePrefs>
  engine(): Promise<EngineHandle | null>
  view: Omit<ReadingView, 'root' | 'showIntro' | 'showStage' | 'rememberPosition'>
  random(): string
}

export interface Controller {
  /** 清除服务设置后调用：不再显示发往旧服务的发送摘要 */
  forgetEngine(): void
  start(scope?: ReadScope, options?: { preserveSelection: boolean }): Promise<void>
  selectStage(stageId: string | null): Promise<void>
  preview(ids?: readonly string[]): Promise<void>
  begin(): Promise<void>
  setMode(mode: ReadingMode): Promise<void>
  locate(id: string): Promise<void>
  restore(): Promise<void>
  checkPage(): Promise<void>
  retryBlock(id: string): Promise<void>
  stop(): void
}

const REASONS = {
  coe: 'CoE 页面请使用扩展原有的中文显示，这里不翻译。',
  poe1: '这是 PoE1 页面，本工具只支持 PoE2。',
  empty: '没有读到所选范围的正文。请选中文字或点选区域后重新读取。',
} as const

const PRESERVED: Record<PreserveReason, string> = {
  unmatched: '词典未收录，原样保留',
  ambiguous: '词缀存在多个译义，原样保留',
  'source-untranslated': '来源尚未提供中文，原样保留',
  verbatim: '原样保留',
  truncated: '提取已截断，原样保留；请缩小选区重新读取',
}

/** 一次翻译任务：被新任务、停止或重新读取取代时整体中止，之后不再写入任何状态 */
interface Run {
  controller: AbortController
  /** 发起任务的阶段；undefined 表示单段重试 */
  stageId: string | null | undefined
  /** 本任务标为“翻译中”、还没有结果的段落 */
  inflight: Set<string>
  /** 任务结束（完成或被中止）时兑现，排队的单段重试据此接着执行 */
  ended: Promise<void>
  end(): void
}

interface Failure {
  state: 'failed' | 'missing'
  message: string | undefined
}

function newRun(stageId: string | null | undefined): Run {
  let end = () => {}
  const ended = new Promise<void>((resolve) => (end = resolve))
  return { controller: new AbortController(), stageId, inflight: new Set(), ended, end }
}

export function createController(deps: ControllerDeps): Controller {
  const { view } = deps
  // 读取成功后才有文档；读取中或读取失败时为 null，阶段与重试操作一律不执行
  let guide: GuideDocument | null = null
  let blocks: PreparedBlock[] = []
  let dictHash = ''
  let dictionary: GuideDictionary | null = null
  let currentStage: string | null = null
  let mode: ReadingMode = 'inline'
  let revision = 0
  const done = new Set<string>()
  // 当前范围的失败状态在暂停时保留；改选范围后按新语境重新检查缓存。
  const failures = new Map<string, Failure>()
  let active: Run | null = null
  // 排队等当前任务结束的单段重试；停止或重新读取时整体作废
  let queueEpoch = 0
  const queued = new Set<string>()
  // 每次 start() 加一；旧文档的任务与回调据此放弃写入
  let generation = 0
  let tokens = { prompt: 0, completion: 0 }
  let cacheHits = 0
  // 最近一次读取到的服务；未配置时为 null，发送摘要随之隐藏
  let lastEngine: EngineHandle | null = null
  // 与超限检查同一口径：正文加本段携带的原文语境
  const sendChars = (list: readonly PreparedBlock[]) =>
    list.reduce((n, b) => n + b.source.length + (b.context?.text.length ?? 0), 0)
  const usageText = (engine: EngineHandle) =>
    `本次约 ${tokens.prompt}+${tokens.completion} tokens · ${engine.costText(tokens.prompt, tokens.completion)} · 缓存命中 ${cacheHits} 段`

  const keyOf = (b: PreparedBlock, e: EngineHandle) =>
    cacheKey({
      text: b.source,
      protectedText: b.protectedText,
      tokens: b.tokens,
      ...(b.restoreTokens ? { restoreTokens: b.restoreTokens } : {}),
      ...(b.processing ? { processing: b.processing } : {}),
      game: 'poe2',
      locale: 'zh-CN',
      dictHash,
      terms: b.terms,
      provider: e.provider,
      model: e.model,
      params: e.params,
      promptVersion: PROMPT_VERSION,
    })

  // 未完成的段：之前失败过的回到失败状态，其余回到 idle
  const resetBlock = (id: string) => {
    const f = failures.get(id)
    if (f) view.setBlockState(id, f.state, f.message)
    else view.setBlockState(id, 'idle')
  }
  const markFailed = (run: Run, id: string, state: Failure['state'], message?: string) => {
    run.inflight.delete(id)
    done.delete(id)
    failures.set(id, { state, message })
    view.setBlockState(id, state, message)
    const snapshot = guide?.source.snapshotId
    if (snapshot) void deps.page?.remove(snapshot, id, String(revision)).catch(() => {})
    progress()
  }

  // 同步中止当前任务：未完成段复位，挂起的确认框随信号按取消结束
  function cancelRun(): boolean {
    const run = active
    if (!run) return false
    active = null
    run.controller.abort()
    for (const id of run.inflight) if (!done.has(id)) resetBlock(id)
    run.end()
    return true
  }

  // 作废排队中的单段重试，段落复位
  function dropQueued() {
    queueEpoch++
    for (const id of queued) resetBlock(id)
    queued.clear()
  }

  const progress = () => {
    const preserved = blocks.filter((b) => b.route?.kind === 'preserved').length
    view.setProgress({
      selected: blocks.length,
      completed: done.size,
      failed: failures.size,
      preserved,
      characters: blocks.reduce((n, b) => n + b.source.length, 0),
    })
    // 摘要只统计点击开始后会发送的段落（已缓存、词典直译与原样保留的不算）。
    const pending = guide ? stageTargets(currentStage) : []
    view.setSendSummary?.(
      lastEngine && pending.length
        ? {
            blocks: pending.length,
            chars: sendChars(pending),
            host: lastEngine.host ?? lastEngine.provider,
            preserved,
          }
        : null,
    )
  }
  const invalidate = () => {
    generation++
    dropQueued()
    cancelRun()
    guide = null
    for (const block of blocks)
      view.setPageState(block.id, { state: 'stale', message: '原文位置已失效，请重新读取。' })
    view.setBusy(false)
    view.setReady(false)
    view.setBanner('error', '原文已变化或页面已更换，请重新读取后继续。')
  }
  const validPage = async (live: () => boolean) => {
    const snapshot = guide?.source.snapshotId
    if (!snapshot || !deps.page) return live()
    let valid = false
    try {
      valid = await deps.page.check(snapshot)
    } catch {
      /* 页面已退出。 */
    }
    if (!live()) return false
    if (!valid) invalidate()
    return valid
  }
  const publish = async (
    id: string,
    text: string,
    origin: Origin,
    issues: readonly Issue[],
    live: () => boolean,
  ) => {
    if (!(await validPage(live))) return false
    const snapshot = guide?.source.snapshotId
    if (snapshot && deps.page) {
      let state: PageResult
      try {
        state = await deps.page.render(snapshot, {
          id,
          text,
          origin,
          issues,
          revision: String(revision),
          terms: translatedTerms(text, blocks.find((b) => b.id === id)?.terms ?? []),
        })
      } catch {
        state = { state: 'stale', message: '页面已更换，请重新读取。' }
      }
      if (!live()) return false
      if (state.state === 'stale') {
        invalidate()
        return false
      }
      view.setPageState(id, state)
    }
    if (!live()) return false
    view.setTranslation(id, text, origin, issues)
    return true
  }

  async function translate(
    targets: PreparedBlock[],
    force: boolean,
    stageId: string | null | undefined,
    previewOnly = false,
  ): Promise<void> {
    // 先同步登记，保证旧任务在新任务的任何 await 之前就已失效
    cancelRun()
    const run = newRun(stageId)
    active = run
    const { signal } = run.controller
    const live = () => !signal.aborted
    view.setBusy(true)
    if (!previewOnly) view.setBanner('none', '')
    try {
      if (!targets.length) {
        view.setUsage('所选范围无需新增模型请求。')
        return
      }
      let engine: EngineHandle | null
      try {
        engine = await deps.engine()
      } catch {
        lastEngine = null
        if (live()) view.setBanner('error', '读取翻译服务设置失败，请重新打开侧边栏。')
        return
      }
      lastEngine = engine
      if (!(await validPage(live))) return
      if (!engine) {
        view.setBanner('setup', '配置翻译服务后即可整段翻译；现在显示原文与术语标注。')
        return
      }
      const pending: PreparedBlock[] = []
      const keys = new Map<string, string>()
      for (const b of targets) {
        const key = await keyOf(b, engine)
        if (!live()) return
        keys.set(b.id, key)
        let hit: Awaited<ReturnType<GuideStore['getCached']>> = null
        if (!force) {
          try {
            hit = await deps.store.getCached(key)
          } catch {
            hit = null // 缓存不可用按未命中处理
          }
          if (!live()) return
        }
        if (hit) {
          const accepted = acceptCachedTranslation(b, hit.text, hit.issues)
          if (accepted.accepted) {
            if (!(await publish(b.id, accepted.text, 'cache', accepted.issues, live))) return
            done.add(b.id)
            failures.delete(b.id)
            cacheHits++
          } else {
            markFailed(run, b.id, 'failed', accepted.reason)
            // 预览阻断坏缓存；只有用户明确开始时才请求替换。
            if (!previewOnly) pending.push(b)
          }
        } else pending.push(b)
      }
      // 实际准备的提示只构造一次；估算包含术语、语境、协议，并预留每批完整输出上限。
      const requests = chunkBlocks(pending).map((chunk) => ({
        chunk,
        messages: buildMessages(chunk, deps.random()),
      }))
      const chars = sendChars(pending)
      const promptEstimate = requests.reduce(
        (n, r) =>
          n + Math.ceil(estimateTokens(r.messages.map((m) => m.content).join('\n')) * 1.3) + 16,
        0,
      )
      const outputReserve = requests.length * (engine.outputLimit ?? REQUEST_PARAMS.max_tokens)
      view.setUsage(
        pending.length
          ? `待翻译 ${pending.length} 段，输入约 ${promptEstimate} tokens · 输出预留 ${outputReserve} tokens · ${engine.costText(promptEstimate, outputReserve)}`
          : usageText(engine),
      )
      if (previewOnly) return
      let prefs: GuidePrefs
      try {
        prefs = await deps.prefs()
      } catch {
        if (live()) view.setBanner('error', '读取设置失败，请重新打开侧边栏。')
        return
      }
      if (!live()) return
      if (chars > prefs.charLimit) {
        const ok = await view.ask(
          `本次将发送 ${pending.length} 段到 ${engine.host ?? engine.provider}，正文和原文语境约 ${chars} 个字符，超过设定的 ${prefs.charLimit}，继续吗？`,
          '继续翻译',
          signal,
        )
        if (!live()) return
        if (!ok) {
          view.setBanner('info', '已取消发送。可以切换阶段、选中部分文字，或在设置里调高上限。')
          return
        }
      }
      for (const { chunk, messages } of requests) {
        if (!(await validPage(live))) return
        for (const b of chunk) {
          run.inflight.add(b.id)
          view.setBlockState(b.id, 'pending')
        }
        let streamed = ''
        const received = new Map<string, string>()
        const splitter = createTagSplitter(
          chunk.map((b) => b.id),
          (id, raw) => {
            if (!live()) return
            const b = chunk.find((x) => x.id === id)
            if (!b) return
            received.set(id, raw)
            const accepted = acceptTranslation(b, raw, null)
            if (!accepted.accepted) markFailed(run, id, 'failed', accepted.reason)
            else view.setBlockState(id, 'pending', '译文已收到，等待请求结束')
          },
        )
        try {
          const result = await engine.runner.run(
            messages,
            (d) => {
              if (!live()) return
              streamed += d
              splitter.push(d)
            },
            signal,
          )
          if (!(await validPage(live))) return
          // 只在本次请求正常结束且仍有效时保存；流中已闭合的段也要接受最终截断检查。
          for (const [id, raw] of received) {
            const b = chunk.find((x) => x.id === id)
            if (!b) continue
            const accepted = acceptTranslation(b, raw, result.finishReason)
            if (!accepted.accepted) {
              markFailed(run, id, 'failed', accepted.reason)
              continue
            }
            const { text, issues } = accepted
            if (!(await publish(id, text, 'engine', issues, live))) return
            done.add(id)
            run.inflight.delete(id)
            failures.delete(id)
            const key = keys.get(id)
            progress()
            if (key) void deps.store.putCached({ hash: key, text, issues }).catch(() => {})
          }
          // 服务没回用量时：输入按提示词估算，输出按已收到的流式文本估算
          const usage = result.usage ?? {
            prompt: estimateTokens(messages.map((m) => m.content).join('')),
            completion: estimateTokens(streamed),
          }
          tokens = {
            prompt: tokens.prompt + usage.prompt,
            completion: tokens.completion + usage.completion,
          }
          view.setUsage(usageText(engine))
          for (const id of splitter.end())
            markFailed(
              run,
              id,
              'missing',
              result.finishReason === 'length' ? '输出被截断，可单独重试' : undefined,
            )
        } catch (error) {
          // 已被取代或停止：cancelRun 已复位本任务的段落，这里不再写任何状态
          if (!live()) return
          const kind = error instanceof EngineError ? error.kind : 'network'
          const unfinished = chunk.filter((b) => !done.has(b.id))
          if (kind === 'aborted') {
            for (const b of pending.filter((x) => !done.has(x.id))) resetBlock(b.id)
            break
          }
          const message = error instanceof Error ? error.message : '翻译失败'
          for (const b of unfinished) markFailed(run, b.id, 'failed', message)
          if (kind === 'auth') {
            view.setBanner('setup', message) // 横幅带“配置翻译服务”按钮，直达设置
            break
          }
          if (kind === 'balance' || kind === 'rate') {
            // 不自动重试付费请求；由用户选择何时重新发送。
            view.setBanner('error', message)
            break
          }
        }
      }
    } finally {
      // 只有仍是当前任务时才收尾，避免旧任务隐藏新任务的停止按钮
      if (active === run) {
        const snapshot = guide?.source.snapshotId
        if (snapshot && deps.page?.notice)
          for (const [id, failure] of failures) {
            if (active !== run || signal.aborted) break
            await deps.page
              .notice(snapshot, {
                id,
                revision: String(revision),
                message: `翻译失败：${failure.message ?? '模型未返回此段'}。可在侧栏的异常列表中重试。`,
              })
              .catch(() => {})
          }
      }
      if (active === run) {
        active = null
        view.setBusy(false)
        progress()
      }
      run.end()
    }
  }

  const stageTargets = (stageId: string | null) =>
    blocks.filter(
      (b) =>
        sendable(b) &&
        !done.has(b.id) &&
        (stageId === null || b.stageId === undefined || b.stageId === stageId),
    )

  async function preview(ids?: readonly string[]) {
    if (!guide || !dictionary) return
    const gen = ++generation
    revision++
    dropQueued()
    cancelRun()
    view.setBusy(true)
    view.setReady(false)
    view.setBanner('none', '')
    const current = guide
    const allowed = ids ? new Set(ids) : null
    const raw = current.blocks.filter(
      (b) =>
        (currentStage === null || b.stageId === undefined || b.stageId === currentStage) &&
        (!allowed || allowed.has(b.id)),
    )
    try {
      const snapshot = current.source.snapshotId
      if (snapshot && deps.page) await deps.page.reset(snapshot, String(revision))
      if (gen !== generation) return
      done.clear()
      failures.clear()
      blocks = []
      const prepared = await prepareGuideBlocks(raw, createMatcher(dictionary), deps.stats)
      if (gen !== generation) return
      blocks = prepared
      view.showDocument(
        current,
        blocks,
        currentStage,
        raw.map((b) => b.id),
      )
      for (const b of blocks) {
        if (b.route?.kind === 'dictionary') {
          if (!(await publish(b.id, b.route.text, 'dictionary', [], () => gen === generation)))
            return
          done.add(b.id)
        } else if (b.route?.kind === 'preserved')
          view.setBlockState(b.id, 'skipped', PRESERVED[b.route.reason])
      }
      await translate(stageTargets(currentStage), false, currentStage, true)
      if (gen !== generation) return
      view.setReady(blocks.some(sendable))
      progress()
    } catch {
      if (gen === generation) view.setBanner('error', '正文准备失败，请重新读取页面。')
    } finally {
      if (gen === generation) view.setBusy(false)
    }
  }

  return {
    forgetEngine() {
      lastEngine = null
      progress()
    },
    async start(scope = 'full', options) {
      const previous =
        options?.preserveSelection && guide
          ? { guide, stage: currentStage, ids: blocks.map((b) => b.id) }
          : null
      const gen = ++generation
      dropQueued()
      cancelRun()
      view.setBusy(true)
      view.setReady(false)
      guide = null
      view.setBanner('none', '')
      const fail = (message: string) => {
        if (gen !== generation) return
        blocks = []
        done.clear()
        failures.clear()
        view.clearDocument()
        view.setBusy(false)
        view.setBanner('error', message)
      }
      let raw: unknown
      try {
        raw = await deps.extract(scope)
      } catch {
        fail('页面已更换或无法读取，请在攻略页重新点扩展图标。')
        return
      }
      if (gen !== generation) return
      if (raw === null && scope === 'region') {
        fail('区域选择已取消；可重新点选区域或读取整页。')
        return
      }
      const result = parseExtractResult(raw)
      if (!result) {
        fail('读取结果无效，请刷新攻略页后重试。')
        return
      }
      if (!result.ok) {
        fail(REASONS[result.reason])
        return
      }
      try {
        dictionary = await deps.dictionary()
      } catch {
        fail('术语词典载入失败，请重新打开侧边栏。')
        return
      }
      if (gen !== generation) return
      guide = result.doc
      dictHash = dictionary.hash
      tokens = { prompt: 0, completion: 0 }
      cacheHits = 0
      // 重读会生成新快照，段落编号也可能被复用；只恢复正文与结构都一致的范围。
      // 不比较提取时间、快照号或站点默认阶段，保留用户自己的阶段选择。
      const unchanged =
        previous &&
        previous.guide.source.url === guide.source.url &&
        previous.guide.source.scope === guide.source.scope &&
        previous.guide.source.siteId === guide.source.siteId &&
        JSON.stringify(previous.guide.blocks) === JSON.stringify(guide.blocks) &&
        JSON.stringify(previous.guide.stages.map(({ id, name }) => ({ id, name }))) ===
          JSON.stringify(guide.stages.map(({ id, name }) => ({ id, name })))
      currentStage = unchanged ? previous.stage : (guide.stages.find((s) => s.current)?.id ?? null)
      try {
        await deps.page?.mode(mode)
      } catch {
        fail('无法连接原页面，请重新读取。')
        return
      }
      if (gen !== generation) return
      const previewGeneration = generation + 1
      await preview(options?.preserveSelection ? (unchanged ? previous.ids : []) : undefined)
      if (options?.preserveSelection && !unchanged && generation === previewGeneration)
        view.setBanner('info', '原文或读取范围已变化，请在“翻译范围”中重新选择章节。')
    },
    preview,
    async selectStage(stageId) {
      if (!guide) return
      currentStage = stageId
      await preview()
    },
    async begin() {
      const gen = generation
      if (!guide) return
      if (currentStage) view.setStageState(currentStage, 'translating')
      await translate(stageTargets(currentStage), false, currentStage)
      if (gen === generation && currentStage && !active)
        view.setStageState(currentStage, stageTargets(currentStage).length ? 'idle' : 'done')
    },
    async setMode(next) {
      mode = next
      try {
        await deps.page?.mode(next)
      } catch {
        invalidate()
      }
    },
    async locate(id) {
      const snapshot = guide?.source.snapshotId
      if (!snapshot || !deps.page) {
        view.setPageState(id, { state: 'sidebar', message: '此段只能在侧栏阅读。' })
        return
      }
      const gen = generation
      try {
        const state = await deps.page.locate(snapshot, id)
        if (gen === generation) {
          view.setPageState(id, state)
          if (state.state === 'stale') invalidate()
        }
      } catch {
        if (gen === generation) invalidate()
      }
    },
    async restore() {
      generation++
      dropQueued()
      cancelRun()
      guide = null
      view.setBusy(false)
      view.setReady(false)
      await deps.page?.clear()
      view.setBanner('info', '已恢复原文；侧栏译文仍可查看。继续翻译请重新读取。')
    },
    async checkPage() {
      if (guide) {
        const gen = generation
        await validPage(() => gen === generation)
      }
    },
    async retryBlock(id) {
      if (!guide || queued.has(id)) return
      const b = blocks.find((x) => x.id === id && sendable(x))
      if (!b) return
      // 有任务进行中时排队，等它结束再重试，不中止正在翻译的阶段
      if (active) {
        const epoch = queueEpoch
        queued.add(id)
        view.setBlockState(id, 'pending', '排队中，当前任务结束后重试')
        while (active && epoch === queueEpoch) await active.ended
        if (epoch !== queueEpoch) return
        queued.delete(id)
        // 排队期间已被阶段任务译出，不再重复请求
        if (done.has(id)) return
      }
      done.delete(id)
      await translate([b], true, undefined)
    },
    stop() {
      generation++
      dropQueued()
      cancelRun()
      view.setBusy(false)
    },
  }
}
