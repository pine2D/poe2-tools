import type { CatalogLiquidEmotion } from '@poe2-tools/item-core'
import { expect, it } from 'vitest'
import { auditLiquidEmotionMappings } from './craftLiquidEmotionAudit'

const emotion = (radiusJewel = false): CatalogLiquidEmotion => ({
  id: 'Metadata/Items/Currency/DistilledEmotion1',
  name: 'Synthetic emotion',
  radiusJewel,
  tierLevel: 77,
  mods: { Ruby: { prefix: 'armour' }, Sapphire: {}, Emerald: {}, Diamond: {} },
})

it('审计材料引用的原始前后缀身份，保留普通与范围计数，不以 tierLevel 限制词缀等级', () => {
  expect(auditLiquidEmotionMappings([emotion()], { armour: { type: 'Prefix', level: 1 } })).toEqual(
    { basic: 1, radius: 0, mappings: 1, basicMappings: 1, radiusMappings: 0, modIds: ['armour'] },
  )
  expect(
    auditLiquidEmotionMappings([emotion(true)], { armour: { type: 'Prefix', nodeType: 1 } }),
  ).toMatchObject({ basic: 0, radius: 1, radiusMappings: 1 })
})

it('拒绝丢失引用、错误前后缀与普通材料引用范围节点属性', () => {
  for (const mods of [
    {},
    { armour: { type: 'Suffix' } },
    { armour: { type: 'Prefix', nodeType: 1 } },
  ])
    expect(() => auditLiquidEmotionMappings([emotion()], mods)).toThrow(/液态情感.*引用/)
})

it('范围材料可引用没有节点修饰的特殊属性，重复映射仍只统计一个词缀身份', () => {
  const basic = emotion()
  basic.mods.Sapphire.prefix = 'armour'
  const radius = emotion(true)
  radius.id = 'Metadata/Items/Currency/DistilledEmotionTimeLost1'
  expect(auditLiquidEmotionMappings([basic, radius], { armour: { type: 'Prefix' } })).toEqual({
    basic: 1,
    radius: 1,
    mappings: 3,
    basicMappings: 2,
    radiusMappings: 1,
    modIds: ['armour'],
  })
})
