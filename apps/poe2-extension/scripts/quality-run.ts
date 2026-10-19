// 只在显式 --run 时调用现有测试服务；默认输出完整离线请求供审查。
import { randomBytes } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildMessages,
  chunkBlocks,
  createMatcher,
  type GuideBlock,
  type GuideDictionary,
  prepareBlock,
} from '@poe2-tools/guide-core'
import { redact, streamChat } from '../src/guide/engines/openai'
import { DEEPSEEK } from '../src/guide/engines/presets'
import {
  contextKey,
  digest,
  evaluateOutput,
  type Phase,
  planUnits,
  requestMessages,
  reserveBudget,
  settleBudget,
} from './quality-lab'

export interface Fixture {
  split: 'development' | 'sealed'
  documents: { name: string; source: string; blocks: GuideBlock[] }[]
  repeatIds?: string[]
}
export type Mode = 'baseline' | 'a' | 'b'
interface Previous {
  mode: Mode
  fixtureHash: string
  pipelineHash: string
  dictionaryHash: string
  jobs: { context: string; result?: ReturnType<typeof evaluateOutput> }[]
}

export function jobsFor(fixture: Fixture, dict: GuideDictionary, mode: Mode, repeat = false) {
  const matcher = createMatcher(dict)
  const wanted = repeat ? new Set(fixture.repeatIds ?? []) : null
  return fixture.documents.flatMap((doc) => {
    const prepared = doc.blocks.map((b) => prepareBlock(b, matcher))
    const units =
      mode === 'baseline'
        ? chunkBlocks(prepared).map((targets) => ({ targets, context: targets }))
        : planUnits(prepared)
    return units.flatMap((unit) => {
      const targets = unit.targets.filter((b) => !wanted || wanted.has(b.id))
      return targets.length ? [{ document: doc.name, unit, targets }] : []
    })
  })
}

