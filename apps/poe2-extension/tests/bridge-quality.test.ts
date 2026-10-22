// @vitest-environment node
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  type CyclePlan,
  checkPlan,
  digest,
  newBudget,
  type RequestSpec,
  reserve,
  runJobs,
  settle,
} from '../scripts/bridge-quality'

const dirs: string[] = []
afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true })
})
const stageCounts = {
  baseline: 82,
  candidate: 82,
  sealed: 80,
  'stability-1': 20,
  'stability-2': 20,
} as const
const plan = (): CyclePlan => ({
  schema: 1,
  manifestHash: 'manifest',
  candidateHash: 'candidate',
  baselineHash: 'baseline',
  packageHash: 'package',
  local: [],
  requests: [
    ...Object.entries(stageCounts).flatMap(([stage, count]) =>
      Array.from({ length: Math.ceil(count / 10) }, (_, i) => ({
        key: `${stage}-${i}`,
        stage: stage as RequestSpec['stage'],
        ids: Array.from({ length: Math.min(10, count - i * 10) }, (_, j) => `b${i * 10 + j}`),
        upperTokens: 1000,
      })),
    ),
    ...Array.from({ length: 8 }, (_, i) => ({
      key: `browser-${i}`,
      stage: 'browser' as const,
      ids: ['b0'],
      upperTokens: 1000,
    })),
  ],
})
const make = async (p = plan()) => {
  const dir = await mkdtemp(join(tmpdir(), 'bridge-budget-'))
  dirs.push(dir)
  const file = join(dir, 'budget.json')
  await writeFile(file, JSON.stringify(newBudget(p)))
  return { file, p }
}
const read = async (file: string) => JSON.parse(await readFile(file, 'utf8'))
const gate = {
  development: { passed: true, candidateHash: 'candidate', manifestHash: 'manifest' },
  sealed: { passed: true, candidateHash: 'candidate', manifestHash: 'manifest' },
}

