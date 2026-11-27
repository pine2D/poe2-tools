import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { alloyCatalogSignature } from './alloys'
import { alloyTestFixture } from './alloyTestFixture'
import { beltCatalog, beltSource, required } from './beltTestFixture'
import type { CraftCatalog } from './catalog'
import {
  catalog as catalystCatalog,
  dictionary as catalystDictionary,
  imported as importedRing,
} from './catalystTestFixture'
import { createCraftItemDictionary } from './craftDictionary'
import { CRAFT_RULES_VERSION, type CraftProject } from './craftProject'
import type { TargetCraftProject } from './craftProjectTargets'
import { inspectItem } from './export'
import { FLUXES, fluxCatalogSignature } from './fluxes'
import { parseItem } from './parse'
import { catalog as makeCatalog, mod, state } from './partialTargetFixture'
import { compareCraftProjects } from './projectComparison'
import type { CraftResult } from './rehearsal'
import { importCraftState, importIdentifiedCraftState } from './rehearsalImport'
import { socketHash, socketStrategyCatalog } from './socketStrategyFixture'
import { statScalabilitySourceHash } from './statScalability'

const catalog = makeCatalog()
const start = state('normal')
function legacy(first = 'p1', second = 's1'): CraftProject {
  return {
    schemaVersion: 1,
    rulesVersion: CRAFT_RULES_VERSION,
    sourceCommit: catalog._meta.sourceCommit,
    initialState: start,
    operations: [
      { currency: 'transmutation', modIds: [first], rolls: [{ modId: first, values: [5] }] },
      { currency: 'augmentation', modIds: [second], rolls: [{ modId: second, values: [5] }] },
    ],
    targetModIds: ['s1'],
    cursor: 2,
  }
}
const must = <T>(r: CraftResult<T>): T => {
  if (!r.ok) throw Error(r.error)
  return r.value
}
const json = JSON.stringify
const compare = (a: unknown, b: unknown, c = catalog) => compareCraftProjects(json(a), json(b), c)
const real: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
function modern(
  baseId: string,
  rulesVersion: TargetCraftProject['rulesVersion'],
): TargetCraftProject {
  return {
    schemaVersion: 1,
    sourceCommit: real._meta.sourceCommit,
    rulesVersion,
    initialState: { ...start, baseId, itemLevel: 86, affixes: [], nextAffixId: 1 },
    operations: [],
    cursor: 0,
    orphanedTargets: [],
    targetDefinitions: { nextTargetId: 1, targets: [], alternatives: [], values: [] },
  }
}

