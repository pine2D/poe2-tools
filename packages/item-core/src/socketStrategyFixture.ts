import { boneCatalog, boneState } from './boneTestFixture'
import type { CraftState } from './rehearsal'
export const socketHash = 'd'.repeat(64)
export function socketStrategyCatalog() {
  const catalog = boneCatalog('Body Armour')
  catalog._meta.sources.push({
    path: 'src/Data/ModRunes.lua',
    url: 'https://example.test/runes',
    sha256: socketHash,
  })
  catalog.augments = [
    {
      id: 'fire',
      name: 'Desert Rune',
      category: 'armour',
      type: 'Rune',
      localMod: false,
      lines: ['+12% to Fire Resistance'],
      statOrder: [1014],
      tradeHashes: {},
      levelReq: 1,
    },
    {
      id: 'cold',
      name: 'Glacial Rune',
      category: 'armour',
      type: 'Rune',
      localMod: false,
      lines: ['+12% to Cold Resistance'],
      statOrder: [1015],
      tradeHashes: {},
      levelReq: 1,
    },
  ]
  return catalog
}
export function socketStrategyState(): CraftState {
  return { ...boneState(), rarity: 'normal' as const }
}
