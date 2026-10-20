import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createGameLexicon, type GameLexicon, type Term } from '@poe2-tools/l10n-core'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { buildDictionary } from '../scripts/build-dictionary.mjs'
import corpus from './fixtures/stat-corpus.json'

let folder: string
let terms: Term[]
let lexicon: GameLexicon
const root = path.resolve(import.meta.dirname, '../../..')
beforeAll(async () => {
  folder = await mkdtemp(path.join(tmpdir(), 'coe-stat-coverage-'))
  terms = (await buildDictionary(root, path.join(folder, 'dictionary.json'))).terms
  lexicon = createGameLexicon(terms)
})
afterAll(async () => {
  if (folder) await rm(folder, { recursive: true, force: true })
})

it('扩展词缀来源与旧 .build 投影分离，并保留三服快照和裁决', async () => {
  for (const locale of ['zh-CN', 'zh-TW']) {
    const catalog = JSON.parse(
      await readFile(path.join(root, `data/l10n/stats/${locale}.json`), 'utf8'),
    )
    expect(catalog._meta.projection).toBe('source-placeholders')
    expect(catalog._meta.sources.map((s: { locale: string }) => s.locale)).toEqual(['en', locale])
    expect(
      catalog._meta.sources.every(
        (s: { sha256: string; fetchedAt: string }) =>
          /^[a-f0-9]{64}$/.test(s.sha256) && !!s.fetchedAt,
      ),
    ).toBe(true)
    expect({
      joined: catalog.audit.joined,
      missingInTarget: catalog.audit.missingInTarget,
      groupMismatch: catalog.audit.groupMismatch,
      placeholderMismatch: catalog.audit.placeholderMismatch,
      untranslated: catalog.audit.untranslated.length,
      unresolved: catalog.audit.unresolved.length,
    }).toEqual(
      locale === 'zh-CN'
        ? {
            joined: 3704,
            missingInTarget: 636,
            groupMismatch: 0,
            placeholderMismatch: [],
            untranslated: 0,
            unresolved: 0,
          }
        : {
            joined: 3714,
            missingInTarget: 2314,
            groupMismatch: 0,
            placeholderMismatch: ['explicit.stat_1867725690#0'],
            untranslated: 33,
            unresolved: 6,
          },
    )
  }
})

it('全部简体源模板均能生成译文；固定条件不会被当成同一模板的变量', () => {
  const source = terms.filter((term) => term.domain === 'stat' && !term.inputOnly)
  // 这是当前发布快照的分母；变更必须连同来源、裁决和覆盖变化一起审查。
  expect(source).toHaveLength(3706)
  const missing: unknown[] = []
  const overmatched: string[] = []
  for (const term of source) {
    const result = lexicon.resolveStat(term.en)
    if (result.status !== 'translated') missing.push({ en: term.en, status: result.status })
    const changed = term.en.replace(/\d+(?:\.\d+)?/, (number) => String(Number(number) + 913))
    if (
      changed !== term.en &&
      lexicon.resolveStat(changed).candidates.some((c) => c.term.id === term.id)
    )
      overmatched.push(term.en)
  }
  expect(missing).toEqual([])
  expect(overmatched).toEqual([])
}, 120_000)

it('所有简繁原模板的正确反向候选仍在，歧义不能静默变成错误的唯一译文', () => {
  const source = terms.filter((term) => term.domain === 'stat')
  expect(source).toHaveLength(7420)
  const failures: unknown[] = []
  const values = [13, 29, 47, 61, 83, 97, 113, 131]
  for (const term of source) {
    let index = 0
    const english = term.en.replace(/#/g, () => String(values[index++]))
    index = 0
    const chinese = term.zh.replace(/#/g, () => {
      const i = term.order?.[index] ?? index
      index++
      return String(values[i])
    })
    const expected =
      term.sourceId === 'rune.stat_226999623'
        ? english.replace(' for 13 second on ', ' for 13 seconds on ')
        : english
    const result = lexicon.resolveStat(chinese, 'toEnglish')
    if (
      !result.candidates.some((c) => c.text.toLowerCase() === expected.toLowerCase()) ||
      (result.text !== null && result.text.toLowerCase() !== expected.toLowerCase())
    )
      failures.push({ en: expected, zh: chinese, status: result.status, actual: result.text })
  }
  expect(failures).toEqual([])
}, 120_000)

it.each(corpus.cases)('冻结句式：$kind', ({ en, zh }) => {
  expect(lexicon.translate(en, 'stat')).toBe(zh)
  if (zh !== null && !zh.includes('#')) {
    const result = lexicon.resolveStat(zh, 'toEnglish')
    expect(result.candidates.some((c) => c.text.toLowerCase() === en.toLowerCase())).toBe(true)
  }
})
