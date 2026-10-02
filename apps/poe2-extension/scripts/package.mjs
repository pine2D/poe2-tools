import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ASSET_EXTENSIONS,
  assertAssets,
  loadWhitelist,
  sha256,
} from '@poe2-tools/ui-theme/compliance'
import { check } from './check.mjs'
import { readStoredZip, zipDirectory } from './zip.mjs'

/** 打包后复核（spec §7.6、B.12 修订 6）：读回 zip，条目集合必须与通过 check() 的 dist 文件集合相同；
 *  图像与字体条目按 dist 模式过素材白名单 */
export async function verifyZip(zip, files, whitelist) {
  const entries = readStoredZip(zip)
  const names = entries.map((entry) => entry.name).sort()
  const expected = [...files].sort()
  if (JSON.stringify(names) !== JSON.stringify(expected))
    throw new Error(`ZIP 条目与 dist 不一致：ZIP ${names.length} 个，dist ${expected.length} 个`)
  const assets = entries
    .filter((entry) =>
      ASSET_EXTENSIONS.includes(entry.name.slice(entry.name.lastIndexOf('.') + 1).toLowerCase()),
    )
    .map((entry) => ({ path: entry.name, sha256: sha256(entry.data) }))
  assertAssets(assets, whitelist ?? (await loadWhitelist()), 'dist')
}

// 打包已通过检查的 dist/：同一份 dist 永远得到同一个 SHA-256（见 zip.mjs）
export async function packageExtension(root) {
  const { dist, version, files } = await check(root)
  const zip = await zipDirectory(dist)
  const output = path.join(root, 'artifacts', `poe2-extension-${version}.zip`)
  await mkdir(path.dirname(output), { recursive: true })
  await rm(output, { force: true })
  await writeFile(output, zip)
  try {
    await verifyZip(zip, files)
  } catch (error) {
    await rm(output, { force: true })
    throw error
  }
  return { output, version, bytes: zip.length, sha256: sha256(zip) }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await packageExtension(fileURLToPath(new URL('../', import.meta.url)))
  console.log(`${result.output}\n${result.bytes} 字节，SHA-256 ${result.sha256}`)
}
