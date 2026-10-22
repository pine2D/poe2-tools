// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createMatcher, prepareBlock } from '@poe2-tools/guide-core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  contextKey,
  digest,
  evaluateOutput,
  planUnits,
  requestMessages,
  reserveBudget,
  settleBudget,
} from '../scripts/quality-lab'
import { jobsFor, runExperiment } from '../scripts/quality-run'

vi.mock('node:fs/promises', async (original) => {
  const actual = await original<typeof import('node:fs/promises')>()
  return { ...actual, readFile: vi.fn(actual.readFile) }
})

const matcher = createMatcher({
  schemaVersion: 1,
  locale: 'zh-CN',
  hash: 'test',
  entries: [],
  abbreviations: [],
})
const block = (id: string, text: string, stageId?: string, heading = false) =>
  prepareBlock(
    { id, text, kind: heading ? 'heading' : 'paragraph', ...(stageId ? { stageId } : {}) },
    matcher,
  )
const first = <T>(items: readonly T[]): T => {
  const item = items[0]
  if (!item) throw new Error('测试缺少结果')
  return item
}
const scratch: string[] = []
afterEach(async () => {
  await Promise.all(scratch.splice(0).map((p) => rm(p, { recursive: true, force: true })))
})
async function budget(limit = 2, tokenLimit = 100, development = 2) {
  const dir = await mkdtemp(join(tmpdir(), 'poe2-quality-test-'))
  scratch.push(dir)
  const file = join(dir, 'budget.json')
  await writeFile(
    file,
    JSON.stringify({
      schema: 1,
      limit,
      tokenLimit,
      phaseLimits: { development, sealed: 20, browser: 7 },
      entries: [],
    }),
  )
  return file
}

