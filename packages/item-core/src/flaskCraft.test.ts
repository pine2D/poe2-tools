import { expect, it } from 'vitest'
import { required } from './beltTestFixture'
import { catalog, dictionary } from './catalystTestFixture'
import { collectCraftCosts } from './craftCosts'
import { exportCraftItemText } from './craftItemText'
import { applyCraftStep } from './craftSteps'
import { inspectItem } from './export'
import { parseItem } from './parse'
import {
  type CraftResult,
  type CraftState,
  craftCandidates,
  createCraftState,
  prepareCraftOperation,
} from './rehearsal'
import { importCraftState } from './rehearsalImport'
import { planCraftTargetRoutes } from './targetRoutes'

function must<T>(result: CraftResult<T>): T {
  if (!result.ok) throw Error(result.error)
  return result.value
}
function initial(baseId = 'Ultimate Life Flask'): CraftState {
  return { baseId, itemLevel: 86, rarity: 'normal', sourceText: null, affixes: [] }
}
const recovery = 'FlaskIncreasedRecoveryAmount1'
const charges = 'FlaskExtraCharges1'
it('药剂原文类型损坏时返回校验失败而不抛异常', () => {
  expect(
    createCraftState(catalog, { ...initial(), sourceText: 42 } as unknown as CraftState).ok,
  ).toBe(false)
})
it('18生命魔力药剂支持普通起点，缺品质不借目录20填补，非药剂特殊身份仍拒绝', () => {
  const bases = catalog.bases.filter((b) => b.type === 'Flask')
  expect(bases).toHaveLength(18)
  for (const base of bases) {
    const state = must(createCraftState(catalog, initial(base.id)))
    expect(state.quality).toBeUndefined()
    expect(createCraftState(catalog, { ...state, quality: 20 }).ok).toBe(true)
    for (const patch of [
      { rarity: 'rare' },
      { quality: 21 },
      { corrupted: true },
      { destroyed: true },
      { sockets: [] },
      { declaredSkillLevel: 13 },
      { catalyst: { id: 'Flesh', quality: 0 } },
    ])
      expect(createCraftState(catalog, { ...state, ...patch } as CraftState).ok).toBe(false)
    for (const patch of [
      { hidden: true },
      { variantList: ['x'] },
      { runeforged: true },
      { flask: { ...base.flask, duration: 99 } },
    ])
      expect(createCraftState({ ...catalog, bases: [{ ...base, ...patch }] }, state).ok).toBe(false)
  }
})
it('蜕变增幅各一条，剥离至零仍魔法，神圣只改实际数值并按步计费', () => {
  const start = must(createCraftState(catalog, initial()))
  const magic = must(
    applyCraftStep(catalog, start, {
      currency: 'transmutation',
      modIds: [recovery],
      rolls: [{ modId: recovery, values: [43] }],
    }),
  )
  expect(magic.rarity).toBe('magic')
  const full = must(
    applyCraftStep(catalog, magic, {
      currency: 'augmentation',
      modIds: [charges],
      rolls: [{ modId: charges, values: [25] }],
    }),
  )
  expect(prepareCraftOperation(catalog, full, 'augmentation').ok).toBe(false)
  expect(craftCandidates(catalog, full)).toEqual([])
  const divine = must(
    applyCraftStep(catalog, full, {
      currency: 'divine',
      modIds: [],
      rolls: [
        { modId: recovery, values: [45] },
        { modId: charges, values: [30] },
      ],
    }),
  )
  expect(divine.affixes.map((a) => a.lines)).toEqual([
    ['45(41-45)% increased Amount Recovered'],
    ['30(23-30)% increased Charges'],
  ])
  const prefixRemoved = must(
    applyCraftStep(catalog, divine, {
      currency: 'annulment',
      modIds: [],
      removeModId: recovery,
      omen: 'sinistral_annulment',
    }),
  )
  const empty = must(
    applyCraftStep(catalog, prefixRemoved, {
      currency: 'annulment',
      modIds: [],
      removeModId: charges,
      omen: 'dextral_annulment',
    }),
  )
  expect(empty.rarity).toBe('magic')
  expect(empty.affixes).toEqual([])
  expect(prepareCraftOperation(catalog, empty, 'transmutation').ok).toBe(false)
  expect(
    must(
      collectCraftCosts(catalog, [
        { currency: 'annulment', modIds: [], removeModId: charges, omen: 'dextral_annulment' },
      ]),
    ),
  ).toHaveLength(2)
})
it('三档蜕变增幅按44/70物等及同族最高档回退，非法rare/特殊材料不露出候选', () => {
  const start = must(createCraftState(catalog, initial()))
  for (const [currency, minimum] of [
    ['transmutation', 1],
    ['greater_transmutation', 44],
    ['perfect_transmutation', 70],
  ] as const) {
    expect(prepareCraftOperation(catalog, { ...start, itemLevel: minimum }, currency).ok).toBe(true)
    if (minimum > 1)
      expect(
        prepareCraftOperation(catalog, { ...start, itemLevel: minimum - 1 }, currency).ok,
      ).toBe(false)
  }
  const magic = { ...start, rarity: 'magic' as const }
  for (const [currency, minimum] of [
    ['augmentation', 1],
    ['greater_augmentation', 44],
    ['perfect_augmentation', 70],
  ] as const) {
    expect(prepareCraftOperation(catalog, { ...magic, itemLevel: minimum }, currency).ok).toBe(true)
    if (minimum > 1)
      expect(
        prepareCraftOperation(catalog, { ...magic, itemLevel: minimum - 1 }, currency).ok,
      ).toBe(false)
  }
  const candidates = craftCandidates(catalog, magic, 'perfect_augmentation')
  expect(candidates.some((m) => m.id === 'FlaskFillChargesPerMinute3')).toBe(true)
  expect(candidates.some((m) => m.id === 'FlaskFillChargesPerMinute1')).toBe(false)
  for (const currency of [
    'regal',
    'greater_regal',
    'perfect_regal',
    'alchemy',
    'exalted',
    'chaos',
  ] as const) {
    expect(prepareCraftOperation(catalog, magic, currency).ok).toBe(false)
    expect(craftCandidates(catalog, magic, currency)).toEqual([])
  }
  expect(prepareCraftOperation(catalog, magic, 'divine', undefined, 'blessed').ok).toBe(false)
})
it('目标路线从普通药剂蜕变至双词缀魔法药剂，不生成稀有路线', () => {
  const start = must(createCraftState(catalog, initial()))
  const routes = must(
    planCraftTargetRoutes(catalog, start, [recovery, charges], [], [], {
      maxDepth: 2,
      maxStates: 64,
    }),
  ).routes
  const route = required(routes[0])
  expect(route.steps.map((s) => ('currency' in s.operation ? s.operation.currency : ''))).toEqual([
    'transmutation',
    'augmentation',
  ])
  expect(route.finalState.rarity).toBe('magic')
  expect(route.finalState.affixes).toHaveLength(2)
})
it.each(['en', 'zh-CN', 'zh-TW'] as const)(
  '%s 完整药剂属性与说明保留观察，导入缺品质仍未知，出口不伪造旧恢复面板',
  (locale) => {
    const language = {
      en: [
        'Item Class: Life Flasks',
        'Rarity: Magic',
        'Item Level: 86',
        'Recovers 1200 Life over 3 Seconds',
        'Consumes 10 of 75 Charges on use',
        'Currently has 33 Charges',
        'Right click to drink. Can only hold charges while in belt. Refills as you kill monsters.',
      ],
      'zh-CN': [
        '物品类别: 生命药剂',
        '稀有度: 魔法',
        '物品等级: 86',
        '3 秒内回复 1200 生命',
        '每次使用会从 75 充能次数中消耗 10 次',
        '目前有 33 充能次数',
        '右键点击饮用。只能在腰带中持有充能。击败怪物时会补充充能。',
      ],
      'zh-TW': [
        '物品種類: 生命藥劑',
        '稀有度: 魔法',
        '物品等級: 86',
        '在 3 秒內回復 1200 生命',
        '每次使用會從 75 充能次數中消耗 10 次',
        '目前有 33 充能次數',
        '右鍵點擊飲用。只能在腰帶中持有充能。擊敗怪物時會補充充能。',
      ],
    }[locale]
    const text = [
      language[0],
      language[1],
      'Ultimate Life Flask',
      '--------',
      language[3],
      language[4],
      language[5],
      '--------',
      language[2],
      '--------',
      '{ Prefix Modifier "Opaque" — Flask }',
      '43(41-45)% increased Amount Recovered',
      '--------',
      language[6],
    ].join('\n')
    const parsed = parseItem(text)
    if (!parsed.ok) throw Error(parsed.error)
    expect(parsed.item.diagnostics).toEqual([])
    const imported = must(
      importCraftState(
        catalog,
        'Ultimate Life Flask',
        parsed.item,
        inspectItem(parsed.item, dictionary),
      ),
    )
    expect(imported.sourceText).toBe(text)
    expect(imported.quality).toBeUndefined()
    const output = must(exportCraftItemText(catalog, imported, { locale, dictionary })).text
    expect(output).not.toContain('1200')
    const reparsed = parseItem(output)
    if (!reparsed.ok) throw Error(reparsed.error)
    expect(
      importCraftState(
        catalog,
        imported.baseId,
        reparsed.item,
        inspectItem(reparsed.item, dictionary),
      ).ok,
    ).toBe(true)
    const withUnknown = parseItem(`${text}\n未知的药剂特殊规则`)
    if (!withUnknown.ok) throw Error(withUnknown.error)
    expect(
      importCraftState(
        catalog,
        imported.baseId,
        withUnknown.item,
        inspectItem(withUnknown.item, dictionary),
      ).ok,
    ).toBe(false)
  },
)

