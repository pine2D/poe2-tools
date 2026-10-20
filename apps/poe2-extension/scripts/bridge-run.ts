// 固定衔接候选与冻结 guide-v7 的同期对照。默认只做全周期离线预检。
import { randomBytes } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  buildMessages,
  type ChatMessage,
  checkTranslation,
  chunkBlocks,
  createMatcher,
  createTagSplitter,
  type GuideBlock,
  type GuideDictionary,
  type PreparedBlock,
  prepareGuideBlocks,
  restore,
  sendable,
} from '@poe2-tools/guide-core'
import { createGameLexicon, type Term } from '@poe2-tools/l10n-core'
import { redact, streamChat } from '../src/guide/engines/openai'
import { DEEPSEEK, REQUEST_PARAMS } from '../src/guide/engines/presets'
import { readSse } from '../src/guide/engines/sse'
import {
  type CyclePlan,
  checkPlan,
  digest,
  type Gates,
  newBudget,
  type RequestSpec,
  runJobs,
  type Stage,
} from './bridge-quality'

interface Fixture {
  documents: { name: string; blocks: GuideBlock[] }[]
  repeatIds?: string[]
}
interface Pipeline {
  prepare(blocks: readonly GuideBlock[]): Promise<PreparedBlock[]>
  messages(blocks: readonly PreparedBlock[], delimiter: string): ChatMessage[]
  check: typeof checkTranslation
}
interface Projection {
  hash: string
  ruleVersion: string
  terms: Term[]
}
interface Request extends RequestSpec {
  document: string
  targets: PreparedBlock[]
  messages: ChatMessage[]
}
interface Local {
  id: string
  stage: Stage
  text: string
  origin: 'dictionary' | 'preserved'
  reason?: string
}
interface RecordPlan extends CyclePlan {
  jobs: Request[]
  local: Local[]
  model: string
  params: Record<string, unknown>
}

export function candidatePipeline(dict: GuideDictionary, stats: Projection): Pipeline {
  const matcher = createMatcher(dict)
  const lexicon = createGameLexicon(stats.terms)
  return {
    prepare: (blocks) =>
      prepareGuideBlocks(blocks, matcher, {
        hash: stats.hash,
        ruleVersion: stats.ruleVersion,
        resolve: lexicon.resolveStat,
      }),
    messages: buildMessages,
    check: checkTranslation,
  }
}
export async function requestsFor(fixture: Fixture, stage: Stage, pipeline: Pipeline) {
  const jobs: Request[] = []
  const local: Local[] = []
  const wanted = stage.startsWith('stability') ? new Set(fixture.repeatIds ?? []) : null
  for (const doc of fixture.documents) {
    // 稳定性只筛目标，语境仍从同一整组选定原文构造。
    const prepared = await pipeline.prepare(doc.blocks)
    const targets = prepared.filter((b) => !wanted || wanted.has(b.id))
    for (const b of targets.filter((b) => !sendable(b)))
      local.push({
        id: b.id,
        stage,
        text: b.route?.kind === 'dictionary' ? b.route.text : b.source,
        origin: b.route?.kind === 'dictionary' ? 'dictionary' : 'preserved',
        ...(b.route?.kind === 'preserved' ? { reason: b.route.reason } : {}),
      })
    for (const chunk of chunkBlocks(targets.filter(sendable))) {
      const messages = pipeline.messages(chunk, randomBytes(8).toString('hex'))
      const key = digest(JSON.stringify([stage, doc.name, chunk.map((b) => b.id), messages]))
      const upperTokens =
        Buffer.byteLength(JSON.stringify(messages), 'utf8') + 512 + REQUEST_PARAMS.max_tokens
      jobs.push({
        key,
        stage,
        ids: chunk.map((b) => b.id),
        upperTokens,
        document: doc.name,
        targets: chunk,
        messages,
      })
    }
  }
  return { jobs, local }
}
export function evaluate(
  blocks: readonly PreparedBlock[],
  raw: string,
  reason: string | null,
  check: typeof checkTranslation = checkTranslation,
) {
  const found = new Map<string, string>()
  const splitter = createTagSplitter(
    blocks.map((b) => b.id),
    (id, text) => found.set(id, text),
  )
  splitter.push(raw)
  const missing = splitter.end()
  const order = [...raw.matchAll(/<(?:t|s)\s+id=["']([^"']+)["'][^>]*>/g)].map((m) => m[1])
  const orderValid = JSON.stringify(order) === JSON.stringify(blocks.map((b) => b.id))
  const rows = blocks.flatMap((b) => {
    const draft = found.get(b.id)
    if (draft === undefined) return []
    const restored = restore(draft, b.restoreTokens ?? b.tokens)
    return [
      { id: b.id, text: restored.text, draft, issues: check(b, restored.text, restored, reason) },
    ]
  })
  return {
    rows,
    missing,
    orderValid,
    automaticPass:
      reason === 'stop' && orderValid && !missing.length && rows.every((r) => !r.issues.length),
  }
}

