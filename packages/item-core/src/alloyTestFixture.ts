import type { AlloyCatalog } from './alloys'

/** 自造的最小关系样本；测试不依赖可整体移除的灰区发布文件。 */
export function alloyTestFixture(): AlloyCatalog {
  const commit = 'ce566eac45ea8a86477f513c7ee65a1ebe60014e'
  const material = (index: number, name: string, mods: Record<string, string | null>) => ({
    id: `Metadata/Items/Currency/CurrencyVerisiumAlloy${index}`,
    name,
    source: `https://poe2db.tw/us/${name.replaceAll("'", '').replaceAll(' ', '_')}`,
    mappings: Object.entries(mods).map(([category, modId]) => ({ category, modId })),
  })
  return {
    _meta: {
      schemaVersion: 1,
      tier: 'gray',
      reviewedAt: '2026-09-14',
      sourceCommit: commit,
      modifierSource: {
        path: 'src/Data/ModItem.lua',
        url: `https://raw.githubusercontent.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/${commit}/src/Data/ModItem.lua`,
        sha256: '774257f577f8cee8ac59d7848df4bc7a109d266a615eb97c2a2c08ecb6b47cf4',
      },
    },
    alloys: [
      material(1, 'Runic Alloy', { Ring: 'AlloyMaximumRunicWard1' }),
      material(5, 'Swift Alloy', {
        Ring: 'AlloyAttackSpeedRing1',
        Shield: 'AlloyTotemPlacementSpeed1',
        Buckler: 'AlloyTotemPlacementSpeed1',
      }),
      material(9, 'Sovereign Alloy', {
        Ring: 'AlloyEffectOfResistanceMods1',
        Wand: 'AlloyEffectOfSocketedAugments1',
        'One Hand Mace': 'AlloyEffectOfSocketedAugments1',
      }),
      material(11, 'Transcendent Alloy', {
        Staff: 'AlloyCastSpeedDamageAsExtraColdHybrid1',
        Wand: 'AlloyCastSpeedDamageAsExtraColdHybridOneHand1',
      }),
      material(13, "The Runefather's Alloy", { Warstaff: 'AlloyBellLimit1' }),
      material(2, 'Adaptive Alloy', { Sceptre: null }),
      material(12, "The Runebinder's Alloy", { Sceptre: 'AlloyPuppeteerStacks1' }),
    ],
  }
}
