// 发布字体许可文件与 NOTICE（spec §7.2）：packages/ui-theme/fonts/LICENSES/*.txt → public/fonts/，
// 根目录 NOTICE → public/NOTICE.txt。两处都不入库，每次 dev / build 前重建；任一源文件缺失即以 1 退出。
import { copyFile, mkdir, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LICENSE_FILES } from '@poe2-tools/ui-theme/compliance'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = resolve(appDir, '..', '..')
const licenses = resolve(repoRoot, 'packages/ui-theme/fonts/LICENSES')
const target = resolve(appDir, 'public/fonts')

try {
  await rm(target, { recursive: true, force: true })
  await mkdir(target, { recursive: true })
  for (const name of LICENSE_FILES) await copyFile(join(licenses, name), join(target, name))
  await copyFile(resolve(repoRoot, 'NOTICE'), resolve(appDir, 'public/NOTICE.txt'))
  console.log(`已同步 ${LICENSE_FILES.length} 份字体许可与 NOTICE.txt`)
} catch (error) {
  console.error(`同步字体许可失败：${error instanceof Error ? error.message : error}`)
  process.exit(1)
}
