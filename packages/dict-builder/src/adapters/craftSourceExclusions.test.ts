import { expect, it } from 'vitest'
import { sha256 } from '../util/json'
import { excludeDeclaration } from './craftSourceExclusions'

it('仅在完整声明哈希一致时隔离上游异常，不改动相邻记录', () => {
  const bad = 'itemBases["Bad"] = { weapon = { X = 1, X = 2 } }\n'
  const following = 'itemBases["Good"] = { type = "Focus" }\nend'
  const source = `return function(itemBases)\n${bad}${following}`
  expect(excludeDeclaration(source, 'Bad', sha256(bad))).toBe(
    `return function(itemBases)\n${following}`,
  )
  expect(() => excludeDeclaration(source.replace('X = 2', 'X = 3'), 'Bad', sha256(bad))).toThrow()
})