const repo = fileURLToPath(new URL('../../../', import.meta.url))
const MANIFEST = 'bbba2583cd42110f616d022549d1e18220baf2da8b1aa6521020fed8261f9c9a'
async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T
}
async function inputs(root: string) {
  const manifestText = await readFile(resolve(root, 'manifest.json'), 'utf8')
  if (digest(manifestText) !== MANIFEST) throw Error('冻结清单摘要不符')
  const manifest = JSON.parse(manifestText) as { files: Record<string, string> }
  for (const [name, hash] of Object.entries(manifest.files))
    if (digest(await readFile(resolve(root, name), 'utf8')) !== hash)
      throw Error(`冻结材料变化：${name}`)
  const src = resolve(repo, 'packages/guide-core/src')
  const files = (await readdir(src))
    .filter((n) => n.endsWith('.ts') && !n.endsWith('.test.ts'))
    .map((n) => resolve(src, n))
  files.push(
    ...['bridge-run.ts', 'bridge-quality.ts'].map((n) =>
      resolve(repo, 'apps/poe2-extension/scripts', n),
    ),
    ...['openai', 'sse', 'presets'].map((n) =>
      resolve(repo, `apps/poe2-extension/src/guide/engines/${n}.ts`),
    ),
    ...['guide-dictionary', 'guide-stats'].map((n) =>
      resolve(repo, `apps/poe2-extension/dist/assets/${n}.json`),
    ),
  )
  const candidateHash = digest(
    JSON.stringify(
      await Promise.all(
        files.sort().map(async (p) => [p.slice(repo.length), await readFile(p, 'utf8')]),
      ),
    ),
  )
  const baselineFile = resolve(root, 'baseline.mjs')
  const baselineText = await readFile(baselineFile, 'utf8')
  const baselineDictionary = await readFile(resolve(root, 'baseline-dictionary.json'), 'utf8')
  const baselineHash = digest(JSON.stringify([baselineText, baselineDictionary]))
  const legacy = (await import(
    pathToFileURL(baselineFile).href
  )) as typeof import('@poe2-tools/guide-core')
  if (String(legacy.PROMPT_VERSION) !== 'guide-v7') throw Error('基线不是冻结的 guide-v7')
  const oldMatcher = legacy.createMatcher(JSON.parse(baselineDictionary) as GuideDictionary)
  const baseline: Pipeline = {
    prepare: async (blocks) => blocks.map((b) => legacy.prepareBlock(b, oldMatcher)),
    messages: legacy.buildMessages,
    check: legacy.checkTranslation,
  }
  const candidate = candidatePipeline(
    await readJson<GuideDictionary>(
      resolve(repo, 'apps/poe2-extension/dist/assets/guide-dictionary.json'),
    ),
    await readJson<Projection>(resolve(repo, 'apps/poe2-extension/dist/assets/guide-stats.json')),
  )
  return {
    baseline,
    candidate,
    baselineHash,
    candidateHash,
    manifestHash: MANIFEST,
    development: await readJson<Fixture>(resolve(root, 'development.json')),
    sealed: await readJson<Fixture>(resolve(root, 'sealed.json')),
  }
}
async function responseModels(response: Response) {
  const models = new Set<string>()
  const accept = (v: unknown) => {
    if (v && typeof v === 'object' && 'model' in v && typeof v.model === 'string')
      models.add(v.model)
  }
  if (response.headers.get('content-type')?.includes('text/event-stream') && response.body)
    await readSse(response.body, (s) => {
      if (s === '[DONE]') return
      try {
        accept(JSON.parse(s))
      } catch {}
    })
  else accept(await response.json())
  return [...models]
}

