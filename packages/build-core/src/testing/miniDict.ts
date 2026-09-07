// 测试用微型词典。译文只保证测试内部一致，不是游戏真实本地化文本。
import { buildDictIndex } from '../dict/index'
import type { DictBundle, DictMeta } from '../dict/types'

const meta = (count: number): DictMeta => ({
  source: 'testing/miniDict',
  tier: 'manual',
  gameVersion: '0.0.0',
  fetchedAt: '2026-09-07',
  count,
})

export const miniBundle: DictBundle = {
  locale: 'zh-CN',
  stats: {
    _meta: meta(8),
    entries: [
      { id: 'explicit.stat_life', en: '+# to maximum Life', text: '+# 最大生命' },
      { id: 'explicit.stat_spell', en: '#% increased Spell Damage', text: '法术伤害提高 #%' },
      {
        id: 'explicit.stat_fire_lvl',
        en: '+# to Level of all Fire Spell Skills',
        text: '所有火焰法术技能等级 +#',
      },
      {
        id: 'explicit.stat_phys',
        en: 'Adds # to # Physical Damage to Attacks',
        text: '攻击附加 # - # 物理伤害',
      },
      { id: 'explicit.stat_ms', en: '#% increased Movement Speed', text: '移动速度提高 #%' },
      { id: 'explicit.stat_crit', en: '+#% to Critical Hit Chance', text: '+#% 暴击率' },
      { id: 'explicit.stat_fire_res', en: '+#% to Fire Resistance', text: '+#% 火焰抗性' },
      {
        id: 'explicit.stat_as_dex',
        en: '#% increased Attack Speed per 25 Dexterity',
        text: '每 25 点敏捷使攻击速度提高 #%',
      },
    ],
  },
  items: {
    _meta: meta(4),
    bases: { 'Pyrophyte Staff': '炎种长杖', 'Ruby Ring': '红宝石戒指', 'Any Charm': '任意魔符' },
    uniques: { 'Surefooted Sigil': '稳步印记' },
  },
  gems: {
    _meta: meta(3),
    entries: {
      SkillGemFlameblast: { en: 'Flameblast', text: '烈焰冲击' },
      SupportGemConsideredCasting: { en: 'Considered Casting', text: '深思施法' },
      SkillGemFirestorm: { en: 'Firestorm', text: '火焰风暴' },
    },
  },
  passives: {
    _meta: meta(2),
    entries: {
      strength16: { en: 'Strength', text: '力量' },
      AscendancyWitch1Notable4: { en: 'Notable', text: '核心天赋' },
    },
  },
  ascendancies: { _meta: meta(1), entries: { Sorceress3: '女巫 · 第三升华（测试）' } },
  inventories: {
    _meta: meta(4),
    entries: { Weapon1: '主手', Belt1: '腰带', Charm1: '魔符', Ring2: '戒指 2' },
  },
}

export const miniIndex = buildDictIndex(miniBundle)
