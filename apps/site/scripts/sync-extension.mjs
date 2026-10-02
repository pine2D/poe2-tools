// 把扩展发布包复制到 public/downloads/（扩展发布 spec §6）：只复制 release.json 记录的那一个 zip，并核对字节数与 SHA-256。
// public/downloads/ 不入库，每次 dev / build 前重建。build 时缺包或不一致即以 1 退出；
// dev 用 --allow-missing，只警告（开发服务器的下载链接会 404）。
import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const extensionDir = resolve(appDir, '..', 'poe2-extension')

export async function syncExtension({ releasePath, artifactsDir, targetDir }) {
  await rm(targetDir, { recursive: true, force: true })
  const release = JSON.parse(await readFile(releasePath, 'utf8'))
  let zip
  try {
    zip = await readFile(join(artifactsDir, release.file))
  } catch (error) {
    if (error?.code === 'ENOENT')
      throw new Error(`缺少扩展发布包 ${release.file}：先运行 pnpm extension:package`)
    throw error
  }
  const sha256 = createHash('sha256').update(zip).digest('hex')
  if (zip.length !== release.bytes || sha256 !== release.sha256)
    throw new Error(
      `扩展发布包 ${release.file} 与 release.json 不一致（${zip.length} 字节，SHA-256 ${sha256}）：运行 pnpm extension:release-check 查看原因`,
    )
  await mkdir(targetDir, { recursive: true })
  await writeFile(join(targetDir, release.file), zip)
  return release
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const release = await syncExtension({
      releasePath: join(extensionDir, 'release.json'),
      artifactsDir: join(extensionDir, 'artifacts'),
      targetDir: join(appDir, 'public', 'downloads'),
    })
    console.log(`扩展发布包已同步：downloads/${release.file}（${release.bytes} 字节）`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!process.argv.includes('--allow-missing')) {
      console.error(`同步扩展发布包失败：${message}`)
      process.exit(1)
    }
    console.warn(`未同步扩展发布包，开发服务器的下载链接会 404：${message}`)
  }
}
