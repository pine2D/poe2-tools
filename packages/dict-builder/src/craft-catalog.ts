import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { type CraftCatalog, DESECRATION_SOURCE, parseCraftCatalog } from '@poe2-tools/item-core'
import { type BaseDeclaration, normalizeBaseDeclarations } from './adapters/baseVariants'
import { normalizeAugments } from './adapters/craftAugments'
import { normalizeMod } from './adapters/craftCatalog'
import { normalizeDesecratedMods } from './adapters/craftDesecrated'
import { normalizeEssences } from './adapters/craftEssences'
import { buildCraftNames } from './adapters/craftNames'
import { excludeDeclaration } from './adapters/craftSourceExclusions'
import { parsePobBaseEntries, parsePobModFile } from './adapters/restrictedLua'
import { fetchCached } from './cache'
import { CACHE_DIR, REPO_ROOT, trade2Url, USER_AGENT } from './config'
import { sha256 } from './util/json'

// 固定源提交；升级要复核字段、计数与游戏版本，不跟随 dev 漂移。
const COMMIT = 'ce566eac45ea8a86477f513c7ee65a1ebe60014e'
const BASE_FILES = [
  'amulet',
  'axe',
  'belt',
  'body',
  'boots',
  'bow',
  'claw',
  'crossbow',
  'dagger',
  'fishing',
  'flail',
  'flask',
  'focus',
  'gloves',
  'helmet',
  'incursionlimb',
  'jewel',
  'mace',
  'quiver',
  'ring',
  'sceptre',
  'shield',
  'spear',
  'staff',
  'sword',
  'talisman',
  'traptool',
  'wand',
]
const options = {
  cacheDir: CACHE_DIR,
  today: new Date().toISOString().slice(0, 10),
  offline: process.argv.includes('--offline'),
  ua: USER_AGENT,
  ext: 'lua',
  minIntervalMs: 200,
}
const sources: CraftCatalog['_meta']['sources'] = []
const fetchedTimes: string[] = []

async function source(path: string, expectedHash?: string): Promise<string> {
  const url = `https://raw.githubusercontent.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/${COMMIT}/src/Data/${path}.lua`
  const fetched = await fetchCached(
    `craft-${COMMIT.slice(0, 12)}-${path.replaceAll('/', '-')}`,
    url,
    options,
  )
  if (
    expectedHash !== undefined &&
    (sha256(fetched.body) !== expectedHash || fetched.meta.sha256 !== expectedHash)
  )
    throw new Error(`固定制作来源内容哈希不匹配：${path}`)
  sources.push({ path: `src/Data/${path}.lua`, url, sha256: fetched.meta.sha256 })
  fetchedTimes.push(fetched.meta.fetchedAt)
  return fetched.body
}

const rawMods = parsePobModFile(await source('ModItem'))
const modifiers = Object.entries(rawMods).map(([id, raw]) => {
  if (raw === null || typeof raw !== 'object') throw new Error(`词缀 ${id} 不是表`)
  return normalizeMod(id, raw)
})
const augments = normalizeAugments(
  parsePobModFile(
    await source('ModRunes', 'd3dac48143209d7d9a02a8c03bd86f21604a0961a8ced49290d6a1d243f8223a'),
  ),
)
const essences = normalizeEssences(
  parsePobModFile(
    await source('Essence', '950219488fed20cc3ca1bad17953f577c4361c6b65e371ce9ae3f9cbbae95f74'),
  ),
)
const desecrated = normalizeDesecratedMods(
  parsePobModFile(await source('ModVeiled', DESECRATION_SOURCE.sha256)),
)
modifiers.push(...desecrated.modifiers)
if (new Set(modifiers.map((entry) => entry.id)).size !== modifiers.length)
  throw new Error('普通与亵渎目录词缀 ID 重复')
const modifierIds = new Set(modifiers.map((entry) => entry.id))
const essenceMappings = essences.flatMap((entry) => Object.values(entry.mods))
console.log(
  `精华目录：${essences.length} 个材料，${essenceMappings.length} 个类别映射，${essenceMappings.filter((id) => modifierIds.has(id)).length} 个已解析映射；未解析 ID：${[...new Set(essenceMappings.filter((id) => !modifierIds.has(id)))].sort().join(', ')}；空映射材料：${essences
    .filter((entry) => Object.keys(entry.mods).length === 0)
    .map((entry) => entry.id)
    .join(', ')}`,
)
const declarations: BaseDeclaration[] = []
const baseSources: { file: string; body: string }[] = []
for (const file of BASE_FILES) {
  baseSources.push({ file, body: await source(`Bases/${file}`) })
}
const excludedBases: CraftCatalog['_meta']['excludedBases'] = []
for (const { file, body } of baseSources) {
  let checkedBody = body
  if (file === 'crossbow') {
    const id = 'Runeforged Sturdy Crossbow'
    checkedBody = excludeDeclaration(
      body,
      id,
      'c4de7bc1ecaa969ebc5bdd84d31bf650bca8d7fa86a2ebc958ad422bca9c4bd1',
    )
    excludedBases.push({ id, reason: '固定源声明重复了两个不同 LightningMax，等待上游修正' })
  }
  const parsed = parsePobBaseEntries(checkedBody)
  declarations.push(
    ...parsed.map((entry, index) => ({
      ...entry,
      sourcePath: `src/Data/Bases/${file}.lua`,
      index,
    })),
  )
  console.log(`${file}：${parsed.length} 个基底声明`)
}
const bases = normalizeBaseDeclarations(declarations)
const nameSources: NonNullable<CraftCatalog['_meta']['nameSources']> = []
const staticTables = {} as Record<'en' | 'zh-CN' | 'zh-TW', unknown>
for (const locale of ['en', 'zh-CN', 'zh-TW'] as const) {
  const url = trade2Url(locale, 'static')
  const fetched = await fetchCached(`trade2-${locale}-static`, url, {
    ...options,
    ext: 'json',
    minIntervalMs: 1500,
  })
  if (sha256(fetched.body) !== fetched.meta.sha256 || fetched.meta.url !== url)
    throw new Error(`制作名称来源内容或元数据不匹配：${locale}`)
  staticTables[locale] = JSON.parse(fetched.body)
  nameSources.push({
    locale,
    url,
    sha256: fetched.meta.sha256,
    fetchedAt: fetched.meta.fetchedAt,
    gameVersion: null,
  })
  fetchedTimes.push(fetched.meta.fetchedAt)
}
const { localizedNames, audit: nameAudit } = buildCraftNames(staticTables)
for (const locale of ['zh-CN', 'zh-TW'] as const)
  console.log(`${locale} 官方名称：${JSON.stringify(nameAudit[locale])}`)
const catalog: CraftCatalog = {
  _meta: {
    schemaVersion: 2,
    tier: 'primary',
    sourceCommit: COMMIT,
    gameVersion: null,
    generatedAt: fetchedTimes.sort().at(-1) ?? '',
    weightStatus: 'unknown',
    sources,
    nameSources,
    excludedBases,
    excludedDesecratedMods: desecrated.excluded,
  },
  bases,
  modifiers,
  augments,
  essences,
  localizedNames,
}
parseCraftCatalog(catalog)
const output = resolve(REPO_ROOT, 'data/craft')
await mkdir(output, { recursive: true })
await writeFile(resolve(output, 'catalog.json'), `${JSON.stringify(catalog)}\n`)
console.log(
  `制作目录：${bases.length} 个基底，${modifiers.length} 条词缀，${augments.length} 个镶嵌类别效果（${new Set(augments.map((entry) => entry.name)).size} 个名称）；概率权重未知`,
)
