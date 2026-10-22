// 本轮独立质量账本；不读取或修改上一轮实验预算。默认离线，无自动重试。
import { createHash } from 'node:crypto'
import { open, readFile, rename, unlink, writeFile } from 'node:fs/promises'

export const LIMIT = 72
export const TOKEN_LIMIT = 400000
const CAPS = {
  baseline: 20,
  candidate: 20,
  sealed: 16,
  'stability-1': 4,
  'stability-2': 4,
  browser: 8,
} as const
export type Stage = keyof typeof CAPS
const phaseOf = (stage: Stage) =>
  stage === 'baseline' || stage === 'candidate'
    ? 'development'
    : stage.startsWith('stability')
      ? 'stability'
      : stage
export interface RequestSpec {
  key: string
  stage: Stage
  ids: string[]
  upperTokens: number
}
export interface LocalRow {
  stage: Stage
  id: string
}
export interface CyclePlan {
  schema: 1
  manifestHash: string
  candidateHash: string
  baselineHash: string
  packageHash: string
  requests: RequestSpec[]
  local: LocalRow[]
}
export interface QualityGate {
  passed: boolean
  candidateHash: string
  manifestHash: string
}
export interface Gates {
  development?: QualityGate
  sealed?: QualityGate
  stability?: QualityGate
  browserPackageHash?: string
}
interface Entry {
  key: string
  stage: Stage
  upperTokens: number
  chargedTokens: number
  status: 'reserved' | 'complete' | 'failed'
  usage: { prompt: number; completion: number } | null
  at: string
}
interface Budget {
  schema: 1
  limit: number
  tokenLimit: number
  plan: CyclePlan
  planHash: string
  entries: Entry[]
  halted: boolean
}
const count = (n: unknown): n is number =>
  typeof n === 'number' && Number.isSafeInteger(n) && n >= 0
export const digest = (s: string) => createHash('sha256').update(s).digest('hex')

export function checkPlan(plan: CyclePlan) {
  if (
    plan.schema !== 1 ||
    !plan.candidateHash ||
    !plan.baselineHash ||
    !plan.packageHash ||
    !plan.manifestHash ||
    !Array.isArray(plan.requests) ||
    !Array.isArray(plan.local)
  )
    throw Error('计划无效')
  const counts = Object.fromEntries(Object.keys(CAPS).map((s) => [s, 0])) as Record<Stage, number>
  const keys = new Set<string>()
  let tokens = 0
  for (const j of plan.requests) {
    if (
      !Object.hasOwn(CAPS, j.stage) ||
      !j.key ||
      keys.has(j.key) ||
      !Array.isArray(j.ids) ||
      !j.ids.length ||
      j.ids.some((id) => typeof id !== 'string') ||
      !count(j.upperTokens) ||
      !j.upperTokens
    )
      throw Error('请求计划无效或重复')
    keys.add(j.key)
    counts[j.stage]++
    tokens += j.upperTokens
  }
  if (plan.requests.length > LIMIT || Object.entries(CAPS).some(([s, n]) => counts[s as Stage] > n))
    throw Error('请求次数超出阶段或总上限')
  for (const phase of ['development', 'sealed', 'stability', 'browser']) {
    const upper = plan.requests
      .filter((j) => phaseOf(j.stage) === phase)
      .reduce((n, j) => n + j.upperTokens, 0)
    if (upper > TOKEN_LIMIT) throw Error(`${phase} 阶段 token 预留超过总上限`)
  }
  const expected = {
    baseline: 82,
    candidate: 82,
    sealed: 80,
    'stability-1': 20,
    'stability-2': 20,
  } as const
  for (const [stage, n] of Object.entries(expected)) {
    const ids = [
      ...plan.requests.filter((j) => j.stage === stage).flatMap((j) => j.ids),
      ...plan.local.filter((j) => j.stage === stage).map((j) => j.id),
    ]
    if (ids.length !== n || new Set(ids).size !== n) throw Error(`${stage} 材料覆盖不完整或重复`)
  }
  if (counts.browser !== 8) throw Error('浏览器预留请求不完整')
  return { requests: plan.requests.length, tokens, counts }
}

export function newBudget(plan: CyclePlan): Budget {
  checkPlan(plan)
  return {
    schema: 1,
    limit: LIMIT,
    tokenLimit: TOKEN_LIMIT,
    plan,
    planHash: digest(JSON.stringify(plan)),
    entries: [],
    halted: false,
  }
}

