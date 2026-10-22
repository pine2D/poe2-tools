// @vitest-environment node
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { createGameLexicon } from '../../../packages/l10n-core/src/stats'
import { buildGuideStats } from '../scripts/build-guide-stats.mjs'

const roots = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((r) => rm(r, { recursive: true, force: true })))
})
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'guide-stats-'))
  roots.push(root)
  await mkdir(path.join(root, 'data/l10n/stats'), { recursive: true })
  const data = {
    _meta: {
      tier: 'primary',
      source: 'trade2',
      gameVersion: 'unknown',
      projection: 'source-placeholders',
      decisions: [],
      sources: ['en', 'zh-CN'].map((locale) => ({ locale, sha256: 'a'.repeat(64) })),
    },
    entries: [
      { id: 'req', en: '#% increased Attribute Requirements', text: '属性需求提高 #%' },
      { id: 'fixed', en: 'Recover #% of Life every 4 seconds', text: '每 4 秒回复 #% 生命' },
      { id: 'local', en: '#% increased Spirit', text: '该装备精魂提高 #%', preferred: true },
      { id: 'global', en: '#% increased Spirit', text: '精魂提高 #%' },
      { id: 'missing', en: 'Gain # Unknown', text: 'Gain # Unknown' },
    ],
  }
  await writeFile(path.join(root, 'data/l10n/stats/zh-CN.json'), JSON.stringify(data))
  await writeFile(
    path.join(root, 'data/l10n/stat-decisions.json'),
    JSON.stringify({ entries: { 'zh-CN': [] } }),
  )
  return root
}
it('独立攻略投影复用新核心，固定条件与明确未译保留', async () => {
  const root = await fixture()
  const out = path.join(root, 'out.json')
  const dict = await buildGuideStats(root, out)
  expect(dict).toMatchObject({ schemaVersion: 1, locale: 'zh-CN', purpose: 'guide-stat' })
  const lex = createGameLexicon(dict.terms)
  expect(lex.resolveStat('25% reduced Attribute Requirements')).toMatchObject({
    status: 'translated',
    text: '属性需求降低 25%',
  })
  expect(lex.resolveStat('Recover 3% of Life every 5 seconds').status).toBe('unmatched')
  expect(lex.resolveStat('Gain 3 Unknown').status).toBe('source-untranslated')
  expect(JSON.parse(await readFile(out, 'utf8'))).toEqual(dict)
})
it('CoE 展示优选不能消除攻略词缀的真实语义歧义', async () => {
  const root = await fixture()
  const dict = await buildGuideStats(root, path.join(root, 'out.json'))
  expect(createGameLexicon(dict.terms).resolveStat('20% increased Spirit').status).toBe('ambiguous')
  expect(dict.terms.every((t) => t.domain === 'stat' && !t.preferred && !t.inputOnly)).toBe(true)
})
it('UI 与繁体输入数据不进入正文投影或其 hash', async () => {
  const root = await fixture()
  const before = await buildGuideStats(root, path.join(root, 'a.json'))
  await mkdir(path.join(root, 'data/l10n/coe-beta'), { recursive: true })
  await writeFile(path.join(root, 'data/l10n/coe-beta/ui.zh-CN.json'), 'invalid unused UI')
  await writeFile(path.join(root, 'data/l10n/stats/zh-TW.json'), 'invalid unused TW')
  const after = await buildGuideStats(root, path.join(root, 'b.json'))
  expect(after.hash).toBe(before.hash)
  expect(after.sources.map((s) => s.path)).toEqual(['data/l10n/stats/zh-CN.json'])
  expect(after.sources[0].sha256).toMatch(/^[a-f0-9]{64}$/)
})
it('缺少英文与国服独立快照时拒绝构建', async () => {
  const root = await fixture()
  const file = path.join(root, 'data/l10n/stats/zh-CN.json')
  const d = JSON.parse(await readFile(file, 'utf8'))
  d._meta.sources.pop()
  await writeFile(file, JSON.stringify(d))
  await expect(buildGuideStats(root, path.join(root, 'out.json'))).rejects.toThrow('来源')
})