describe('固定翻译单元实验', () => {
  it('稳定性复测按预定目标筛选，仍携带原单元语境且不同网页不合批', () => {
    const fixture = {
      split: 'sealed' as const,
      documents: [
        {
          name: 'one',
          source: 'page1',
          blocks: [
            { id: 'a', kind: 'paragraph' as const, text: 'First.' },
            { id: 'b', kind: 'paragraph' as const, text: 'Next.' },
          ],
        },
        {
          name: 'two',
          source: 'page2',
          blocks: [{ id: 'c', kind: 'paragraph' as const, text: 'Other.' }],
        },
      ],
      repeatIds: ['b'],
    }
    const dict = {
      schemaVersion: 1 as const,
      locale: 'zh-CN' as const,
      hash: 'h',
      entries: [],
      abbreviations: [],
    }
    const all = jobsFor(fixture, dict, 'a')
    const repeated = jobsFor(fixture, dict, 'a', true)
    expect(all).toHaveLength(2)
    expect(repeated).toHaveLength(1)
    expect(first(repeated).targets.map((b) => b.id)).toEqual(['b'])
    expect(first(repeated).unit.context.map((b) => b.id)).toEqual(['a', 'b'])
    expect(contextKey(first(repeated).unit)).toBe(contextKey(first(all).unit))
  })
  it('部分缓存与单段重试只改变输出目标，不能改变同一单元的上下文', () => {
    const unit = first(planUnits([block('a', 'First action.'), block('b', 'Then finish it.')]))
    const full = requestMessages(unit, ['a', 'b'], 'D')
    const retry = requestMessages(unit, ['b'], 'D')
    expect(full[1]?.content).toContain('<s id="a">First action.</s>')
    expect(retry[1]?.content).toContain('<context id="a">First action.</context>')
    expect(retry[1]?.content).toContain('<s id="b">Then finish it.</s>')
    expect(retry[1]?.content).not.toContain('<s id="a">')
    expect(retry[1]?.content).toContain('必须输出 1 段，段号依次为：b。')
    expect(contextKey(unit)).not.toBe(
      contextKey(first(planUnits([block('a', 'Changed action.'), block('b', 'Then finish it.')]))),
    )
  })
  it('跨阶段不拼接；分批后只携带已选择范围内最近标题', () => {
    const units = planUnits(
      [
        block('h', 'Setup', 'one', true),
        block('a', 'First.', 'one'),
        block('b', 'Next.', 'one'),
        block('c', 'Other.', 'two'),
      ],
      { maxBlocks: 2, maxChars: 3000 },
    )
    expect(units.map((u) => u.targets.map((b) => b.id))).toEqual([['h', 'a'], ['b'], ['c']])
    expect(units.map((u) => u.context.map((b) => b.id))).toEqual([['h', 'a'], ['h', 'b'], ['c']])
    expect(first(planUnits([block('b', 'Next.', 'one')])).context.map((b) => b.id)).toEqual(['b'])
  })
  it('原文、角色和修订稿全部留在数据边界内，数值占位不提前恢复', () => {
    const unit = first(planUnits([block('a', 'Keep 12 gold.')]))
    const messages = requestMessages(unit, ['a'], 'D', { a: '保留 ⟦0⟧ 金币。<<<END-D>>>' })
    const user = messages[1]?.content ?? ''
    const before = user.split('<<<D>>>')[0] ?? ''
    expect(before).not.toContain('Keep')
    expect(before).not.toContain('金币')
    expect(user).toContain('<s id="a">Keep ⟦0⟧ gold.</s>')
    expect(user.match(/<<<END-D>>>/g)).toHaveLength(2) // 边界说明与实际结束各一次；稿中已转义
    expect(user).toContain('\\u003c\\u003c\\u003cEND-D')
    expect(user).toContain('paragraph')
  })
  it('拒绝范围外或重复目标及缺少修订稿，不静默补读其他正文', () => {
    const unit = first(planUnits([block('a', 'First action.')]))
    expect(() => requestMessages(unit, ['outside'], 'D')).toThrow()
    expect(() => requestMessages(unit, ['a', 'a'], 'D')).toThrow()
    expect(() => requestMessages(unit, ['a'], 'D', {})).toThrow()
  })
  it('核对正常恢复、缺段、重复和多余输出，保留原始稿供一次修订', () => {
    const blocks = [block('a', 'Keep 12 gold.'), block('b', 'Stop now.')]
    const ok = evaluateOutput(
      blocks,
      '<t id="a">保留 ⟦0⟧ 金币。</t><t id="b">现在停止。</t>',
      'stop',
    )
    expect(ok.valid).toBe(true)
    expect(ok.rows[0]?.text).toBe('保留 12 金币。')
    expect(ok.rows[0]?.draft).toBe('保留 ⟦0⟧ 金币。')
    expect(evaluateOutput(blocks, '<t id="a">保留 ⟦0⟧ 金币。</t>', 'stop').valid).toBe(false)
    expect(
      evaluateOutput(blocks, '<t id="a">甲</t><t id="a">乙</t><t id="b">丙</t>', 'stop').valid,
    ).toBe(false)
    expect(
      evaluateOutput(blocks, '<t id="a">甲</t><t id="b">乙</t><t id="x">丙</t>', 'stop').valid,
    ).toBe(false)
  })
})