describe('固定衔接质量周期', () => {
  it('完整计划校验样本覆盖和次数，各阶段完整预留必须能单独容纳，不能删样本凑预算', () => {
    expect(checkPlan(plan()).requests).toBeLessThanOrEqual(72)
    const missing = plan()
    missing.requests = missing.requests.filter((j) => j.key !== 'candidate-0')
    expect(() => checkPlan(missing)).toThrow(/覆盖/)
    const many = plan()
    many.requests.push(
      ...Array.from({ length: 21 }, (_, i) => ({
        key: `extra-${i}`,
        stage: 'baseline' as const,
        ids: [],
        upperTokens: 1,
      })),
    )
    expect(() => checkPlan(many)).toThrow(/次数|请求/)
    const huge = plan()
    huge.requests = huge.requests.map((j) => ({ ...j, upperTokens: 30000 }))
    expect(() => checkPlan(huge)).toThrow(/token/)
  })
  it('全周期最坏超过总额仍可登记；每阶段完整预检，不能只算当前一个请求', async () => {
    const p = plan()
    p.requests = p.requests.map((j) => ({
      ...j,
      upperTokens: j.stage === 'baseline' || j.stage === 'candidate' ? 20000 : 13000,
    }))
    expect(checkPlan(p).tokens).toBeGreaterThan(400000)
    const { file } = await make(p)
    for (const job of p.requests.filter((j) => j.stage === 'baseline' || j.stage === 'candidate')) {
      await reserve(file, job)
      await settle(file, job.key, { prompt: 17000, completion: 1000 }, 'complete')
    }
    const sealed = p.requests.find((j) => j.stage === 'sealed')
    if (!sealed) throw Error('missing fixture')
    const execute = vi.fn(async () => ({ usage: null, structuralPass: true }))
    await expect(runJobs(file, [sealed], execute, gate)).rejects.toThrow(/阶段.*token/)
    expect(execute).not.toHaveBeenCalled()
    expect((await read(file)).entries).toHaveLength(18)
  })
  it('阶段按完整实耗结算后继续；缺用量仍保留上界', async () => {
    const p = plan()
    p.requests = p.requests.map((j) => ({ ...j, upperTokens: 13000 }))
    const { file } = await make(p)
    for (const job of p.requests.filter((j) => j.stage === 'baseline' || j.stage === 'candidate')) {
      await reserve(file, job)
      await settle(file, job.key, { prompt: 900, completion: 100 }, 'complete')
    }
    const sealed = p.requests.find((j) => j.stage === 'sealed')
    if (!sealed) throw Error('missing fixture')
    await reserve(file, sealed, gate)
    expect((await read(file)).entries).toHaveLength(19)
  })
  it('请求前持久预留，重复 key 和未计划请求均拒绝；失败也计数', async () => {
    const { file, p } = await make()
    const j = p.requests[0]
    if (!j) throw Error('missing fixture')
    await reserve(file, j)
    expect((await read(file)).entries[0]).toMatchObject({
      key: j.key,
      status: 'reserved',
      chargedTokens: 1000,
    })
    await expect(reserve(file, j)).rejects.toThrow(/重复|登记/)
    await expect(reserve(file, { ...j, key: 'not-planned' })).rejects.toThrow(/计划/)
    await settle(file, j.key, null, 'failed')
    expect((await read(file)).entries[0].chargedTokens).toBe(1000)
    const next = p.requests[1]
    if (!next) throw Error('missing fixture')
    await expect(reserve(file, next)).rejects.toThrow(/停止/)
  })
  it('缺字段、非法 usage 不释放未知用量，完整用量才结算', async () => {
    for (const usage of [
      null,
      { prompt: 10 },
      { completion: 2 },
      { prompt: -1, completion: 2 },
      { prompt: '10', completion: 2 },
    ]) {
      const { file, p } = await make()
      const j = p.requests[0]
      if (!j) throw Error('missing fixture')
      await reserve(file, j)
      await settle(file, j.key, usage, 'complete')
      expect((await read(file)).entries[0].chargedTokens).toBe(1000)
      expect((await read(file)).entries[0].usage).toBeNull()
    }
    const { file, p } = await make()
    const j = p.requests[0]
    if (!j) throw Error('missing fixture')
    await reserve(file, j)
    await settle(file, j.key, { prompt: 30, completion: 20 }, 'complete')
    expect((await read(file)).entries[0].chargedTokens).toBe(50)
  })
  it('门槛失败、候选摘要变化均拦截封存/稳定性/浏览器；稳定性还要求封存通过', async () => {
    const { file, p } = await make()
    for (const stage of ['sealed', 'stability-1', 'browser'] as const) {
      const j = p.requests.find((x) => x.stage === stage)
      if (!j) throw Error('missing fixture')
      await expect(reserve(file, j)).rejects.toThrow(/门槛/)
      await expect(
        reserve(file, j, { ...gate, development: { ...gate.development, passed: false } }),
      ).rejects.toThrow(/门槛/)
      await expect(
        reserve(file, j, {
          ...gate,
          development: { ...gate.development, candidateHash: 'changed' },
        }),
      ).rejects.toThrow(/门槛/)
    }
    const repeat = p.requests.find((x) => x.stage === 'stability-1')
    if (!repeat) throw Error('missing fixture')
    await expect(reserve(file, repeat, { development: gate.development })).rejects.toThrow(/门槛/)
    await reserve(file, repeat, gate)
    expect((await read(file)).entries).toHaveLength(1)
  })
  it('串行执行遇网络失败即停止，不自动重试也不继续后续请求', async () => {
    const { file, p } = await make()
    const execute = vi.fn(async () => {
      throw Error('network')
    })
    const result = await runJobs(file, p.requests.slice(0, 2), execute)
    expect(execute).toHaveBeenCalledTimes(1)
    expect(result).toHaveLength(1)
    expect((await read(file)).halted).toBe(true)
  })
  it('结构失败也停下；每次真实执行前已能读到预留记录', async () => {
    const { file, p } = await make()
    const execute = vi.fn(async (j: RequestSpec) => {
      expect((await read(file)).entries.some((e: { key: string }) => e.key === j.key)).toBe(true)
      return { usage: { prompt: 10, completion: 5 }, structuralPass: false }
    })
    await runJobs(file, p.requests.slice(0, 2), execute)
    expect(execute).toHaveBeenCalledTimes(1)
    expect((await read(file)).halted).toBe(true)
  })
  it('预留参数不能被替换为更小预算，账本总上限不能被手改放宽', async () => {
    const { file, p } = await make()
    const j = p.requests[0]
    if (!j) throw Error('missing fixture')
    await expect(reserve(file, { ...j, upperTokens: 1 })).rejects.toThrow(/计划/)
    const raw = await read(file)
    raw.tokenLimit = 999999
    await writeFile(file, JSON.stringify(raw))
    await expect(reserve(file, j)).rejects.toThrow(/预算/)
  })
})

