import { fileURLToPath } from 'node:url'
import type { DictBundle } from '@poe2-tools/build-core'
import { describe, expect, it } from 'vitest'
import { type CoverageSets, findRegressions, listBuildFiles, measureCoverage } from './coverage'

const synthetic = fileURLToPath(new URL('../../../data/fixtures/synthetic/', import.meta.url))

const bundle: DictBundle = {
  locale: 'zh-CN',
  stats: {
    _meta: { source: 't', tier: 'primary', gameVersion: '0', fetchedAt: '2026-09-07', count: 3 },
    entries: [
      { id: 'a', en: '+# to maximum Life', text: '+# 最大生命' },
      { id: 'b', en: '#% increased Spell Damage', text: '法术伤害提高 #%' },
      { id: 'c', en: '#% increased Movement Speed', text: '移动速度提高 #%' },
    ],
  },
}

describe('listBuildFiles', () => {
  it('列出 .build，排除期望输出文件，目录不存在返回空', async () => {
    const files = await listBuildFiles(synthetic)
    expect(files.map((f) => f.split('/').at(-1))).toEqual(['minimal.build', 'rich.build'])
    expect(await listBuildFiles('/nonexistent/dir')).toEqual([])
  })
})

describe('measureCoverage', () => {
  it('合成样本：8 条编号行命中 3 条', async () => {
    const coverage = await measureCoverage(bundle, await listBuildFiles(synthetic))
    expect(coverage).toEqual({
      files: 2,
      modCandidates: 8,
      modTranslated: 3,
      rate: 0.375,
      namesTranslated: 0,
    })
  })
  it('没有候选行时 rate 为 null', async () => {
    expect(await measureCoverage(bundle, [])).toEqual({
      files: 0,
      modCandidates: 0,
      modTranslated: 0,
      rate: null,
      namesTranslated: 0,
    })
  })
})

describe('findRegressions', () => {
  const at = (rate: number | null, files = 2): CoverageSets['synthetic'] => ({
    files,
    modCandidates: 8,
    modTranslated: 0,
    rate,
    namesTranslated: 0,
  })
  it('下降超过阈值才算回归', () => {
    // 下降 0.2 个百分点在阈值内
    expect(
      findRegressions({ synthetic: at(0.5), local: null }, { synthetic: at(0.502), local: null }),
    ).toEqual([])
    expect(
      findRegressions({ synthetic: at(0.5), local: null }, { synthetic: at(0.52), local: null }),
    ).toHaveLength(1)
  })
  it('基线缺失、文件数不同或 rate 为 null 时不比较', () => {
    expect(findRegressions({ synthetic: at(0.1), local: at(0.1) }, null)).toEqual([])
    expect(
      findRegressions({ synthetic: at(0.1), local: null }, { synthetic: at(0.9, 3), local: null }),
    ).toEqual([])
    expect(
      findRegressions({ synthetic: at(null), local: null }, { synthetic: at(0.9), local: null }),
    ).toEqual([])
  })
})