describe('独立收藏的装备与演练终点', () => {
  it('两份旧项目反序添加相同词缀，即使 a1/a2 对调也得到相同终态', () => {
    const a = legacy()
    const b = legacy('s1', 'p1')
    for (const pair of [
      [a, b],
      [b, a],
    ] as const) {
      const res = must(compare(...pair))
      expect(res.sameEquipment).toBe(true)
      expect(res.affixDifferences).toEqual([])
      expect(res.left.goals.status).toBe('已达成')
    }
  })
  it('撤销只计当前位置的材料和目标，各自使用收藏内的定义', () => {
    const a = { ...legacy(), cursor: 1 }
    const b = { ...a, targetModIds: ['p1'] }
    const res = must(compare(a, b))
    expect(res.left.materials).toEqual([{ id: 'currency:transmutation', name: '蜕变石', count: 1 }])
    expect(res.left.goals.status).toBe('尚未达成')
    expect(res.right.goals.status).toBe('已达成')
    expect(must(compare({ ...a, cursor: 0 }, b)).left.materials).toEqual([])
  })
  it.each([
    ['物等', { itemLevel: 71 }],
    ['品质', { quality: 0 }],
  ])('不同起点被拒绝，区分未知和已知零（%s）', (label, difference) => {
    expect(
      compare(legacy(), { ...legacy(), initialState: { ...start, ...difference } }),
    ).toMatchObject({
      ok: false,
      error: expect.stringContaining(label),
    })
  })
  it('三服同基底和不同交易备注可比，逐份核对顶层孔位、品质及适用的目录来源', () => {
    const hash = 'b'.repeat(64)
    const c = makeCatalog()
    c.augments = socketStrategyCatalog().augments ?? []
    c._meta.sources.push({
      path: 'src/Data/ModRunes.lua',
      sha256: hash,
      url: 'https://example.test/runes',
    })
    const imported = (raw: string) => ({
      ...legacy(),
      augmentSourceHash: hash,
      importedSockets: [null],
      importedQuality: 20,
      initialState: { ...start, sourceText: raw, sockets: [null], quality: 20 },
    })
    const en = imported(
      'Item Class: Foci\nRarity: Normal\nFocus\n--------\nItem Level: 70\n--------\nNote: ~price 2 chaos',
    )
    const cn = imported(
      '物品类别: 法器\n稀有度: 普通\n测试法器\n--------\n物品等级: 70\n--------\n备注: 另一份',
    )
    const tw = imported('物品種類: 法器\n稀有度: 普通\n測試法器\n--------\n物品等級: 70')
    const dc = { items: { bases: { Focus: '测试法器' }, uniques: {} } }
    const dt = { items: { bases: { Focus: '測試法器' }, uniques: {} } }
    expect(must(compareCraftProjects(json(en), json(cn), c, {}, dc)).sameEquipment).toBe(true)
    expect(must(compareCraftProjects(json(cn), json(tw), c, dc, dt)).sameEquipment).toBe(true)
    const panels = (p: typeof en, rows: string) => ({
      ...p,
      initialState: {
        ...p.initialState,
        sourceText: `${p.initialState.sourceText}\n--------\n${rows}`,
      },
    })
    const enPanel = panels(
      en,
      'Properties:\nEnergy Shield: 80 (augmented)\n--------\nRequirements:\nLevel: 50\nInt: 20',
    )
    const cnPanel = panels(cn, '属性：\n能量护盾：80 (augmented)\n--------\n需求：20 智慧，等级 50')
    expect(must(compareCraftProjects(json(enPanel), json(cnPanel), c, {}, dc)).sameEquipment).toBe(
      true,
    )
    expect(
      compare(
        panels(en, 'Properties:\nUnmodelled value: 9'),
        panels(en, 'Requirements:\nUnmodelled value: 9'),
        c,
      ),
    ).toMatchObject({ ok: false, error: expect.stringContaining('无法可靠核对') })
    const declared = imported(
      en.initialState.sourceText.replace(
        'Item Level: 70',
        'Quality: +20%\n--------\nItem Level: 70',
      ),
    )
    const { importedQuality: _quality, ...fromText } = declared
    expect(must(compare(fromText, fromText, c)).sameEquipment).toBe(true)
    expect(compare(declared, fromText, c)).toMatchObject({
      ok: false,
      error: expect.stringContaining('声明'),
    })
    const fewerSockets = {
      ...en,
      importedSockets: [],
      initialState: { ...en.initialState, sockets: [] },
    }
    const lowerQuality = {
      ...en,
      importedQuality: 0,
      initialState: { ...en.initialState, quality: 0 },
    }
    for (const other of [fewerSockets, lowerQuality]) expect(compare(en, other, c).ok).toBe(false)
    // 同一件空白基底的历史可以单独需要镶嵌目录；两侧不必持有相同的可选指纹。
    const a = { ...legacy(), augmentSourceHash: hash, initialState: { ...start, sockets: [null] } }
    expect(compare(en, { ...en, augmentSourceHash: 'f'.repeat(64) }, c).ok).toBe(false)
    expect(compare(a, { ...a, augmentSourceHash: 'f'.repeat(64) }, c).ok).toBe(false)
    const extra = {
      ...en,
      initialState: {
        ...en.initialState,
        sourceText: `${en.initialState.sourceText}\n--------\nProperties:\nUnmodelled value: 9`,
      },
    }
    expect(compare(en, extra, c)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/无法.*核对|无法.*归一/),
    })
  })
  it('损坏、越界游标、来源失配与撤销位置之后的伪造步骤均不能比较', () => {
    for (const broken of [
      '{',
      json({ ...legacy(), cursor: 6 }),
      json({ ...legacy(), sourceCommit: '0'.repeat(40) }),
      json({ ...legacy(), cursor: 0, operations: [{ currency: 'regal', modIds: ['p1'] }] }),
    ]) {
      expect(compareCraftProjects(broken, json(legacy()), catalog)).toMatchObject({
        ok: false,
        error: expect.stringContaining('第一份'),
      })
      expect(compareCraftProjects(json(legacy()), broken, catalog)).toMatchObject({
        ok: false,
        error: expect.stringContaining('第二份'),
      })
    }
  })
  it('转换出同数值重复词缀后仍按个数和破裂标记双向区分', () => {
    const c = { ...real, fluxes: JSON.parse(readFileSync('data/craft/fluxes.json', 'utf8')) }
    const a = modern('Gold Ring', 'basic-2026-09-12-v75')
    a.fluxCatalogSignature = fluxCatalogSignature(c) ?? ''
    a.operations = [
      {
        currency: 'transmutation',
        modIds: ['FireResist4'],
        rolls: [{ affixId: 'a1', modId: 'FireResist4', values: [21] }],
      },
      { currency: 'augmentation', modIds: ['IncreasedLife1'] },
      { currency: 'regal', modIds: ['ColdResist4'] },
      { currency: 'exalted', modIds: ['LightningResist4'] },
      {
        kind: 'flux',
        fluxId: required(FLUXES[0]).id,
        rolls: [
          { affixId: 'a3', modId: 'FireResist4', values: [21] },
          { affixId: 'a4', modId: 'FireResist4', values: [25] },
        ],
      },
      { kind: 'fracture', modId: 'FireResist4', affixId: 'a3' },
    ]
    a.cursor = 5
    const b = { ...a, cursor: 6 }
    const diff = must(compare(a, b, c)).affixDifferences
    expect(diff).toHaveLength(2)
    expect(diff).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          modId: 'FireResist4',
          leftCount: 2,
          rightCount: 1,
          fractured: false,
        }),
        expect.objectContaining({
          modId: 'FireResist4',
          leftCount: 0,
          rightCount: 1,
          fractured: true,
        }),
      ]),
    )
    expect(must(compare(b, a, c)).affixDifferences).toEqual(
      diff.map(({ leftCount, rightCount, ...row }) => ({
        ...row,
        leftCount: rightCount,
        rightCount: leftCount,
      })),
    )
    // 当前位置只有一条数值未知的火抗；即使未来可以转换，当前也无法占用两个目标。
    const targets = ['t1', 't2'].map((targetId) => ({ targetId, modId: 'FireResist4' }))
    const pendingRoll = {
      ...a,
      cursor: 1,
      targetDefinitions: {
        nextTargetId: 3,
        targets,
        alternatives: [],
        values: targets.map((target) => ({ ...target, bounds: [{ index: 0, min: 22 }] })),
      },
      operations: [
        { currency: 'transmutation', modIds: ['FireResist4'] },
        ...a.operations.slice(1),
      ],
    }
    expect(must(compare(pendingRoll, pendingRoll, c)).left.goals.status).toBe('尚未达成')
  })
  it('撤销到起点仍以该存档完整的真实镶嵌历史核对双工艺容量', () => {
    const c = { ...real, alloys: alloyTestFixture() }
    const a = modern('Volatile Wand', 'basic-2026-09-16-v87')
    a.initialState.sockets = [null]
    a.initialState.quality = 20
    a.augmentSourceHash = required(
      c._meta.sources.find((s) => s.path.endsWith('ModRunes.lua')),
    ).sha256
    const b = {
      ...a,
      alloyCatalogSignature: alloyCatalogSignature(c),
      operations: [
        {
          kind: 'socket',
          socketIndex: 0,
          augmentId: `pob2:augment:["Astrid's Creativity","caster"]`,
        },
      ],
      targetDefinitions: {
        nextTargetId: 3,
        targets: [
          'AlloyEffectOfSocketedAugments1',
          'AlloyCastSpeedDamageAsExtraColdHybridOneHand1',
        ].map((modId, i) => ({ targetId: `t${i + 1}`, modId })),
        alternatives: [],
        values: [],
      },
    }
    const res = must(compare(a, b, c))
    expect(res.left.goals.status).toBe('未设置目标')
    expect(res.right.goals.status).toBe('尚未达成')
    expect(res.right.materials).toEqual([])
    expect(compare(b, { ...b, operations: [] }, c).ok).toBe(false)
  })
  it('技能最高等级和辅助孔独立比较，未知孔数不作零，固有目标按各自位置核对', () => {
    const a = modern('Rattling Sceptre', 'basic-2026-09-17-v100')
    a.targetImplicitValues = [
      { kind: 'granted-skill-sockets', lineIndex: 0, bounds: [{ index: 0, min: 5 }] },
    ]
    a.operations = [
      { kind: 'skill-sockets', tier: 'perfect', previousSockets: 2 },
      { kind: 'perfect-flux', previousMaxLevel: 13 },
    ]
    const res = must(compare(a, { ...a, cursor: 2 }, real))
    expect(res.sameEquipment).toBe(false)
    expect(res.left.equipment.skill).toMatchObject({ level: null, sockets: null })
    expect(res.right.equipment.skill).toMatchObject({ level: 20, sockets: 5 })
    expect(res.left.goals.status).toBe('待核对')
    expect(res.right.goals.status).toBe('已达成')
  })
  it('英文复数和国服单数咒符栏还原为同一件腰带，保留不同掷值', () => {
    const c = beltCatalog()
    function saved(locale: 'en' | 'zh-CN', slots: string) {
      const source = beltSource(locale, slots)
      const initialState = must(
        importCraftState(
          c,
          'Synthetic Base',
          source.item,
          source.inspection,
          undefined,
          undefined,
          source.dictionary.stats?.entries,
        ),
      )
      return {
        text: json({
          schemaVersion: 1,
          sourceCommit: c._meta.sourceCommit,
          rulesVersion: CRAFT_RULES_VERSION,
          initialState,
          operations: [],
          cursor: 0,
        }),
        dictionary: source.dictionary,
      }
    }
    const en = saved('en', '2(1-2)')
    const cn = saved('zh-CN', '2(1-2)')
    const other = saved('en', '1(1-2)')
    expect(
      must(compareCraftProjects(en.text, cn.text, c, en.dictionary, cn.dictionary)).sameEquipment,
    ).toBe(true)
    expect(
      compareCraftProjects(en.text, other.text, c, en.dictionary, other.dictionary),
    ).toMatchObject({ ok: false, error: expect.stringContaining('固有属性') })
  })
  it('导入时的词缀顺序、局部编号与数值书写不参与起点身份，多行词缀按整组对应', () => {
    const c = makeCatalog([
      mod('p1', 'prefix', { lines: ['Life (1-10)', 'Life (1-20)'] }),
      mod('s1', 'suffix'),
    ])
    const dictionary = createCraftItemDictionary(c)
    const prefix = '{ Prefix Modifier "Test" }\nLife 5\nLife 15'
    const suffix = '{ Suffix Modifier "Test" }\ns1 5'
    function saved(first: string, second: string) {
      const parsed = parseItem(
        `Item Class: Foci\nRarity: Rare\nSynthetic\nFocus\n--------\nItem Level: 70\n--------\n${first}\n${second}`,
      )
      if (!parsed.ok) throw Error(parsed.error)
      const initialState = must(
        importIdentifiedCraftState(c, 'Focus', parsed.item, inspectItem(parsed.item, dictionary)),
      )
      return {
        ...modern('Focus', 'basic-2026-09-12-v74'),
        sourceCommit: c._meta.sourceCommit,
        initialState,
      }
    }
    const a = saved(prefix, suffix)
    const b = saved(suffix, prefix.replace('Life 5\nLife 15', 'Life 15(1-20)\nLife 5(1-10)'))
    expect(a.initialState.affixes[0]?.modId).not.toBe(b.initialState.affixes[0]?.modId)
    expect(must(compare(a, b, c)).sameEquipment).toBe(true)
    expect(compare(a, saved(prefix.replace('Life 15', 'Life 16'), suffix), c)).toMatchObject({
      ok: false,
      error: expect.stringContaining('词缀与数值'),
    })
  })
  it('用当前的面板值核对目标，摧毁后记录萃取材料，撤销后装备和目标恢复', () => {
    const c = socketStrategyCatalog()
    const a = modern('Synthetic Base', 'basic-2026-09-18-v114')
    a.sourceCommit = c._meta.sourceCommit
    a.initialState.sockets = [null]
    a.augmentSourceHash = socketHash
    a.targetDefinitions.panelGoals = [
      { kind: 'item-property', property: 'fireResistance', min: 10 },
    ]
    a.operations = [{ kind: 'socket', socketIndex: 0, augmentId: 'fire' }, { kind: 'extraction' }]
    const equipped = { ...a, cursor: 1 }
    const res = must(compare(a, equipped, c))
    expect(res.left.goals).toMatchObject({ status: '尚未达成', rows: [{ detail: '当前 0' }] })
    expect(res.right.goals).toMatchObject({ status: '已达成', rows: [{ detail: '当前 12' }] })
    expect(res.right.equipment.sockets).toEqual(['fire'])
    const destroyed = must(compare(equipped, { ...a, cursor: 2 }, c))
    expect(destroyed.right.goals.status).toBe('装备已摧毁')
    expect(destroyed.sameEquipment).toBe(false)
    expect(destroyed.right.materials).toContainEqual(
      expect.objectContaining({ id: 'currency:extraction', count: 1 }),
    )
    expect(destroyed.left.materials).toHaveLength(1)
  })
  it('催化消耗只反映在已执行一侧的品质与预兆记录中', () => {
    const a = {
      ...legacy(),
      sourceCommit: catalystCatalog._meta.sourceCommit,
      targetModIds: [],
      initialState: must(importedRing()),
      scalabilitySourceHash: required(statScalabilitySourceHash(catalystCatalog)),
      operations: [
        {
          currency: 'exalted',
          omen: 'catalysing_exaltation',
          modIds: ['FireResist6'],
          rolls: [{ modId: 'FireResist6', values: [31] }],
        },
      ],
      cursor: 0,
    }
    const res = must(
      compareCraftProjects(json(a), json({ ...a, cursor: 1 }), catalystCatalog, catalystDictionary),
    )
    expect(res.left.equipment.catalyst).toEqual({ id: 'Flesh', quality: 20 })
    expect(res.right.equipment.catalyst).toEqual({ id: 'Flesh', quality: 0 })
    expect(res.left.materials).toEqual([])
    expect(res.right.materials).toContainEqual(
      expect.objectContaining({ id: 'omen:Omen of Catalysing Exaltation', count: 1 }),
    )
  })
})
