import { expect, it } from 'vitest'
import { required } from './beltTestFixture'
import { boneCatalog, boneState } from './boneTestFixture'
import { inspectModPool } from './catalog'
import { matchCatalogMods } from './catalogMatch'
import { CRAFT_RULES_VERSION, parseCraftProject } from './craftProject'
import { inspectItem } from './export'
import { parseItem } from './parse'
import { applyCraftOperation, createCraftState } from './rehearsal'
import { importCraftState } from './rehearsalImport'

const sourceText =
  'Item Class: Belts\nRarity: Rare\nSynthetic Name\nSynthetic Base\n--------\nItem Level: 64\n--------\n{ Prefix Modifier "prefix1" }\nprefix1 5\n{ Suffix Modifier "suffix1" }\nsuffix1 5'

function fixture() {
  const catalog = boneCatalog('Belt')
  const base = required(catalog.bases[0])
  base.tags = ['belt', 'default', 'genesis_tree_minion']
  base.socketLimit = null
  for (const id of ['prefix1', 'suffix1']) {
    required(catalog.modifiers.find((mod) => mod.id === id)).eligibility = [
      { tag: 'ring', value: 0 },
      { tag: 'genesis_tree_minion', value: 1 },
      { tag: 'default', value: 0 },
    ]
  }
  const state = boneState(['prefix1', 'suffix1'])
  delete state.sockets
  return { catalog, base, state }
}
function project(version = CRAFT_RULES_VERSION) {
  const { catalog, state } = fixture()
  return {
    schemaVersion: 1,
    rulesVersion: version,
    sourceCommit: catalog._meta.sourceCommit,
    initialState: { ...state, sourceText },
    operations: [],
    cursor: 0,
  }
}

it('已有两条普通标头 Genesis 精确匹配和导入，不猜工艺来源', () => {
  const { catalog, base } = fixture()
  const parsed = parseItem(sourceText)
  if (!parsed.ok) throw new Error(parsed.error)
  const inspection = inspectItem(parsed.item, {
    items: { bases: { 'Synthetic Base': 'Synthetic Base' }, uniques: {} },
  })
  expect(matchCatalogMods(base, catalog.modifiers, inspection.mods).map((m) => m.status)).toEqual([
    'matched',
    'matched',
  ])
  const imported = importCraftState(catalog, base.id, parsed.item, inspection)
  expect(imported).toMatchObject({
    ok: true,
    value: {
      affixes: [
        { modId: 'prefix1', lines: ['prefix1 5'] },
        { modId: 'suffix1', lines: ['suffix1 5'] },
      ],
    },
  })
  if (imported.ok)
    expect(
      imported.value.affixes.every((a) => a.crafted === undefined && a.desecrated === undefined),
    ).toBe(true)
})

it('已有 Genesis 可保留、神圣和移除；普通与亵渎池不能新造', () => {
  const { catalog, base, state } = fixture()
  expect(createCraftState(catalog, state).ok).toBe(true)
  expect(
    applyCraftOperation(catalog, state, {
      currency: 'divine',
      modIds: [],
      rolls: [
        { modId: 'prefix1', values: [9] },
        { modId: 'suffix1', values: [8] },
      ],
    }),
  ).toMatchObject({
    ok: true,
    value: {
      affixes: [
        { modId: 'prefix1', lines: ['prefix1 9(1-10)'] },
        { modId: 'suffix1', lines: ['suffix1 8(1-10)'] },
      ],
    },
  })
  expect(
    applyCraftOperation(catalog, state, {
      currency: 'annulment',
      modIds: [],
      removeModId: 'prefix1',
    }).ok,
  ).toBe(true)
  expect(
    applyCraftOperation(catalog, state, {
      currency: 'chaos',
      modIds: ['prefix2'],
      removeModId: 'prefix1',
    }).ok,
  ).toBe(true)
  expect(
    applyCraftOperation(catalog, state, {
      currency: 'chaos',
      modIds: ['prefix1'],
      removeModId: 'prefix1',
    }).ok,
  ).toBe(false)
  expect(
    applyCraftOperation(catalog, boneState(), { currency: 'exalted', modIds: ['prefix1'] }).ok,
  ).toBe(false)
  for (const source of ['ordinary', 'desecrated'] as const) {
    expect(
      inspectModPool(base, catalog.modifiers, 64, [], [], source).some(({ mod }) =>
        ['prefix1', 'suffix1'].includes(mod.id),
      ),
    ).toBe(false)
  }
})