export async function main() {
  const arg = (name: string) =>
    process.argv.find((v) => v.startsWith(`--${name}=`))?.slice(name.length + 3)
  const rootArg = arg('root')
  if (!rootArg) throw Error('需要本轮忽略证据目录 --root=')
  const root = resolve(rootArg)
  const loaded = await inputs(root)
  const planPath = resolve(root, 'cycle-plan.json')
  const params = { ...REQUEST_PARAMS, thinking: { type: 'disabled' } }
  if (!process.argv.includes('--run')) {
    const groups = await Promise.all([
      requestsFor(loaded.development, 'baseline', loaded.baseline),
      requestsFor(loaded.development, 'candidate', loaded.candidate),
      requestsFor(loaded.sealed, 'sealed', loaded.candidate),
      requestsFor(loaded.sealed, 'stability-1', loaded.candidate),
      requestsFor(loaded.sealed, 'stability-2', loaded.candidate),
    ])
    const first = loaded.development.documents[0]
    if (!first) throw Error('缺少浏览器预留材料')
    const browser = await requestsFor(
      { documents: [{ name: first.name, blocks: first.blocks.slice(0, 2) }] },
      'browser',
      loaded.candidate,
    )
    const browserJob = browser.jobs[0]
    if (!browserJob || browser.jobs.length !== 1) throw Error('浏览器材料不能组成单次预留')
    const jobs = [
      ...groups.flatMap((g) => g.jobs),
      ...Array.from({ length: 8 }, (_, i) => ({
        ...browserJob,
        key: digest(`${browserJob.key}:${i}`),
      })),
    ]
    const record: RecordPlan = {
      schema: 1,
      manifestHash: loaded.manifestHash,
      candidateHash: loaded.candidateHash,
      baselineHash: loaded.baselineHash,
      model: DEEPSEEK.model,
      params,
      requests: jobs.map(({ key, stage, ids, upperTokens }) => ({ key, stage, ids, upperTokens })),
      jobs,
      local: groups.flatMap((g) => g.local),
    }
    const preflight = {
      candidateHash: record.candidateHash,
      baselineHash: record.baselineHash,
      requests: jobs.length,
      upperTokens: jobs.reduce((n, j) => n + j.upperTokens, 0),
      stages: Object.fromEntries(
        ['baseline', 'candidate', 'sealed', 'stability-1', 'stability-2', 'browser'].map(
          (stage) => [
            stage,
            {
              requests: jobs.filter((j) => j.stage === stage).length,
              upperTokens: jobs
                .filter((j) => j.stage === stage)
                .reduce((n, j) => n + j.upperTokens, 0),
            },
          ],
        ),
      ),
      coverage: { baseline: 82, candidate: 82, sealed: 80, stability: 40, browserSlots: 8 },
      apiRequests: 0,
    }
    await writeFile(resolve(root, 'preflight-summary.json'), JSON.stringify(preflight, null, 2))
    console.log(JSON.stringify(preflight))
    const summary = checkPlan(record)
    const spec: CyclePlan = {
      schema: 1,
      manifestHash: record.manifestHash,
      candidateHash: record.candidateHash,
      baselineHash: record.baselineHash,
      requests: record.requests,
      local: record.local.map(({ id, stage }) => ({ id, stage })),
    }
    await writeFile(
      planPath,
      JSON.stringify({ record, hash: digest(JSON.stringify(record)) }, null, 2),
      { flag: 'wx' },
    )
    await writeFile(resolve(root, 'budget.json'), JSON.stringify(newBudget(spec), null, 2), {
      flag: 'wx',
    })
    console.log(
      JSON.stringify({
        ...summary,
        coverage: { baseline: 82, candidate: 82, sealed: 80, stability: 40, browserSlots: 8 },
        candidateHash: record.candidateHash,
        baselineHash: record.baselineHash,
        apiRequests: 0,
      }),
    )
    return
  }
  const stage = arg('stage') as Stage
  // 真实浏览器请求必须从扩展入口发出，不能用 CLI 冒充。
  if (!['baseline', 'candidate', 'sealed', 'stability-1', 'stability-2'].includes(stage))
    throw Error('执行阶段无效')
  const wrapped = await readJson<{ record: RecordPlan; hash: string }>(planPath)
  const record = wrapped.record
  if (
    wrapped.hash !== digest(JSON.stringify(record)) ||
    record.candidateHash !== loaded.candidateHash ||
    record.baselineHash !== loaded.baselineHash ||
    record.manifestHash !== loaded.manifestHash
  )
    throw Error('候选、基线或冻结计划已变化；禁止沿用旧预算继续')
  checkPlan(record)
  const gates: Gates = {}
  if (stage !== 'baseline' && stage !== 'candidate') {
    gates.development = await readJson(resolve(root, 'development-gate.json'))
    if (stage.startsWith('stability'))
      gates.sealed = await readJson(resolve(root, 'sealed-gate.json'))
  }
  const output = resolve(root, `${stage}-result.json`)
  const header = {
    stage,
    manifestHash: record.manifestHash,
    candidateHash: record.candidateHash,
    baselineHash: record.baselineHash,
    model: record.model,
    params,
    local: record.local.filter((r) => r.stage === stage),
  }
  await writeFile(output, JSON.stringify({ ...header, results: [] }, null, 2), { flag: 'wx' })
  const secret = await readFile(resolve(homedir(), '.config/poe2-guide-sample/keys.env'), 'utf8')
  const keys = Object.fromEntries(
    secret.split(/\r?\n/).flatMap((line) => {
      const m = line.trim().match(/^(?:export\s+)?([A-Z_][A-Z_0-9]*)\s*=\s*(.*?)\s*$/)
      return m ? [[m[1], (m[2] ?? '').replace(/^(['"])(.*)\1$/, '$2')]] : []
    }),
  ) as Record<string, string>
  const apiKey = keys.DEEPSEEK_API_KEY ?? keys.DEEPSEEK_KEY
  if (!apiKey) throw Error('没有本机测试 Key')
  const clean = (s: string) =>
    Object.values(keys)
      .filter((k) => k.length >= 8)
      .reduce((out, k) => redact(out, k), s)
  const jobs = record.jobs.filter((j) => j.stage === stage)
  const pipeline = stage === 'baseline' ? loaded.baseline : loaded.candidate
  const results = await runJobs(
    resolve(root, 'budget.json'),
    jobs,
    async (job) => {
      const start = Date.now()
      let raw = ''
      let firstContentMs: number | null = null
      let models: Promise<string[]> = Promise.resolve([])
      try {
        const response = await streamChat(
          { ...DEEPSEEK, apiKey, extraBody: params },
          job.messages,
          {
            signal: AbortSignal.timeout(120000),
            onText: (s) => {
              firstContentMs ??= Date.now() - start
              raw += s
            },
            fetchImpl: async (input, init) => {
              const r = await fetch(input, init)
              models = responseModels(r.clone()).catch(() => [])
              return r
            },
          },
        )
        const result = evaluate(job.targets, raw, response.finishReason, pipeline.check)
        return {
          document: job.document,
          ids: job.ids,
          raw,
          usage: response.usage,
          finishReason: response.finishReason,
          responseModels: await models,
          elapsedMs: Date.now() - start,
          firstContentMs,
          result,
          structuralPass:
            response.finishReason === 'stop' && !result.missing.length && result.orderValid,
        }
      } catch (error) {
        throw Error(clean(error instanceof Error ? error.message : '请求失败'))
      }
    },
    gates,
    async (rows) => {
      await writeFile(output, clean(JSON.stringify({ ...header, results: rows }, null, 2)))
      const last = rows.at(-1)
      console.log(
        JSON.stringify({
          stage,
          done: rows.length,
          total: jobs.length,
          usage: last?.usage ?? null,
          structuralPass: last?.structuralPass ?? false,
          error: last?.error ?? null,
        }),
      )
    },
  )
  if (results.length !== jobs.length || results.some((r) => r.error || r.structuralPass !== true))
    process.exitCode = 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  void main().catch((e) => {
    console.error(e instanceof Error ? e.message : '验收未完成')
    process.exitCode = 1
  })
