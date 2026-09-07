import { describe, expect, it } from 'vitest'
import { miniBundle, miniIndex } from '../testing/miniDict'
import { buildDictIndex } from './index'

describe('buildDictIndex', () => {
  it('stats 用 templateKey 建索引，重复键先到先得', () => {
    const index = buildDictIndex({
      locale: 'zh-CN',
      stats: {
        _meta: {
          source: 'test',
          tier: 'primary',
          gameVersion: '0',
          fetchedAt: '2026-09-07',
          count: 2,
        },
        entries: [
          { id: 'explicit.stat_1', en: '+# to maximum Life', text: '+# 最大生命' },
          { id: 'fractured.stat_1', en: '+# to maximum Life', text: '+# 最大生命（分裂）' },
        ],
      },
    })
    expect(index.statsByKey.get('# to maximum life')?.id).toBe('explicit.stat_1')
    expect(index.statsByKey.size).toBe(1)
  })

  it('缺失的词典表得到空 Map', () => {
    const index = buildDictIndex({ locale: 'zh-TW' })
    expect(index.locale).toBe('zh-TW')
    expect(index.statsByKey.size).toBe(0)
    expect(index.bases.size).toBe(0)
    expect(index.gems.size).toBe(0)
    expect(index.inventories.size).toBe(0)
  })

  it('微型词典各表都建了索引', () => {
    expect(miniIndex.bases.get('Pyrophyte Staff')).toBe(miniBundle.items?.bases['Pyrophyte Staff'])
    expect(miniIndex.uniques.get('Surefooted Sigil')).toBeDefined()
    expect(miniIndex.gems.get('SkillGemFlameblast')?.en).toBe('Flameblast')
    expect(miniIndex.passives.get('strength16')?.text).toBeDefined()
    expect(miniIndex.ascendancies.get('Sorceress3')).toBeDefined()
    expect(miniIndex.inventories.get('Weapon1')).toBeDefined()
  })
})