it('首条负资格、无源 tags、非首饰类别和亵渎标记不得借已有身份放行', () => {
  const { catalog, base, state } = fixture()
  expect(
    createCraftState(catalog, {
      ...state,
      affixes: state.affixes.map((a, i) => (i ? a : { ...a, desecrated: true })),
    }).ok,
  ).toBe(false)
  base.tags.push('ring')
  expect(createCraftState(catalog, state).ok).toBe(false)
  base.tags = ['default']
  expect(createCraftState(catalog, state).ok).toBe(false)
  base.tags.push('genesis_tree_minion')
  base.type = 'Helmet'
  expect(createCraftState(catalog, state).ok).toBe(false)
})

it('v27 可以恢复已有 Genesis，v2–26 起点不能借新版放行', () => {
  const { catalog } = fixture()
  expect(parseCraftProject(JSON.stringify(project()), catalog)).toMatchObject({ ok: true })
  for (let v = 2; v <= 26; v++) {
    expect(
      parseCraftProject(
        JSON.stringify({ ...project(), rulesVersion: `basic-2026-09-12-v${v}` }),
        catalog,
      ).ok,
    ).toBe(false)
  }
})

it('游标之后的普通操作仍不能新增 Genesis', () => {
  const { catalog } = fixture()
  expect(
    parseCraftProject(
      JSON.stringify({
        ...project(),
        initialState: { ...boneState(), sockets: undefined, rarity: 'normal' },
        operations: [{ currency: 'exalted', modIds: ['prefix1'] }],
      }),
      catalog,
    ).ok,
  ).toBe(false)
})

it.each(['zh-CN', 'zh-TW'] as const)(
  '%s 独立译名精确导入，项目篡改数值与原文不一致被拒',
  (locale) => {
    const { catalog, base } = fixture()
    const tw = locale === 'zh-TW'
    const text = `${tw ? '物品種類: 腰帶\n稀有度: 稀有\n合成名稱\n合成腰帶' : '物品类别: 腰带\n稀有度: 稀有\n合成名称\n合成腰带'}\n--------\n${tw ? '物品等級' : '物品等级'}: 64\n--------\n{ ${tw ? '前綴屬性' : '前缀属性'} "合成甲" }\n合成甲 5\n{ ${tw ? '後綴屬性' : '后缀属性'} "合成乙" }\n合成乙 5`
    const dictionary = {
      items: { bases: { 'Synthetic Base': tw ? '合成腰帶' : '合成腰带' }, uniques: {} },
      stats: {
        entries: [
          { id: 'a', en: 'prefix1 #', text: '合成甲 #' },
          { id: 'b', en: 'suffix1 #', text: '合成乙 #' },
        ],
      },
    }
    const parsed = parseItem(text)
    if (!parsed.ok) throw new Error(parsed.error)
    const inspection = inspectItem(parsed.item, dictionary)
    const imported = importCraftState(
      catalog,
      base.id,
      parsed.item,
      inspection,
      undefined,
      undefined,
      dictionary.stats.entries,
    )
    if (!imported.ok) throw new Error(imported.error)
    expect(imported.ok).toBe(true)
    required(required(inspection.mods[0]).stats[0]).resolution.english = 'prefix1 9'
    expect(
      importCraftState(
        catalog,
        base.id,
        parsed.item,
        inspection,
        undefined,
        undefined,
        dictionary.stats.entries,
      ).ok,
    ).toBe(false)
    required(imported.value.affixes[0]).lines = ['prefix1 9']
    expect(
      parseCraftProject(
        JSON.stringify({ ...project(), initialState: imported.value }),
        catalog,
        dictionary,
      ).ok,
    ).toBe(false)
  },
)

it('动态标签不能注入已有身份，亵渎组与专属条目不能冒用普通匹配', () => {
  const { catalog, base } = fixture()
  const parsed = parseItem(sourceText)
  if (!parsed.ok) throw new Error(parsed.error)
  const inspection = inspectItem(parsed.item, {})
  expect(
    matchCatalogMods({ ...base, tags: ['default'] }, catalog.modifiers, inspection.mods, [
      'genesis_tree_minion',
    ]).every((m) => m.candidates.length === 0),
  ).toBe(true)
  const desecrated = structuredClone(inspection.mods)
  required(desecrated[0]).mod.states = ['desecrated']
  expect(required(matchCatalogMods(base, catalog.modifiers, desecrated)[0]).candidates).toEqual([])
  required(catalog.modifiers.find((m) => m.id === 'prefix1')).desecratedOnly = true
  expect(
    required(matchCatalogMods(base, catalog.modifiers, inspection.mods)[0]).candidates,
  ).toEqual([])
})

