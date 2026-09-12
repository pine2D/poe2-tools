// 把入库词典复制到 public/dict/，随静态站一起发布（public/dict 不入库，每次 dev / build 前重建）
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = resolve(appDir, '..', '..', 'data', 'dict')
const target = resolve(appDir, 'public', 'dict')
const LOCALES = ['zh-CN', 'zh-TW']
const FILES = [
  'stats.json',
  'items.json',
  'gems.json',
  'passives.json',
  'ascendancies.json',
  'classes.json',
  'inventories.json',
]
// 与 dict-builder 同名的灰区总开关：DICT_ENABLE_POE2DB=0 时三张灰区表不随站发布，站点自动降级
const GRAY = new Set(['items.json', 'gems.json', 'passives.json'])
const skipGray = process.env.DICT_ENABLE_POE2DB === '0'

await rm(target, { recursive: true, force: true })
let copied = 0
for (const locale of LOCALES) {
  const present = new Set(await readdir(join(source, locale)))
  await mkdir(join(target, locale), { recursive: true })
  for (const file of FILES) {
    if (!present.has(file)) continue
    if (skipGray && GRAY.has(file)) {
      console.log(`已跳过灰区表：${locale}/${file}`)
      continue
    }
    await copyFile(join(source, locale, file), join(target, locale, file))
    copied += 1
  }
  // 入库 meta.json 含来源清单、审计与覆盖率（约 24 KB），站点只需要版本信息：只发布精简版
  const meta = JSON.parse(await readFile(join(source, locale, 'meta.json'), 'utf8'))
  await writeFile(
    join(target, locale, 'meta.json'),
    JSON.stringify({
      locale: meta.locale,
      gameVersion: meta.gameVersion,
      leagueName: meta.leagueName,
    }),
  )
}
console.log(`词典已同步：${copied} 个文件 + ${LOCALES.length} 份精简 meta → ${target}`)

// 制作目录与许可通知随站发布，运行时不访问第三方数据源。
const craftSource = resolve(appDir, '..', '..', 'data', 'craft')
const craftTarget = resolve(appDir, 'public', 'craft-data')
await mkdir(craftTarget, { recursive: true })
for (const file of ['catalog.json', 'NOTICE.md']) {
  await copyFile(join(craftSource, file), join(craftTarget, file))
}
