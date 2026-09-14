import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  CORRUPTION_SOURCE,
  corruptionSourceHash,
  DESECRATION_SOURCE,
  inspectModPool,
  JEWEL_SOURCE,
  jewelSourceHash,
  LIQUID_EMOTION_SOURCE,
  liquidEmotionSourceHash,
  parseAlloyCatalog,
  parseCraftCatalog,
  STAT_SCALABILITY_SOURCE,
  statScalabilitySourceHash,
} from '@poe2-tools/item-core'
import { REPO_ROOT } from './config'

const catalog = parseCraftCatalog(
  JSON.parse(await readFile(resolve(REPO_ROOT, 'data/craft/catalog.json'), 'utf8')),
)
// 可整体移除的关系表不属于 primary 目录；存在时必须完整通过审计。
let alloyText: string | undefined
try {
  alloyText = await readFile(resolve(REPO_ROOT, 'data/craft/alloys.json'), 'utf8')
} catch (error) {
  if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error
}
if (alloyText !== undefined) {
  const table = parseAlloyCatalog(JSON.parse(alloyText), catalog)
  const mappings = table.alloys.flatMap((entry) => entry.mappings)
  const unresolved = table.alloys.flatMap((entry) =>
    entry.mappings
      .filter((mapping) => mapping.modId === null)
      .map((mapping) => [entry.name, mapping.category]),
  )
  if (
    table.alloys.length !== 13 ||
    mappings.length !== 132 ||
    JSON.stringify(unresolved) !== JSON.stringify([['Adaptive Alloy', 'Sceptre']])
  )
    throw new Error('合金关系审计不匹配：应有 13 材料、132 对应及适性权杖一项缺失')
  for (const locale of ['zh-CN', 'zh-TW'] as const)
    if (table.alloys.some((entry) => !catalog.localizedNames?.[locale]?.[entry.name]))
      throw new Error(`${locale} 合金名称缺失`)
  console.log(
    '合金关系目录校验通过：gray 独立表；13 材料、132 对应、131 已解析、1 项缺失；不授权制作',
  )
} else console.log('合金关系目录未提供；继续校验 primary 制作目录')
if (
  statScalabilitySourceHash(catalog) !== STAT_SCALABILITY_SOURCE.sha256 ||
  Object.keys(catalog.scalability ?? {}).length !== 2952
)
  throw new Error('缩放目录缺少固定来源或 2952 条当前属性文本对应')
console.log('属性缩放目录校验通过：2952 条文本；253 条未对应保留缺失，不推断内部精度')
if (
  corruptionSourceHash(catalog) !== CORRUPTION_SOURCE.sha256 ||
  catalog.corruptions?.length !== 127 ||
  catalog.corruptions.filter((mod) => mod.kind === 'corrupted').length !== 119 ||
  catalog.corruptions.filter((mod) => mod.kind === 'special-corrupted').length !== 8
)
  throw new Error('腐化目录缺少固定来源或 119 普通／8 特殊属性声明')
console.log('腐化目录校验通过：119 普通／8 特殊；资格不等于真实权重')
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
  catalog.modifiers.filter((mod) => mod.jewelOnly && !mod.craftedOnly && !mod.radiusJewelOnly)
    .length !== 160 ||
  catalog.modifiers.filter((mod) => mod.radiusJewelOnly).length !== 160 ||
  catalog.modifiers.filter((mod) => mod.jewelOnly && mod.craftedOnly).length !== 8 ||
  catalog._meta.excludedJewelMods?.length !== 49
)
  throw new Error('珠宝目录固定来源或 160 普通 / 160 范围 / 8 工艺专属 / 49 排除计数不匹配')
console.log('珠宝目录校验通过：160 普通 / 160 范围 / 8 工艺专属 / 49 排除')
for (const base of catalog.bases) {
  if (
    inspectModPool(base, catalog.modifiers, 100).some(
      ({ mod }) => mod.desecratedOnly || mod.craftedOnly,
    )
  )
    throw new Error('亵渎或工艺专属词缀泄漏到普通生成池')
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
const emotions = catalog.liquidEmotions ?? []
const emotionMappings = (radius: boolean) =>
  emotions
    .filter((entry) => entry.radiusJewel === radius)
    .flatMap((entry) => Object.values(entry.mods).flatMap((effect) => Object.values(effect)))
const basicEmotionMappings = emotionMappings(false)
const radiusEmotionMappings = emotionMappings(true)
const allEmotionMappings = [...basicEmotionMappings, ...radiusEmotionMappings]
const excludedJewelIds = new Set(catalog._meta.excludedJewelMods?.map((entry) => entry.id))
if (
  liquidEmotionSourceHash(catalog) !== LIQUID_EMOTION_SOURCE.sha256 ||
  emotions.length !== 26 ||
  emotions.filter((entry) => !entry.radiusJewel).length !== 13 ||
  emotions.filter((entry) => entry.radiusJewel).length !== 13 ||
  basicEmotionMappings.length !== 50 ||
  radiusEmotionMappings.length !== 46 ||
  new Set(allEmotionMappings).size !== 73 ||
  basicEmotionMappings.filter((id) => modifierIds.has(id)).length !== 50 ||
  radiusEmotionMappings.filter((id) => modifierIds.has(id)).length !== 35 ||
  radiusEmotionMappings.filter((id) => excludedJewelIds.has(id)).length !== 11 ||
  radiusEmotionMappings.some(
    (id) =>
      modifierIds.has(id) &&
      !catalog.modifiers.some((mod) => mod.id === id && mod.radiusJewelOnly) &&
      !['CraftedJewelAdditionalPrefixAllowed', 'CraftedJewelAdditionalSuffixAllowed'].includes(id),
  ) ||
  allEmotionMappings.some((id) => !modifierIds.has(id) && !excludedJewelIds.has(id)) ||
  emotions
    .flatMap((entry) => Object.values(entry.mods))
    .filter((effect) => Object.keys(effect).length === 0).length !== 20
)
  throw new Error('液态情感固定来源、26 材料、96 映射、73 种词缀身份或 20 个空类别不匹配')
for (const emotion of emotions) {
  for (const effects of Object.values(emotion.mods)) {
    for (const [kind, id] of Object.entries(effects)) {
      const mod = catalog.modifiers.find((entry) => entry.id === id)
      if (
        mod &&
        (!mod.jewelOnly ||
          mod.kind !== kind ||
          (emotion.radiusJewel ? !mod.craftedOnly && !mod.radiusJewelOnly : mod.radiusJewelOnly))
      )
        throw new Error(`液态情感引用已解析词缀的来源或前后缀不匹配：${id}`)
    }
  }
}
console.log(
  '液态情感声明校验通过：13 普通 / 13 范围材料；普通 50 个映射全部已解析，范围 27 个可生成属性 / 8 个共享工艺声明 / 11 个排除映射（46 个范围映射均未开放执行），20 个空类别；执行范围见制作规则',
)
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
  if (emotions.some((entry) => !names[entry.name]?.trim()))
    throw new Error(`${locale} 液态情感材料中文名称未全覆盖`)
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
