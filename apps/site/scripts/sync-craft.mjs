// 工坊虽暂停开发，旧地址仍需完整的制作数据。
import { copyFile, mkdir, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const skipGray = process.env.DICT_ENABLE_POE2DB === '0'
// 制作目录与许可通知随站发布，运行时不访问第三方数据源。
const craftSource = resolve(appDir, '..', '..', 'data', 'craft')
const craftTarget = resolve(appDir, 'public', 'craft-data')
await mkdir(craftTarget, { recursive: true })
for (const file of ['catalog.json', 'NOTICE.md']) {
  await copyFile(join(craftSource, file), join(craftTarget, file))
}
// 独立灰区关系表关闭或源文件删除后不能遗留旧发布产物。
for (const file of ['alloys.json', 'fluxes.json', 'runeforging.json']) {
  const optionalTarget = join(craftTarget, file)
  await rm(optionalTarget, { force: true })
  if (!skipGray) {
    try {
      await copyFile(join(craftSource, file), optionalTarget)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
  }
}
