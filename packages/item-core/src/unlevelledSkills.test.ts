import { describe, expect, it } from 'vitest'
import type { CatalogBase, CraftCatalog } from './catalog'
import { createCatalogTranslator } from './catalogTranslation'
import { exportCraftItemText } from './craftItemText'
import { CRAFT_RULES_VERSION, parseCraftProject } from './craftProject'
import { inspectItem } from './export'
import { readBaseGrantedSkills, resolveGrantedSkill } from './grantedSkills'
import { parseItem } from './parse'
import { prepareCraftOperation } from './rehearsal'
import { importCraftState } from './rehearsalImport'

const base: CatalogBase = {
  id: 'buckler',
  name: 'Test Buckler',
  type: 'Buckler',
  tags: ['default'],
  requirements: {},
  properties: {},
  implicit: 'Grants Skill: Parry',
  implicitTags: [],
  sourceQuality: null,
  socketLimit: null,
  hidden: false,
  runeforged: false,
}
const catalog: CraftCatalog = {
  bases: [base],
  modifiers: [],
  _meta: {
    schemaVersion: 2,
    tier: 'primary',
    sourceCommit: 'test',
    gameVersion: null,
    generatedAt: '',
    weightStatus: 'unknown',
    sources: [],
    excludedBases: [],
  },
}
const entry = {
  id: 'skill.parry',
  en: 'Grants Skill: Level # Parry',
  text: '获得技能: 等级 # 招架',
}
const dictionary = {
  items: { bases: { 'Test Buckler': '测试小盾' }, uniques: {} },
  stats: { entries: [entry] },
}
function source(line = 'Grants Skill: Parry') {
  const parsed = parseItem(
    `Item Class: Bucklers\nRarity: Normal\nTest Buckler\n--------\nItem Level: 70\n--------\n${line}`,
  )
  if (!parsed.ok) throw new Error(parsed.error)
  return parsed.item
}

