import { createHash } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { check } from './check.mjs'
import { zipDirectory } from './zip.mjs'

// 打包已通过检查的 dist/：同一份 dist 永远得到同一个 SHA-256（见 zip.mjs）
export async function packageExtension(root) {
  const { dist, version } = await check(root)
  const zip = await zipDirectory(dist)
  const output = path.join(root, 'artifacts', `poe2-extension-${version}.zip`)
  await mkdir(path.dirname(output), { recursive: true })
  await rm(output, { force: true })
  await writeFile(output, zip)
  const sha256 = createHash('sha256').update(zip).digest('hex')
  return { output, version, bytes: zip.length, sha256 }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await packageExtension(fileURLToPath(new URL('../', import.meta.url)))
  console.log(`${result.output}\n${result.bytes} 字节，SHA-256 ${result.sha256}`)
}
