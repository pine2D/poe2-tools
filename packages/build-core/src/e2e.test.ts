import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseBuildFile, serializeBuildFile, translateBuild } from './index'
import { miniIndex } from './testing/miniDict'

const fixtures = fileURLToPath(new URL('../../../data/fixtures/synthetic/', import.meta.url))

describe('端到端：rich.build → zh-CN', () => {
  it('输出与期望文件逐键相同', () => {
    const parsed = parseBuildFile(readFileSync(`${fixtures}rich.build`, 'utf8'))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const { build, report } = translateBuild(parsed.build, miniIndex, {
      bilingual: false,
      annotateUniques: true,
    })
    const expected = readFileSync(`${fixtures}rich.expected.zh-CN.build`, 'utf8')
    expect(serializeBuildFile(build)).toBe(expected.trimEnd())
    // 编号行 8 条 + 命中的名称行 3 条（Pyrophyte Staff、Any Charm、Ruby Ring）+ 命中的传奇名 1 条（Belt1）
    expect(report.candidates).toBe(12)
    expect(report.translated).toBe(11)
    expect(report.modCandidates).toBe(8)
    expect(report.modTranslated).toBe(7)
  })
})