it.each([
  { targetModIds: ['prefix1'] },
  { targetValues: [{ modId: 'prefix1', bounds: [{ index: 0, min: 5 }] }] },
  { targetAlternatives: [{ targetModId: 'prefix2', modIds: ['prefix1'] }] },
])('旧版本不能注入 Genesis 目标字段 %j', (fields) => {
  const { catalog } = fixture()
  for (let v = 22; v <= 26; v++) {
    expect(
      parseCraftProject(
        JSON.stringify({
          ...project(),
          initialState: { ...boneState(), sockets: undefined, rarity: 'normal' },
          ...fields,
          rulesVersion: `basic-2026-09-12-v${v}`,
        }),
        catalog,
      ),
    ).toMatchObject({ ok: false, error: expect.stringContaining('Genesis') })
  }
})

it('旧精华精确映射的 crafted Genesis 起点与目标保持合法', () => {
  const { catalog } = fixture()
  required(catalog.modifiers.find((m) => m.id === 'suffix1')).eligibility = [
    { tag: 'default', value: 1 },
  ]
  catalog._meta.sources.push({ path: 'src/Data/Essence.lua', sha256: 'b'.repeat(64), url: '' })
  catalog.essences = [
    {
      id: 'Metadata/Items/Currency/CurrencyLesserEssenceLife',
      name: 'Lesser Essence of Life',
      type: 'Life',
      tierLevel: 1,
      mods: { Belt: 'prefix1' },
    },
  ]
  const saved = project()
  required(saved.initialState.affixes[0]).crafted = true
  saved.initialState.sourceText = sourceText.replace(
    '{ Prefix Modifier',
    '{ Crafted Prefix Modifier',
  )
  expect(
    parseCraftProject(
      JSON.stringify({ ...saved, rulesVersion: 'basic-2026-09-12-v26', targetModIds: ['prefix1'] }),
      catalog,
    ),
  ).toMatchObject({ ok: true })
})

it('旧项目两条精华映射 Genesis 目标仍保留旧工艺槽冲突', () => {
  const { catalog } = fixture()
  catalog._meta.sources.push({ path: 'src/Data/Essence.lua', sha256: 'b'.repeat(64), url: '' })
  catalog.essences = ['Life', 'Mana'].map((type, i) => ({
    id: `Metadata/Items/Currency/CurrencyLesserEssence${type}`,
    name: `Lesser Essence of ${type}`,
    type,
    tierLevel: 1,
    mods: { Belt: i ? 'suffix1' : 'prefix1' },
  }))
  const saved = {
    ...project(),
    initialState: { ...boneState(), rarity: 'normal', sockets: undefined },
    targetModIds: ['prefix1', 'suffix1'],
  }
  expect(parseCraftProject(JSON.stringify(saved), catalog).ok).toBe(true)
  expect(
    parseCraftProject(JSON.stringify({ ...saved, rulesVersion: 'basic-2026-09-12-v26' }), catalog)
      .ok,
  ).toBe(false)
})

it('Genesis 英文检查数值和伪造结构必须回到真实原文核验', () => {
  const { catalog, base } = fixture()
  const parsed = parseItem(sourceText)
  if (!parsed.ok) throw new Error(parsed.error)
  const dictionary = { items: { bases: { 'Synthetic Base': 'Synthetic Base' }, uniques: {} } }
  const inspection = inspectItem(parsed.item, dictionary)
  required(required(inspection.mods[0]).stats[0]).resolution.english = 'prefix1 9'
  expect(importCraftState(catalog, base.id, parsed.item, inspection).ok).toBe(false)
  const changed = structuredClone(parsed.item)
  required(required(changed.mods[0]).stats[0]).raw = 'prefix1 9'
  expect(importCraftState(catalog, base.id, changed, inspectItem(changed, dictionary)).ok).toBe(
    false,
  )
})
