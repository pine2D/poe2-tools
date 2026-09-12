import type { CatalogMod } from './catalog'

// 人工兼容规则：只覆盖已有指南与实测支持的技能等级 family，待真机验收。
const spellGroups = new Set([
  'GlobalIncreaseSpellSkillGemLevel',
  'GlobalIncreaseSpellSkillGemLevelWeapon',
  ...['Fire', 'Cold', 'Lightning', 'Chaos', 'Physical'].map(
    (element) => `GlobalIncrease${element}SpellSkillGemLevelWeapon`,
  ),
])
const attackGroups = new Set(
  ['Melee', 'Projectile'].flatMap((kind) =>
    ['', 'Weapon'].map((suffix) => `GlobalIncrease${kind}SkillGemLevel${suffix}`),
  ),
)

const skillConflicts: readonly [string, ReadonlySet<string>][] = [
  ['EssenceSpellSkillLevel', spellGroups],
  ['EssenceAttackSkillLevel', attackGroups],
]

export function craftModsConflict(left: CatalogMod, right: CatalogMod): boolean {
  if (left.group === right.group) return true
  return skillConflicts.some(
    ([essence, ordinary]) =>
      (left.group === essence && ordinary.has(right.group)) ||
      (right.group === essence && ordinary.has(left.group)),
  )
}