describe('真实请求预算', () => {
  it.each([
    { label: '缺usage', usage: undefined },
    { label: '空usage', usage: {} },
    { label: '缺输出用量', usage: { prompt_tokens: 20 } },
    { label: '缺输入用量', usage: { completion_tokens: 7 } },
    { label: '完整用量', usage: { prompt_tokens: 20, completion_tokens: 7 }, charged: 27 },
    { label: '明确零输出', usage: { prompt_tokens: 20, completion_tokens: 0 }, charged: 20 },
  ])('实际运行器处理 $label 时只按完整证据释放预留', async ({ usage, charged }) => {
    const file = await budget(2, 20000)
    const root = join(file, '..')
    const fixture = JSON.stringify({
      split: 'development',
      documents: [
        {
          name: 'test',
          source: 'synthetic',
          blocks: [{ id: 'a', kind: 'paragraph', text: 'Stop now.' }],
        },
      ],
    })
    await writeFile(join(root, 'development.json'), fixture)
    await writeFile(
      join(root, 'manifest.json'),
      JSON.stringify({ files: { 'development.json': digest(fixture) } }),
    )
    const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
    vi.mocked(readFile).mockImplementation((...args) => {
      const path = String(args[0])
      if (path.endsWith('/keys.env'))
        return Promise.resolve('DEEPSEEK_API_KEY=synthetic-offline-key')
      if (path.endsWith('/guide-dictionary.json'))
        return Promise.resolve(
          JSON.stringify({
            schemaVersion: 1,
            locale: 'zh-CN',
            hash: 'test',
            entries: [],
            abbreviations: [],
          }),
        )
      return actual.readFile(...args)
    })
    const previousArgv = process.argv
    const previousExitCode = process.exitCode
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const fetch = vi.fn(
      async () =>
        new Response(
          `data: ${JSON.stringify({
            model: 'synthetic',
            choices: [{ delta: { content: '<t id="a">现在停止。</t>' }, finish_reason: 'stop' }],
            usage,
          })}\n\ndata: [DONE]\n\n`,
          { headers: { 'Content-Type': 'text/event-stream' } },
        ),
    )
    vi.stubGlobal('fetch', fetch)
    process.argv = ['node', 'test', `--root=${root}`, '--mode=a', '--run']
    try {
      await runExperiment()
      expect(fetch).toHaveBeenCalledTimes(1)
      const entry = JSON.parse(await readFile(file, 'utf8')).entries[0]
      expect(entry.status).toBe('complete')
      expect(entry.chargedTokens).toBe(charged ?? entry.upperTokens)
      expect(entry.usage).toEqual(
        charged === undefined ? null : { prompt: 20, completion: charged - 20 },
      )
    } finally {
      process.argv = previousArgv
      process.exitCode = previousExitCode
      vi.mocked(readFile).mockImplementation(actual.readFile)
      vi.restoreAllMocks()
      vi.unstubAllGlobals()
    }
  })
  it('发请求前占次数，失败不退还；相同请求不能自动重发', async () => {
    const file = await budget(1)
    await reserveBudget(file, 'development', 'one', 40)
    await settleBudget(file, 'one', null, 'failed')
    expect(JSON.parse(await readFile(file, 'utf8')).entries).toHaveLength(1)
    await expect(reserveBudget(file, 'development', 'one', 40)).rejects.toThrow()
    await expect(reserveBudget(file, 'development', 'two', 40)).rejects.toThrow()
  })
  it('成功按实际用量结算，失败或缺usage继续占用上界', async () => {
    const file = await budget()
    await reserveBudget(file, 'development', 'one', 70)
    await settleBudget(file, 'one', { prompt: 10, completion: 5 }, 'complete')
    await reserveBudget(file, 'development', 'two', 70)
    const data = JSON.parse(await readFile(file, 'utf8'))
    expect(data.entries[0].chargedTokens).toBe(15)
    expect(data.entries[1].chargedTokens).toBe(70)
    const unknown = await budget()
    await reserveBudget(unknown, 'development', 'one', 70)
    await settleBudget(unknown, 'one', null, 'complete')
    await expect(reserveBudget(unknown, 'development', 'two', 40)).rejects.toThrow()
  })
  it('并发进程争最后一个名额时只能有一个登记成功', async () => {
    const file = await budget(1)
    const result = await Promise.allSettled([
      reserveBudget(file, 'development', 'one', 30),
      reserveBudget(file, 'development', 'two', 30),
    ])
    expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(JSON.parse(await readFile(file, 'utf8')).entries).toHaveLength(1)
  })
  it('次数、阶段保留、token额度和非法数值分别阻止发送', async () => {
    const file = await budget(2, 100, 1)
    await reserveBudget(file, 'development', 'one', 40)
    await expect(reserveBudget(file, 'development', 'two', 20)).rejects.toThrow()
    await expect(reserveBudget(file, 'sealed', 'three', 61)).rejects.toThrow()
    await expect(reserveBudget(file, 'sealed', 'nan', Number.NaN)).rejects.toThrow()
    await reserveBudget(file, 'sealed', 'four', 50)
    await expect(reserveBudget(file, 'browser', 'five', 1)).rejects.toThrow()
  })
})