async function main() {
  const arg = (name: string) =>
    process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
  const root = arg('root')
  const mode = arg('mode') as Mode
  const label = arg('label') ?? 'round1'
  const fixtureName = arg('fixture') ?? 'development.json'
  if (
    !root ||
    !['baseline', 'a', 'b'].includes(mode) ||
    !/^[\w-]+$/.test(label) ||
    !['development.json', 'sealed.json'].includes(fixtureName)
  )
    throw new Error('参数无效')
  const file = (name: string) => resolve(root, name)
  const rawFixture = await readFile(file(fixtureName), 'utf8')
  const fixtureHash = digest(rawFixture)
  const manifest = JSON.parse(await readFile(file('manifest.json'), 'utf8')) as {
    files: Record<string, string>
  }
  if (manifest.files[fixtureName] !== fixtureHash) throw new Error('样本与冻结清单不一致')
  const fixture = JSON.parse(rawFixture) as Fixture
  const dict = JSON.parse(
    await readFile(new URL('../dist/assets/guide-dictionary.json', import.meta.url), 'utf8'),
  ) as GuideDictionary
  const sourceFiles = [
    new URL('./quality-lab.ts', import.meta.url),
    new URL('./quality-run.ts', import.meta.url),
    ...['openai', 'sse', 'presets'].map(
      (n) => new URL(`../src/guide/engines/${n}.ts`, import.meta.url),
    ),
    ...['prepare', 'prompt', 'matcher', 'verbatim', 'check', 'tags'].map(
      (n) => new URL(`../../../packages/guide-core/src/${n}.ts`, import.meta.url),
    ),
  ]
  const pipelineHash = digest(
    (await Promise.all(sourceFiles.map((p) => readFile(p, 'utf8')))).join('\n'),
  )
  if (fixture.split === 'sealed') {
    const gate = JSON.parse(await readFile(file('development-gate.json'), 'utf8')) as {
      passed: boolean
      pipelineHash: string
    }
    if (!gate.passed || gate.pipelineHash !== pipelineHash)
      throw new Error('开发门槛未通过，不得打开封存验收')
  }
  const documentFilter = arg('documents')?.split(',')
  if (
    documentFilter &&
    (mode !== 'baseline' ||
      documentFilter.some((name) => !fixture.documents.some((d) => d.name === name)))
  )
    throw new Error('基线文档筛选无效')
  const selected = documentFilter
    ? { ...fixture, documents: fixture.documents.filter((d) => documentFilter.includes(d.name)) }
    : fixture
  const jobs = jobsFor(selected, dict, mode, process.argv.includes('--repeat'))
  let prior: Previous | undefined
  if (mode === 'b') {
    const path = arg('from')
    if (!path) throw new Error('B必须复用A的真实输出')
    prior = JSON.parse(await readFile(path, 'utf8')) as Previous
    if (
      prior.mode !== 'a' ||
      prior.fixtureHash !== fixtureHash ||
      prior.pipelineHash !== pipelineHash ||
      prior.dictionaryHash !== dict.hash
    )
      throw new Error('A输出版本或样本不符')
  }
  const requests = jobs.map((job) => {
    const context = contextKey(job.unit)
    let drafts: Record<string, string> | undefined
    if (mode === 'b') {
      const previous = prior?.jobs.find((j) => j.context === context)?.result
      if (!previous || previous.missing.length || !previous.orderValid)
        throw new Error('A缺段或结构失败，不自动补发')
      drafts = Object.fromEntries(previous.rows.map((r) => [r.id, r.draft]))
    }
    const delimiter = randomBytes(8).toString('hex')
    const messages =
      mode === 'baseline'
        ? buildMessages(job.targets, delimiter)
        : requestMessages(
            job.unit,
            job.targets.map((b) => b.id),
            delimiter,
            drafts,
          )
    const key = digest(
      JSON.stringify({
        fixtureHash,
        pipelineHash,
        dictionary: dict.hash,
        mode,
        label,
        context,
        targets: job.targets.map((b) => b.id),
        drafts,
      }),
    )
    // UTF-8字节数加消息外壳余量，保守预留输入；输出按硬上限4096。
    const upperTokens = Buffer.byteLength(JSON.stringify(messages), 'utf8') + 512 + 4096
    return { ...job, context, messages, key, upperTokens }
  })
  const params = { temperature: 0.2, max_tokens: 4096, thinking: { type: 'disabled' } }
  const record = {
    mode,
    label,
    fixtureHash,
    pipelineHash,
    dictionaryHash: dict.hash,
    model: DEEPSEEK.model,
    params,
    phase: fixture.split,
    jobs: requests.map((j) => ({
      document: j.document,
      context: j.context,
      key: j.key,
      ids: j.targets.map((b) => b.id),
      upperTokens: j.upperTokens,
      messages: j.messages,
    })),
  }
  const output = file(`${fixture.split}-${mode}-${label}.json`)
  console.log(
    JSON.stringify({
      mode,
      label,
      requests: requests.length,
      targets: requests.reduce((n, j) => n + j.targets.length, 0),
      pipelineHash,
    }),
  )
  if (!process.argv.includes('--run')) {
    await writeFile(file(`preview-${mode}-${label}.json`), JSON.stringify(record, null, 2))
    return
  }
  // 结果文件不可覆盖；中断后同label不可续发，须先审查账本。
  await writeFile(output, JSON.stringify(record, null, 2), { flag: 'wx' })
  const secret = await readFile(resolve(homedir(), '.config/poe2-guide-sample/keys.env'), 'utf8')
  const keys: Record<string, string> = Object.fromEntries(
    secret.split(/\r?\n/).flatMap((line): [string, string][] => {
      const match = line.trim().match(/^(?:export\s+)?([A-Z_][A-Z_0-9]*)\s*=\s*(.*?)\s*$/)
      return match ? [[match[1] ?? '', (match[2] ?? '').replace(/^(['"])(.*)\1$/, '$2')]] : []
    }),
  )
  const apiKey = keys.DEEPSEEK_API_KEY ?? keys.DEEPSEEK_KEY
  if (!apiKey) throw new Error('未找到本机测试Key')
  const clean = (text: string) =>
    Object.values(keys)
      .filter((s) => s.length >= 8)
      .reduce((s, key) => redact(s, key), text)
  const results: object[] = []
  for (const [i, job] of requests.entries()) {
    await reserveBudget(file('budget.json'), fixture.split as Phase, job.key, job.upperTokens)
    const start = Date.now()
    let raw = ''
    let firstContentMs: number | null = null
    let responseModels: Promise<string[]> = Promise.resolve([])
    try {
      const result = await streamChat({ ...DEEPSEEK, apiKey, extraBody: params }, job.messages, {
        signal: AbortSignal.timeout(120000),
        onText: (text) => {
          firstContentMs ??= Date.now() - start
          raw += text
        },
        fetchImpl: async (input, init) => {
          const response = await fetch(input, init)
          responseModels = response
            .clone()
            .text()
            .then((body) => [
              ...new Set([...body.matchAll(/"model"\s*:\s*"([^"]+)"/g)].map((m) => m[1] ?? '')),
            ])
            .catch(() => [])
          return response
        },
      })
      await settleBudget(file('budget.json'), job.key, result.usage, 'complete')
      const evaluated = evaluateOutput(job.targets, raw, result.finishReason)
      results.push({
        ...record.jobs[i],
        raw,
        result: evaluated,
        usage: result.usage,
        finishReason: result.finishReason,
        responseModels: await responseModels,
        elapsedMs: Date.now() - start,
        firstContentMs,
      })
      await writeFile(output, clean(JSON.stringify({ ...record, jobs: results }, null, 2)))
      console.log(
        JSON.stringify({
          mode,
          job: i + 1,
          total: jobs.length,
          returned: evaluated.rows.length,
          expected: job.targets.length,
          automaticPass: evaluated.valid,
          usage: result.usage,
        }),
      )
      if (result.finishReason !== 'stop' || evaluated.missing.length || !evaluated.orderValid) {
        process.exitCode = 1
        break
      }
    } catch (error) {
      await settleBudget(file('budget.json'), job.key, null, 'failed').catch(() => {})
      results.push({
        ...record.jobs[i],
        raw,
        error: clean(error instanceof Error ? error.message : '未知错误'),
        elapsedMs: Date.now() - start,
      })
      await writeFile(output, clean(JSON.stringify({ ...record, jobs: results }, null, 2)))
      process.exitCode = 1
      console.log('请求失败，已记入预算并停止；没有自动重试。')
      break
    }
  }
  console.log(`结果：${basename(output)}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : '实验未完成')
    process.exitCode = 1
  })
}
