import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { type CraftCatalog, hasCraftModEligibility } from './catalog'
import { estimateFlaskProperties } from './flaskStats'
import { inspectNumericLines, renderNumericLines } from './numeric'
import type { CraftState } from './rehearsal'

const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
function state(baseId = 'Lesser Life Flask', quality?: number): CraftState {
  return {
    baseId,
    itemLevel: 86,
    rarity: 'normal',
    affixes: [],
    sourceText: null,
    ...(quality === undefined ? {} : { quality }),
  }
}
function withMod(base: CraftState, modId: string, values?: number[]): CraftState {
  const mod = catalog.modifiers.find((entry) => entry.id === modId)
  if (!mod) throw Error(modId)
  const lines = values === undefined ? mod.lines : renderNumericLines(mod.lines, values)
  if (!Array.isArray(lines) && !lines.ok) throw Error(lines.error)
  return {
    ...base,
    rarity: 'magic',
    affixes: [...base.affixes, { modId, lines: Array.isArray(lines) ? [...lines] : lines.value }],
  }
}
it('品质未知仅阻断恢复量，0品质不使用目录sourceQuality20或原文面板', () => {
  expect(estimateFlaskProperties(catalog, state())).toMatchObject({
    ok: true,
    value: {
      resource: 'life',
      quality: null,
      amountRecovered: null,
      duration: 3,
      chargesMax: 60,
      chargesUsed: 10,
      unknown: ['当前品质未知'],
    },
  })
  expect(
    estimateFlaskProperties(catalog, {
      ...state('Lesser Life Flask', 0),
      sourceText: 'Recovers 999999 Life over 999 Seconds',
    }),
  ).toMatchObject({
    ok: true,
    value: {
      amountRecovered: 50,
      duration: 3,
      instantRecovered: 0,
      gradualRecovered: 50,
      unknown: [],
    },
  })
})
it('所有18药剂从自身基底属性估算，品质与回复增加相乘', () => {
  const bases = catalog.bases.filter(
    (base) => base.type === 'Flask' && ['Life', 'Mana'].includes(base.subType ?? ''),
  )
  expect(bases).toHaveLength(18)
  for (const base of bases) {
    const result = estimateFlaskProperties(
      catalog,
      withMod(state(base.id, 20), 'FlaskIncreasedRecoveryAmount1', [45]),
    )
    if (!result.ok) throw Error(result.error)
    expect(result.value.amountRecovered).toBeCloseTo(
      (base.flask?.life ?? base.flask?.mana ?? 0) * 1.2 * 1.45,
      8,
    )
    expect(result.value.duration).toBe(base.flask?.duration)
    expect(result.value.quality).toBe(20)
  }
})
it('恢复速率仅改变一位小数持续时间，神圣前后可对比', () => {
  for (const [roll, duration] of [
    [41, 3.5],
    [45, 3.4],
  ] as const) {
    expect(
      estimateFlaskProperties(
        catalog,
        withMod(state('Grand Life Flask', 20), 'FlaskIncreasedRecoverySpeed1', [roll]),
      ),
    ).toMatchObject({
      ok: true,
      value: { amountRecovered: 312, duration, recoveryRateIncreased: roll },
    })
  }
  expect(
    estimateFlaskProperties(
      catalog,
      withMod(state('Lesser Life Flask', 20), 'FlaskIncreasedRecoverySpeed1'),
    ),
  ).toMatchObject({
    ok: true,
    value: {
      amountRecovered: 60,
      duration: null,
      recoveryRateIncreased: null,
      unknown: expect.arrayContaining([expect.stringContaining('数值')]),
    },
  })
})
it('部分与全部立即恢复独立计算，未确认掷值不拿区间端点代替', () => {
  expect(
    estimateFlaskProperties(
      catalog,
      withMod(state('Lesser Life Flask', 20), 'FlaskPartialInstantRecovery1', [20]),
    ),
  ).toMatchObject({
    ok: true,
    value: {
      amountRecovered: 60,
      instantPercent: 20,
      instantRecovered: 12,
      gradualRecovered: 48,
      duration: 3,
    },
  })
  expect(
    estimateFlaskProperties(
      catalog,
      withMod(state('Lesser Life Flask', 20), 'FlaskFullInstantRecovery1'),
    ),
  ).toMatchObject({
    ok: true,
    value: { amountRecovered: 30, instantPercent: 100, instantRecovered: 30, gradualRecovered: 0 },
  })
  expect(
    estimateFlaskProperties(
      catalog,
      withMod(state('Lesser Life Flask', 20), 'FlaskIncreasedRecoveryAmount1'),
    ),
  ).toMatchObject({
    ok: true,
    value: { amountRecovered: null, duration: 3, chargesUsed: 10 },
  })
})
it('充能每次消耗向下取整、最大量与被动充能按本件已知模板估算', () => {
  const mods = catalog.modifiers.filter((mod) => mod.flaskOnly)
  const reduced = mods.find((mod) => mod.group === 'FlaskChargesUsed')
  const maximum = mods.find((mod) => mod.group === 'FlaskIncreasedMaxCharges')
  const gained = mods.find((mod) => mod.group === 'FlaskIncreasedChargesAdded')
  if (!reduced || !maximum || !gained) throw Error('缺少充能组')
  expect(
    estimateFlaskProperties(catalog, withMod(state('Lesser Life Flask', 0), reduced.id, [17])),
  ).toMatchObject({
    ok: true,
    value: { chargesUsed: 8, chargesMax: 60 },
  })
  expect(
    estimateFlaskProperties(catalog, withMod(state('Lesser Life Flask', 0), maximum.id, [23])),
  ).toMatchObject({
    ok: true,
    value: { chargesMax: 73.8 },
  })
  expect(
    estimateFlaskProperties(catalog, withMod(state('Lesser Life Flask', 0), gained.id, [23])),
  ).toMatchObject({
    ok: true,
    value: { chargesGainedIncreased: 23, chargesPerSecond: 0 },
  })
  expect(
    estimateFlaskProperties(
      catalog,
      withMod(state('Lesser Life Flask'), 'FlaskFillChargesPerMinute1'),
    ),
  ).toMatchObject({
    ok: true,
    value: { chargesPerSecond: 0.15, amountRecovered: null },
  })
})
it('低资源条件、召唤转移及击杀充能仅保留说明，资源消耗不从本件恢复量扣除', () => {
  for (const modId of ['FlaskIncreasedRecoveryOnLowLife1', 'FlaskHealsMinions1']) {
    const result = estimateFlaskProperties(catalog, withMod(state('Lesser Life Flask', 0), modId))
    if (!result.ok) throw Error(result.error)
    expect(result.value.amountRecovered).toBe(50)
    expect(result.value.notes).toEqual(catalog.modifiers.find((mod) => mod.id === modId)?.lines)
  }
  expect(
    estimateFlaskProperties(
      catalog,
      withMod(state('Lesser Life Flask', 0), 'FlaskExtraLifeCostsMana1', [61]),
    ),
  ).toMatchObject({
    ok: true,
    value: { amountRecovered: 80.5, notes: ['Removes 15% of Life Recovered from Mana when used'] },
  })
  const kill = catalog.modifiers.find(
    (mod) => mod.flaskOnly && mod.group === 'FlaskChanceRechargeOnKill',
  )
  if (!kill) throw Error('缺少击杀充能')
  const result = estimateFlaskProperties(catalog, withMod(state('Lesser Life Flask', 0), kill.id))
  expect(result).toMatchObject({ ok: true, value: { chargesPerSecond: 0, notes: kill.lines } })
})
it('非法状态、来源漂移、未知本地模板不能生成误导面板', () => {
  for (const input of [
    state('Gold Ring', 0),
    { ...state(), rarity: 'rare' as const },
    { ...state(), corrupted: true as const },
    { ...state(), destroyed: true as const },
  ])
    expect(estimateFlaskProperties(catalog, input).ok).toBe(false)
  const input = withMod(state('Lesser Life Flask', 0), 'FlaskIncreasedRecoveryAmount1', [45])
  const changed = structuredClone(catalog)
  const mod = changed.modifiers.find((entry) => entry.id === 'FlaskIncreasedRecoveryAmount1')
  if (!mod) throw Error('缺少模板')
  mod.group = 'UnknownRecovery'
  expect(estimateFlaskProperties(changed, input).ok).toBe(false)
  expect(
    estimateFlaskProperties({ ...catalog, _meta: { ...catalog._meta, sources: [] } }, state()).ok,
  ).toBe(false)
})

it('67条独立来源词缀的两端数值均有精确模板，估算不修改状态', () => {
  const bases = catalog.bases.filter((base) =>
    ['Lesser Life Flask', 'Lesser Mana Flask'].includes(base.id),
  )
  let covered = 0
  for (const mod of catalog.modifiers.filter((entry) => entry.flaskOnly)) {
    const base = bases.find((entry) => hasCraftModEligibility(entry, mod))
    if (!base) throw Error(mod.id)
    const ranges = inspectNumericLines(mod.lines)
    if (!ranges.ok) throw Error(ranges.error)
    for (const edge of ['min', 'max'] as const) {
      const input = withMod(
        state(base.id, 0),
        mod.id,
        ranges.value.map((range) => range[edge]),
      )
      const before = structuredClone(input)
      const result = estimateFlaskProperties(catalog, input)
      expect(result.ok, mod.id).toBe(true)
      if (result.ok) {
        expect(result.value.unknown).toEqual([])
        for (const value of Object.values(result.value))
          if (typeof value === 'number') expect(Number.isFinite(value)).toBe(true)
      }
      expect(input).toEqual(before)
    }
    covered++
  }
  expect(covered).toBe(67)
})
