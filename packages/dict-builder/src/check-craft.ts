import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  DESECRATION_SOURCE,
  inspectModPool,
  JEWEL_SOURCE,
  jewelSourceHash,
  parseCraftCatalog,
  STAT_SCALABILITY_SOURCE,
  statScalabilitySourceHash,
} from '@poe2-tools/item-core'
import { REPO_ROOT } from './config'

const catalog = parseCraftCatalog(
  JSON.parse(await readFile(resolve(REPO_ROOT, 'data/craft/catalog.json'), 'utf8')),
)
if (
  statScalabilitySourceHash(catalog) !== STAT_SCALABILITY_SOURCE.sha256 ||
  Object.keys(catalog.scalability ?? {}).length !== 2843
)
  throw new Error('缩放目录缺少固定来源或 2843 条当前属性文本对应')
console.log('属性缩放目录校验通过：2843 条文本；103 条未对应保留缺失，不推断内部精度')
if (
  catalog.bases.length === 0 ||
  catalog.modifiers.length === 0 ||
  catalog._meta.sources.length === 0
)
  throw new Error('制作目录不应为空')
for (const source of catalog._meta.sources) {
  if (
    !/^[a-f0-9]{64}$/.test(source.sha256) ||
    !source.url.includes(`/${catalog._meta.sourceCommit}/`)
  )
    throw new Error(`制作来源缺少固定版本或内容哈希：${source.path}`)
}
const desecratedSource = catalog._meta.sources.filter(
  (source) => source.path === DESECRATION_SOURCE.path,
)
if (
  catalog.modifiers.filter((mod) => !mod.desecratedOnly && !mod.jewelOnly).length !== 2550 ||
  catalog.modifiers.filter((mod) => mod.desecratedOnly).length !== 199 ||
  catalog._meta.excludedDesecratedMods?.length !== 189 ||
  desecratedSource.length !== 1 ||
  desecratedSource[0]?.sha256 !== DESECRATION_SOURCE.sha256
)
  throw new Error('亵渎目录固定来源或 2550 普通 / 199 专属 / 189 排除计数不匹配')
if (
  jewelSourceHash(catalog) !== JEWEL_SOURCE.sha256 ||
  catalog.modifiers.filter((mod) => mod.jewelOnly).length !== 160 ||
  catalog._meta.excludedJewelMods?.length !== 217
)
  throw new Error('珠宝目录固定来源或 160 普通 / 217 排除计数不匹配')
for (const base of catalog.bases) {
  if (inspectModPool(base, catalog.modifiers, 100).some(({ mod }) => mod.desecratedOnly))
    throw new Error('亵渎专属词缀泄漏到普通生成池')
}
const augmentSources = catalog._meta.sources.filter(
  (source) => source.path === 'src/Data/ModRunes.lua',
)
if (
  catalog.augments?.length !== 627 ||
  new Set(catalog.augments.map((entry) => entry.name)).size !== 305 ||
  augmentSources.length !== 1 ||
  augmentSources[0]?.sha256 !== 'd3dac48143209d7d9a02a8c03bd86f21604a0961a8ced49290d6a1d243f8223a'
)
  throw new Error('镶嵌目录缺少固定 ModRunes 来源或完整的 305 个名称、627 个类别效果')
const essenceSources = catalog._meta.sources.filter(
  (source) => source.path === 'src/Data/Essence.lua',
)
const essenceMappings = (catalog.essences ?? []).flatMap((entry) => Object.values(entry.mods))
const modifierIds = new Set(catalog.modifiers.map((entry) => entry.id))
const unresolved = [...new Set(essenceMappings.filter((id) => !modifierIds.has(id)))].sort()
const expectedUnresolved = [
  'EssenceDisplayAttributes1',
  'EssenceDisplayAttributes2',
  'EssenceDisplayAttributes3',
  'EssenceDisplayAttributes5',
  'EssenceDisplayDefences1',
  'EssenceDisplayDefences2',
  'EssenceDisplayDefences3',
  'EssenceGrantedPassive',
]
const emptyEssences = (catalog.essences ?? [])
  .filter((entry) => Object.keys(entry.mods).length === 0)
  .map((entry) => entry.id)
if (
  catalog.essences?.length !== 82 ||
  essenceMappings.length !== 698 ||
  essenceMappings.filter((id) => modifierIds.has(id)).length !== 594 ||
  essenceSources.length !== 1 ||
  essenceSources[0]?.sha256 !==
    '950219488fed20cc3ca1bad17953f577c4361c6b65e371ce9ae3f9cbbae95f74' ||
  JSON.stringify(unresolved) !== JSON.stringify(expectedUnresolved) ||
  JSON.stringify(emptyEssences) !==
    JSON.stringify(['Metadata/Items/Currency/CurrencyCorruptedEssenceAbyss'])
)
  throw new Error('精华目录固定来源、82 材料、698 映射、594 已解析映射或未解析/空映射集合不匹配')
for (const locale of ['zh-CN', 'zh-TW'] as const) {
  const names = catalog.localizedNames?.[locale]
  if (!names || Object.keys(names).length < 771)
    throw new Error(`${locale} 官方制作名称覆盖低于已核对基线 771`)
  const requiredNames = [
    "Artificer's Orb",
    ...['Desert Rune', 'Glacial Rune', 'Storm Rune'].flatMap((name) =>
      ['Lesser ', '', 'Greater ', 'Perfect '].map((prefix) => `${prefix}${name}`),
    ),
  ]
  if (requiredNames.some((name) => !Object.hasOwn(names, name)))
    throw new Error(`${locale} 缺少巧匠石或三系四档符文名称`)
  if (catalog.essences.some((entry) => !names[entry.name]?.trim()))
    throw new Error(`${locale} 精华材料中文名称未全覆盖`)
  console.log(
    `${locale} 官方制作名称：${Object.keys(names).length} 条；三服静态来源及 SHA-256 格式已校验`,
  )
}
console.log(
  `精华目录校验通过：82 个材料，两服名称全覆盖，698 个类别映射；594 个已解析，104 个未解析映射（8 种 ID）；1 个源空映射原样保留`,
)
console.log(
  `制作目录校验通过：${catalog.bases.length} 个基底，${catalog.modifiers.length} 条词缀，${catalog.augments.length} 个镶嵌类别效果；${catalog._meta.excludedBases.length} 个歧义/异常基底已隔离；权重未知`,
)