it('质量候选消费产品准备/提示/恢复逻辑，独立词缀不发模型，重复仍保留原选择语境', async () => {
  const { candidatePipeline, requestsFor, evaluate } = await import('../scripts/bridge-run')
  const dictionary = {
    schemaVersion: 1 as const,
    locale: 'zh-CN' as const,
    hash: 'd',
    entries: [],
    abbreviations: [],
  }
  const pipeline = candidatePipeline(dictionary, {
    hash: 's',
    ruleVersion: 'r',
    terms: [
      {
        id: 'life',
        domain: 'stat' as const,
        en: '+# to maximum Life',
        zh: '+# 生命上限',
        source: 'primary',
        version: 'unknown',
      },
    ],
  })
  const fixture = {
    documents: [
      {
        name: 'one',
        blocks: [
          { id: 'local', kind: 'paragraph' as const, text: '+80 to maximum Life' },
          { id: 'a', kind: 'paragraph' as const, text: 'Remove the suffix first.' },
          { id: 'b', kind: 'paragraph' as const, text: 'Then prefer "+80 to maximum Life".' },
        ],
      },
    ],
    repeatIds: ['b'],
  }
  const whole = await requestsFor(fixture, 'candidate', pipeline)
  expect(whole.local).toMatchObject([{ id: 'local', text: '+80 生命上限', origin: 'dictionary' }])
  expect(whole.jobs.flatMap((j) => j.ids)).toEqual(['a', 'b'])
  const repeat = await requestsFor(fixture, 'stability-1', pipeline)
  expect(repeat.jobs.flatMap((j) => j.ids)).toEqual(['b'])
  expect(repeat.jobs[0]?.messages[1]?.content).toContain('Remove the suffix first.')
  const block = repeat.jobs[0]?.targets[0]
  if (!block) throw Error('missing target')
  expect(
    evaluate([block], '<t id="b">然后优先选择“⟦0⟧”。</t>', 'stop', pipeline.check).rows[0]?.text,
  ).toContain('+80 生命上限')
})