describe('无等级静态技能', () => {
  it('三语由完整技能模板独立映射，英文可回退且不声明等级', () => {
    for (const [locale, raw, text] of [
      ['en', 'Grants Skill: Parry', entry.text],
      ['zh-CN', '获得技能: 招架', entry.text],
      ['zh-TW', '賦予技能: 招架', '賦予技能: 等級 # 招架'],
    ] as const) {
      expect(resolveGrantedSkill(raw, [{ ...entry, text }], locale)).toMatchObject({
        unlevelled: true,
        displayedLevel: null,
        maxLevel: null,
        resolution: { english: 'Grants Skill: Parry' },
      })
    }
    expect(resolveGrantedSkill('Grants Skill: Spear Throw', [], 'en').resolution.english).toBe(
      'Grants Skill: Spear Throw',
    )
    expect(resolveGrantedSkill('获得技能: 未收录', [entry], 'zh-CN').resolution.english).toBeNull()
    expect(
      resolveGrantedSkill(
        '获得技能: 招架',
        [entry, { ...entry, id: 'skill.other', en: 'Grants Skill: Level # Other' }],
        'zh-CN',
      ).resolution.english,
    ).toBeNull()
    expect(readBaseGrantedSkills(base)).toEqual([])
  })
  it('损坏等级、范围、数字和尾注不能退化成无等级名称', () => {
    for (const name of [
      'Level (1-20) Parry',
      'Level 1.5 Parry',
      'Level -1 Parry',
      'Level # Parry',
      'Level Parry',
      'Parry (Max Level 20)',
      'Parry (junk)',
      'Parry 20',
      'Level 12 Parry (Max Level 13) junk',
    ]) {
      expect(
        resolveGrantedSkill(`Grants Skill: ${name}`, [], 'en').resolution.english,
        name,
      ).toBeNull()
    }
    for (const text of ['获得技能: 等级 # 招架（最高等级 20）', '获得技能: 等级 # 招架尾注']) {
      expect(
        resolveGrantedSkill('获得技能: 招架', [{ ...entry, text }], 'zh-CN').resolution.english,
      ).toBeNull()
    }
  })
  it('目录展示用相同映射，歧义和未知返回空值', () => {
    expect(createCatalogTranslator([entry])('Grants Skill: Parry')).toBe('获得技能: 招架')
    expect(
      createCatalogTranslator([{ ...entry, text: '賦予技能: 等級 # 招架' }])('Grants Skill: Parry'),
    ).toBe('賦予技能: 招架')
    expect(createCatalogTranslator([entry])('Grants Skill: Spear Throw')).toBeNull()
    expect(
      createCatalogTranslator([
        entry,
        { ...entry, id: 'skill.other', text: '获得技能: 等级 # 另一技能' },
      ])('Grants Skill: Parry'),
    ).toBeNull()
  })
  it('导入导出回读、v18恢复通过，所有旧版来源拒绝且旧空白起点兼容', () => {
    const item = source()
    const imported = importCraftState(catalog, base.id, item, inspectItem(item, dictionary))
    expect(imported.ok).toBe(true)
    if (!imported.ok) return
    const exported = exportCraftItemText(catalog, imported.value)
    expect(exported.ok).toBe(true)
    if (!exported.ok) return
    expect(exported.value.warnings.join('\n')).not.toContain('授予技能等级未明确')
    const parsed = parseItem(exported.value.text)
    if (!parsed.ok) throw new Error(parsed.error)
    expect(
      importCraftState(catalog, base.id, parsed.item, inspectItem(parsed.item, dictionary)),
    ).toMatchObject({ ok: true, value: { implicitLines: ['Grants Skill: Parry'] } })
    const project = {
      schemaVersion: 1,
      sourceCommit: 'test',
      rulesVersion: CRAFT_RULES_VERSION,
      initialState: imported.value,
      operations: [],
      cursor: 0,
    }
    expect(CRAFT_RULES_VERSION).toBe('basic-2026-09-12-v40')
    expect(parseCraftProject(JSON.stringify(project), catalog, dictionary).ok).toBe(true)
    for (let version = 2; version <= 17; version++) {
      const old = { ...project, rulesVersion: `basic-2026-09-12-v${version}` }
      expect(
        parseCraftProject(JSON.stringify(old), catalog, dictionary).ok,
        `v${version} source`,
      ).toBe(false)
      expect(
        parseCraftProject(
          JSON.stringify({ ...old, initialState: { ...imported.value, sourceText: null } }),
          catalog,
          dictionary,
        ).ok,
        `v${version} blank`,
      ).toBe(true)
    }
  })
  it('中文需要词典证据，候选可显式消歧且深拷贝合法', () => {
    const parsed = parseItem(
      '物品类别: 小盾\n稀有度: 普通\n测试小盾\n--------\n物品等级: 70\n--------\n获得技能: 招架',
    )
    if (!parsed.ok) throw new Error(parsed.error)
    const inspection = inspectItem(parsed.item, dictionary)
    expect(importCraftState(catalog, base.id, parsed.item, inspection).ok).toBe(false)
    expect(
      importCraftState(
        catalog,
        base.id,
        parsed.item,
        structuredClone(inspection),
        undefined,
        undefined,
        dictionary.stats.entries,
      ).ok,
    ).toBe(true)
    const ambiguous = {
      ...dictionary,
      stats: {
        entries: [entry, { ...entry, id: 'skill.other', en: 'Grants Skill: Level # Other' }],
      },
    }
    const unresolved = inspectItem(parsed.item, ambiguous)
    expect(
      importCraftState(
        catalog,
        base.id,
        parsed.item,
        unresolved,
        undefined,
        undefined,
        ambiguous.stats.entries,
      ).ok,
    ).toBe(false)
    const selected = inspectItem(parsed.item, ambiguous, {
      [inspection.skills[0]?.source.line ?? 0]: entry.id,
    })
    expect(
      importCraftState(
        catalog,
        base.id,
        parsed.item,
        selected,
        undefined,
        undefined,
        ambiguous.stats.entries,
      ).ok,
    ).toBe(true)
  })
  it('完整回放游标之后的历史，静态技能不阻止数值词缀神圣重掷', () => {
    const data: CraftCatalog = {
      ...catalog,
      modifiers: [
        {
          id: 'life',
          name: 'Test',
          kind: 'prefix',
          group: 'life',
          level: 1,
          lines: ['+(10-20) to maximum Life'],
          statOrder: [1],
          tags: [],
          addsTags: [],
          eligibility: [{ tag: 'default', value: 1 }],
          tradeHashes: {},
        },
      ],
    }
    const item = source()
    const imported = importCraftState(data, base.id, item, inspectItem(item, dictionary))
    if (!imported.ok) throw new Error(imported.error)
    const project = {
      schemaVersion: 1,
      sourceCommit: 'test',
      rulesVersion: CRAFT_RULES_VERSION,
      initialState: imported.value,
      operations: [{ currency: 'transmutation', modIds: ['life'] }],
      cursor: 0,
    }
    expect(parseCraftProject(JSON.stringify(project), data, dictionary).ok).toBe(true)
    expect(
      parseCraftProject(
        JSON.stringify({
          ...project,
          operations: [...project.operations, { currency: 'augmentation', modIds: ['missing'] }],
        }),
        data,
        dictionary,
      ).ok,
    ).toBe(false)
    const restored = parseCraftProject(JSON.stringify({ ...project, cursor: 1 }), data, dictionary)
    expect(restored.ok).toBe(true)
    expect(
      prepareCraftOperation(
        data,
        {
          ...imported.value,
          rarity: 'magic',
          affixes: [{ modId: 'life', lines: ['+15 to maximum Life'] }],
        },
        'divine',
      ).ok,
    ).toBe(true)
  })
  it('不得伪造形态、数值、候选、原文或遗漏重复技能以进入制作', () => {
    const item = source()
    const inspection = inspectItem(item, dictionary)
    expect(importCraftState(catalog, base.id, item, inspection).ok).toBe(true)
    expect(
      importCraftState(
        catalog,
        base.id,
        item,
        structuredClone(inspection),
        undefined,
        undefined,
        dictionary.stats.entries,
      ).ok,
    ).toBe(true)
    for (const edit of [
      (skill: (typeof inspection.skills)[number]) => {
        skill.displayedLevel = 1
      },
      (skill: (typeof inspection.skills)[number]) => {
        skill.maxLevel = 20
      },
      (skill: (typeof inspection.skills)[number]) => {
        delete (skill as { unlevelled?: true }).unlevelled
      },
      (skill: (typeof inspection.skills)[number]) => {
        skill.resolution.candidates = [{ id: 'skill.fake', english: 'Grants Skill: Parry' }]
      },
    ]) {
      const forged = structuredClone(inspection)
      if (forged.skills[0]) edit(forged.skills[0])
      expect(
        importCraftState(
          catalog,
          base.id,
          item,
          forged,
          undefined,
          undefined,
          dictionary.stats.entries,
        ).ok,
      ).toBe(false)
    }
    expect(importCraftState(catalog, base.id, item, { ...inspection, skills: [] }).ok).toBe(false)
    expect(
      importCraftState(catalog, base.id, item, {
        ...inspection,
        skills: [...inspection.skills, ...inspection.skills],
      }).ok,
    ).toBe(false)
    for (const line of [
      'Grants Skill: Other',
      'Grants Skill: Level 1 Parry',
      'Grants Skill: Parry (Max Level 20)',
    ]) {
      const other = source(line)
      const forged = inspectItem(other, dictionary)
      if (forged.skills[0])
        Object.assign(forged.skills[0], {
          unlevelled: true,
          displayedLevel: null,
          maxLevel: null,
          resolution: {
            english: 'Grants Skill: Parry',
            candidates: [{ id: 'skill.parry', english: 'Grants Skill: Parry' }],
          },
        })
      expect(importCraftState(catalog, base.id, other, forged).ok).toBe(false)
    }
    const withoutSkill = { ...item, blocks: item.blocks.filter((block) => block.kind !== 'skill') }
    const disguised = inspectItem(withoutSkill, dictionary)
    expect(
      importCraftState(
        { ...catalog, bases: [{ ...base, implicit: null }] },
        base.id,
        withoutSkill,
        disguised,
      ).ok,
    ).toBe(false)
    const fakeImplicit = parseItem(
      'Item Class: Bucklers\nRarity: Normal\nTest Buckler\n--------\nItem Level: 70\n--------\n{ Implicit Modifier }\nGrants Skill: Parry',
    )
    if (fakeImplicit.ok) disguised.mods = inspectItem(fakeImplicit.item, dictionary).mods
    expect(importCraftState(catalog, base.id, withoutSkill, disguised).ok).toBe(false)
    const tampered = {
      ...item,
      rawText: item.rawText.replace('Grants Skill: Parry', 'Grants Skill: Other'),
    }
    expect(importCraftState(catalog, base.id, tampered, inspection).ok).toBe(false)
  })
})
