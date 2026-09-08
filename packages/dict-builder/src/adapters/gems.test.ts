import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildGemsDict, parseRepoeSkillGems } from './gems'
import { parseListPage } from './poe2dbList'

const fixtures = fileURLToPath(new URL('../../fixtures/', import.meta.url))
const read = (file: string): string => readFileSync(`${fixtures}${file}`, 'utf8')
const repoe = parseRepoeSkillGems(JSON.parse(read('repoe-skill-gems-mini.json')))
const en = parseListPage(read('poe2db-list-gem-us.html'), 'gem').names
const cn = parseListPage(read('poe2db-list-gem-cn.html'), 'gem').names
const meta = { source: 'test', gameVersion: '0.5', fetchedAt: '2026-09-07T00:00:00Z' }

describe('parseRepoeSkillGems', () => {
  it('顶层键即 gameId，display_name 为英文名；base_item 为 null 的只计数', () => {
    expect(repoe.gems).toHaveLength(11)
    expect(repoe.gems[0]).toEqual({
      gameId: 'Metadata/Items/Gems/SkillGemFlameblast',
      name: 'Flameblast',
    })
    expect(repoe.noBaseItem).toBe(1)
  })
  it('拒绝不合法形态并指出位置', () => {
    expect(() => parseRepoeSkillGems([])).toThrow('顶层')
    expect(() => parseRepoeSkillGems({ 'Metadata/X': { base_item: {} } })).toThrow('Metadata/X')
  })
})

describe('buildGemsDict', () => {
  const { dict, audit } = buildGemsDict({ ...repoe, en, target: cn, meta })

  it('键为 gameId 末段；重名宝石共享译名；占位名跳过；us 页英文名不等或目标页缺失不输出', () => {
    expect(dict.entries).toEqual({
      SkillGemFlameblast: { en: 'Flameblast', text: '烈焰爆破' },
      SupportGemConsideredCasting: { en: 'Considered Casting', text: '审慎施法' },
      SupportGemMorrigansInsight: { en: "Mórrigan's Insight", text: '莫丽根的洞察' },
      SupportGemUnleash: { en: 'Unleash', text: '释出' },
      SkillGemAscendancyUnleash: { en: 'Unleash', text: '释出' },
      SkillGemComingSoon: { en: 'Coming Soon', text: '敬请期待' },
    })
    expect(dict._meta).toEqual({ ...meta, tier: 'gray', count: 6 })
  })

  it('审计计数', () => {
    expect(audit).toEqual({
      candidates: 9,
      joined: 6,
      missingInEn: 1,
      enMismatch: ['Renamed_Gem: Renamed Gem ≠ Renamed Gem Two'],
      missingInTarget: 1,
      sameAsEn: 0,
      repoeGems: 11,
      noBaseItem: 1,
      skippedPlaceholder: 2,
      duplicateKey: 0,
    })
  })
})