it('最终浏览器必须在封存和两轮稳定性完成且通过后，使用同一候选包', async () => {
  const { file, p } = await make()
  const browser = p.requests.find((j) => j.stage === 'browser')
  if (!browser) throw Error('missing fixture')
  const ready = { ...gate, stability: gate.sealed, browserPackageHash: 'package' }
  const before = await read(file)
  for (const gates of [
    { ...ready, sealed: undefined },
    { ...ready, sealed: { ...gate.sealed, passed: false } },
    { ...ready, sealed: { ...gate.sealed, candidateHash: 'changed' } },
    { ...ready, stability: undefined },
    { ...ready, stability: { ...gate.sealed, passed: false } },
    { ...ready, stability: { ...gate.sealed, manifestHash: 'changed' } },
    { ...ready, browserPackageHash: undefined },
    { ...ready, browserPackageHash: 'changed' },
    ready,
  ]) {
    // JSON 模拟缺失字段，避免 undefined 属性与实际文件格式不同。
    await expect(reserve(file, browser, JSON.parse(JSON.stringify(gates)))).rejects.toThrow(
      /门槛|完成|产物/,
    )
    expect(await read(file)).toEqual(before)
  }
  for (const job of p.requests.filter((j) => j.stage !== 'browser')) {
    await reserve(file, job, gate)
    await settle(file, job.key, { prompt: 1, completion: 1 }, 'complete')
  }
  await reserve(file, browser, ready)
  expect((await read(file)).entries.at(-1).key).toBe(browser.key)
})

it('冻结身份包含共享解析器及浏览器源码，且构建目录必须与候选 ZIP 一致', async () => {
  const { candidateIdentity } = await import('../scripts/bridge-run')
  const root = await mkdtemp(join(tmpdir(), 'bridge-identity-'))
  dirs.push(root)
  const files: Record<string, string> = {
    'package.json': '{}',
    'pnpm-lock.yaml': 'lockfileVersion: 9',
    'packages/guide-core/package.json': '{}',
    'packages/guide-core/src/index.ts': 'export const route = 1',
    'packages/l10n-core/package.json': '{}',
    'packages/l10n-core/src/stats.ts': 'export const parser = 1',
    'apps/poe2-extension/package.json': '{}',
    'apps/poe2-extension/src/extract/blocks.ts': 'export const extract = 1',
    'apps/poe2-extension/scripts/bridge-run.ts': 'export const run = 1',
    'apps/poe2-extension/dist/extract.js': 'built extraction',
  }
  const put = async (file: string, value: string | Uint8Array) => {
    await mkdir(join(root, file, '..'), { recursive: true })
    await writeFile(join(root, file), value)
  }
  for (const [file, value] of Object.entries(files)) await put(file, value)
  const zipModule = new URL('../scripts/zip.mjs', import.meta.url).href
  const { zipDirectory } = await import(zipModule)
  const pack = async () => {
    const zip: Buffer = await zipDirectory(join(root, 'apps/poe2-extension/dist'))
    const { createHash } = await import('node:crypto')
    const hash = createHash('sha256').update(zip).digest('hex')
    await put('apps/poe2-extension/artifacts/poe2-extension-0.6.0.zip', zip)
    await put(
      'apps/poe2-extension/release.json',
      JSON.stringify({ file: 'poe2-extension-0.6.0.zip', bytes: zip.length, sha256: hash }),
    )
    return hash
  }
  const packageHash = await pack()
  const before = await candidateIdentity(root)
  expect(before.packageHash).toBe(packageHash)
  await put('packages/l10n-core/src/stats.ts', 'export const parser = 2')
  const parserChanged = await candidateIdentity(root)
  expect(parserChanged.candidateHash).not.toBe(before.candidateHash)
  expect(parserChanged.packageHash).toBe(packageHash)
  await put('apps/poe2-extension/src/extract/blocks.ts', 'export const extract = 2')
  expect((await candidateIdentity(root)).candidateHash).not.toBe(parserChanged.candidateHash)
  await put('apps/poe2-extension/dist/extract.js', 'different built extraction')
  await expect(candidateIdentity(root)).rejects.toThrow(/ZIP|产物/)
  const nextPackageHash = await pack()
  expect(nextPackageHash).not.toBe(packageHash)
  expect((await candidateIdentity(root)).packageHash).toBe(nextPackageHash)
  await put(
    'apps/poe2-extension/release.json',
    JSON.stringify({ file: 'poe2-extension-0.6.0.zip', bytes: 0, sha256: digest('wrong') }),
  )
  await expect(candidateIdentity(root)).rejects.toThrow(/ZIP|产物/)
})