it.each([
  ['生命药剂', 'Life'],
  ['魔力药剂', 'Mana'],
  ['生命藥劑', 'Life'],
  ['魔力藥劑', 'Mana'],
])('对照出口将%s类别转为英文，原文仍完整保留', (itemClass, resource) => {
  const raw = `物品类别: ${itemClass}\n稀有度: 普通\nUltimate ${resource} Flask\n--------\n物品等级: 86`
  const parsed = parseItem(raw)
  if (!parsed.ok) throw Error(parsed.error)
  expect(inspectItem(parsed.item, dictionary).exportText).toContain(
    `Item Class: ${resource} Flasks`,
  )
})

it.each([
  [
    'Life Flasks',
    'Right click to drink. Can only hold charges while in belt. Refill at Wells or by killing monsters.',
  ],
  ['生命药剂', '点击右键以喝下药剂。只有装备于腰带上时才会充能。可通过水井或击败怪物补充。'],
  ['生命藥劑', '右鍵點擊以喝下藥劑。只有裝備於腰帶上時才會充能。在水井或殺死怪物可回復充能次數。'],
])('公开数据当前%s水井使用说明不误判为未知制作属性', (itemClass, usage) => {
  for (const resource of ['Life', 'Mana']) {
    const name = itemClass
      .replace('Life', resource)
      .replace('生命', resource === 'Life' ? '生命' : '魔力')
    const raw = `Item Class: ${name}\nRarity: Normal\nUltimate ${resource} Flask\n--------\nItem Level: 86\n--------\n${usage}`
    const parsed = parseItem(raw)
    if (!parsed.ok) throw Error(parsed.error)
    const result = importCraftState(
      catalog,
      `Ultimate ${resource} Flask`,
      parsed.item,
      inspectItem(parsed.item, dictionary),
    )
    expect(result.ok, result.ok ? '' : result.error).toBe(true)
    expect(
      parsed.item.blocks
        .filter((block) => block.kind === 'description')
        .flatMap((block) => block.lines.map((line) => line.raw)),
    ).toContain(usage)
  }
})
