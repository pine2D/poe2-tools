import { boneCatalog, boneState } from './boneTestFixture'
export const essenceId = 'Metadata/Items/Currency/CurrencyLesserEssenceLife'
export const perfectEssenceId = 'Metadata/Items/Currency/CurrencyPerfectEssenceLife'
export const essenceHash = 'b'.repeat(64)
export function specialCatalog() {
  const source = boneCatalog()
  source._meta.sources.push({
    path: 'src/Data/Essence.lua',
    url: 'https://example.test/Essence.lua',
    sha256: essenceHash,
  })
  source.essences = [
    {
      id: essenceId,
      name: 'Lesser Essence of Life',
      type: 'Life',
      tierLevel: 1,
      mods: { Helmet: 'prefix4' },
    },
    {
      id: perfectEssenceId,
      name: 'Perfect Essence of Life',
      type: 'Life',
      tierLevel: 4,
      mods: { Helmet: 'prefix4' },
    },
  ]
  return source
}
export { boneState }
