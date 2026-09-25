import { expect, it } from 'vitest'
import { materialDescription } from '../src/adapters/coe-beta/material-descriptions'

const active = 'While this item is active in your inventory '
it('非下一次句式保留激活前提、低血触发及经验损失比例', () => {
  expect(
    materialDescription(
      `${active}will fully recover your flask and charm charges when you reach Low Life`,
    ),
  ).toContain('进入低血状态时会完全恢复药剂和咒符充能')
  expect(
    materialDescription(`${active}will prevent 75% of Experience loss when you die`),
  ).toContain('死亡时会免除75%的经验损失')
  expect(
    materialDescription(`${active}will prevent 100% of Experience loss when you die`),
  ).toBeNull()
})
it('概率与不消耗限制同时保留，不把机会石免销毁说成必定传奇', () => {
  const gamble = materialDescription(
    active +
      'your next Gamble purchase will have a 50% chance of costing no Gold and not consuming this Omen',
  )
  expect(gamble).toContain('50%')
  expect(gamble).toContain('不花费金币且不消耗此预兆')
  const chance = materialDescription(`${active}your next Orb of Chance will not destroy the Item`)
  expect(chance).toContain('不会摧毁该物品')
  expect(chance).not.toContain('传奇')
})
it('材料限制及引路石排除属性保留，语义改变的未知句不套用旧译文', () => {
  expect(
    materialDescription(
      `${active}your next Perfect or Corrupted Essence will remove only Suffix modifiers`,
    ),
  ).toContain('完美或腐化精华将仅移除后缀词缀')
  expect(
    materialDescription(
      active +
        'your next Chaos Orb will replace all Modifiers on a Waystone with Modifiers that do not grant Pack Size',
    ),
  ).toContain('不提供怪物群规模')
  expect(
    materialDescription(
      active +
        'your next Chaos Orb will replace all Modifiers on a Waystone with Modifiers that grant Pack Size',
    ),
  ).toBeNull()
  expect(materialDescription('your next Orb of Chance will not destroy the Item')).toBeNull()
})
it('揭示后的一次重选与额外神龛效果不扩大次数，空白不影响完整匹配', () => {
  expect(
    materialDescription(
      `${active}the next time you reveal Desecrated modifiers you can reroll the options once`,
    ),
  ).toContain('可以重选一次候选词缀')
  expect(
    materialDescription(
      `${active}the next time you reveal Desecrated modifiers you can reroll the options twice`,
    ),
  ).toBeNull()
  expect(
    materialDescription(`${active}the next Shrine you click on\nwill grant an additional Effect`),
  ).toContain('额外提供一种效果')
})

it('渎灵机制使用国服专名并保留武器或首饰资格和随机限定', () => {
  const result = materialDescription(
    `${active}your next Weapon or Jewellery Desecration attempt will guarantee a random Amanamu modifier`,
  )
  expect(result).toContain('武器或首饰')
  expect(result).toContain('渎灵')
  expect(result).toContain('随机阿曼娜姆词缀')
  expect(
    materialDescription(
      `${active}your next Weapon or Jewellery Desecration attempt will guarantee a random Unknown modifier`,
    ),
  ).toBeNull()
  expect(
    materialDescription(`${active}your next Desecration attempt will add only prefix modifiers`),
  ).toContain('渎灵')
})
it('附身怪物与盗贼流放者说明不丢失所有与下次遭遇的限制', () => {
  expect(
    materialDescription(
      `${active}the next Possessed monster you kill will Release and manifest all Azmeri Spirits`,
    ),
  ).toContain('所有阿兹莫里之灵')
  expect(
    materialDescription(`${active}the next Rogue Exile you encounter will summon an ally`),
  ).toContain('下一次遭遇的盗贼流放者将召唤一名盟友')
})