function validate(data: Budget) {
  if (
    data.schema !== 1 ||
    data.limit !== LIMIT ||
    data.tokenLimit !== TOKEN_LIMIT ||
    !Array.isArray(data.entries) ||
    typeof data.halted !== 'boolean' ||
    data.planHash !== digest(JSON.stringify(data.plan))
  )
    throw Error('预算文件无效')
  checkPlan(data.plan)
  const seen = new Set<string>()
  for (const e of data.entries) {
    const job = data.plan.requests.find((j) => j.key === e.key)
    if (
      !job ||
      seen.has(e.key) ||
      e.stage !== job.stage ||
      e.upperTokens !== job.upperTokens ||
      !count(e.chargedTokens) ||
      !['reserved', 'complete', 'failed'].includes(e.status)
    )
      throw Error('预算记录无效')
    seen.add(e.key)
  }
}
async function update(file: string, change: (b: Budget) => void) {
  const lock = await open(`${file}.lock`, 'wx')
  try {
    const data = JSON.parse(await readFile(file, 'utf8')) as Budget
    validate(data)
    change(data)
    await writeFile(`${file}.next`, `${JSON.stringify(data, null, 2)}\n`)
    await rename(`${file}.next`, file)
  } finally {
    await lock.close()
    await unlink(`${file}.lock`)
  }
}
const gatePass = (gate: QualityGate | undefined, plan: CyclePlan) =>
  gate?.passed === true &&
  gate.candidateHash === plan.candidateHash &&
  gate.manifestHash === plan.manifestHash

export async function reserve(file: string, job: RequestSpec, gates: Gates = {}) {
  await update(file, (data) => {
    if (data.halted) throw Error('本轮已停止，禁止继续付费请求')
    const planned = data.plan.requests.find((j) => j.key === job.key)
    if (
      !planned ||
      planned.stage !== job.stage ||
      planned.upperTokens !== job.upperTokens ||
      JSON.stringify(planned.ids) !== JSON.stringify(job.ids)
    )
      throw Error('请求不符合冻结计划')
    if (data.entries.some((e) => e.key === job.key)) throw Error('请求已经登记，禁止重复发送')
    if (job.stage !== 'baseline' && job.stage !== 'candidate') {
      if (!gatePass(gates.development, data.plan)) throw Error('开发门槛未通过或候选已变化')
      if (
        (job.stage.startsWith('stability') || job.stage === 'browser') &&
        !gatePass(gates.sealed, data.plan)
      )
        throw Error('封存门槛未通过')
      if (job.stage === 'browser') {
        if (!gatePass(gates.stability, data.plan)) throw Error('稳定性门槛未通过')
        if (gates.browserPackageHash !== data.plan.packageHash)
          throw Error('浏览器产物与冻结候选不符')
        const complete = new Set(
          data.entries.filter((e) => e.status === 'complete').map((e) => e.key),
        )
        if (data.plan.requests.some((j) => j.stage !== 'browser' && !complete.has(j.key)))
          throw Error('浏览器前置阶段尚未全部完成')
      }
    }
    if (
      data.entries.length >= LIMIT ||
      data.entries.filter((e) => e.stage === job.stage).length >= CAPS[job.stage]
    )
      throw Error('请求次数已到上限')
    // 开发对照两组、稳定性两轮分别完整核算；不能只给当前请求留出额度。
    const sent = new Set(data.entries.map((e) => e.key))
    const remaining = data.plan.requests.filter(
      (j) => phaseOf(j.stage) === phaseOf(job.stage) && !sent.has(j.key),
    )
    const committed = data.entries.reduce((n, e) => n + e.chargedTokens, 0)
    if (committed + remaining.reduce((n, j) => n + j.upperTokens, 0) > TOKEN_LIMIT)
      throw Error(`${phaseOf(job.stage)} 阶段完整 token 预算不足，零新增请求停止`)
    data.entries.push({
      key: job.key,
      stage: job.stage,
      upperTokens: job.upperTokens,
      chargedTokens: job.upperTokens,
      status: 'reserved',
      usage: null,
      at: new Date().toISOString(),
    })
  })
}

export async function settle(
  file: string,
  key: string,
  raw: unknown,
  status: 'complete' | 'failed',
  stop = false,
) {
  await update(file, (data) => {
    const entry = data.entries.find((e) => e.key === key)
    if (entry?.status !== 'reserved') throw Error('请求未预留或已结算')
    const u = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null
    const usage =
      u && count(u.prompt) && count(u.completion)
        ? { prompt: u.prompt, completion: u.completion }
        : null
    entry.status = status
    entry.usage = usage
    if (usage) entry.chargedTokens = usage.prompt + usage.completion
    if (
      status === 'failed' ||
      stop ||
      data.entries.reduce((n, e) => n + e.chargedTokens, 0) > TOKEN_LIMIT
    )
      data.halted = true
  })
}

export interface JobResult {
  usage: unknown
  structuralPass: boolean
  [key: string]: unknown
}
export async function runJobs<T extends RequestSpec>(
  file: string,
  jobs: readonly T[],
  execute: (job: T) => Promise<JobResult>,
  gates: Gates = {},
  onResult?: (rows: Record<string, unknown>[]) => Promise<void>,
) {
  const rows: Record<string, unknown>[] = []
  for (const job of jobs) {
    await reserve(file, job, gates)
    try {
      const result = await execute(job)
      await settle(file, job.key, result.usage, 'complete', !result.structuralPass)
      rows.push({ key: job.key, ...result })
      await onResult?.(rows)
      if (!result.structuralPass) break
    } catch (error) {
      await settle(file, job.key, null, 'failed').catch(() => {})
      rows.push({ key: job.key, error: error instanceof Error ? error.message : '请求失败' })
      await onResult?.(rows)
      break
    }
  }
  return rows
}
