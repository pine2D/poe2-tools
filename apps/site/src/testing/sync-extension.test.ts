// @vitest-environment node
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
// @ts-expect-error 构建脚本直接由 Node 执行，不进入浏览器包。
import { syncExtension } from '../../scripts/sync-extension.mjs'

const ZIP = Buffer.from('PK fake extension zip')
let dir: string
let paths: { releasePath: string; artifactsDir: string; targetDir: string }

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'poe2-sync-extension-'))
  paths = {
    releasePath: join(dir, 'release.json'),
    artifactsDir: join(dir, 'artifacts'),
    targetDir: join(dir, 'public', 'downloads'),
  }
  await mkdir(paths.artifactsDir)
  await writeFile(join(paths.artifactsDir, 'poe2-extension-9.9.9.zip'), ZIP)
  await writeFile(
    paths.releasePath,
    JSON.stringify({
      version: '9.9.9',
      file: 'poe2-extension-9.9.9.zip',
      bytes: ZIP.length,
      sha256: createHash('sha256').update(ZIP).digest('hex'),
      date: '2026-10-02',
    }),
  )
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

it('只把 release.json 记录的 zip 复制到 downloads/，并清掉旧文件', async () => {
  await mkdir(paths.targetDir, { recursive: true })
  await writeFile(join(paths.targetDir, 'poe2-extension-0.0.1.zip'), 'old')
  await writeFile(join(paths.artifactsDir, 'poe2-extension-0.0.1.zip'), 'old')
  await syncExtension(paths)
  expect(await readdir(paths.targetDir)).toEqual(['poe2-extension-9.9.9.zip'])
  expect((await readFile(join(paths.targetDir, 'poe2-extension-9.9.9.zip'))).equals(ZIP)).toBe(true)
})

it('缺 zip 时失败并提示先打包，且不留下旧的下载文件', async () => {
  await mkdir(paths.targetDir, { recursive: true })
  await writeFile(join(paths.targetDir, 'poe2-extension-0.0.1.zip'), 'old')
  await rm(join(paths.artifactsDir, 'poe2-extension-9.9.9.zip'))
  await expect(syncExtension(paths)).rejects.toThrow('先运行 pnpm extension:package')
  await expect(readdir(paths.targetDir)).rejects.toMatchObject({ code: 'ENOENT' })
})

it('zip 与 release.json 的字节数或 SHA-256 不一致时失败', async () => {
  await writeFile(join(paths.artifactsDir, 'poe2-extension-9.9.9.zip'), 'PK fake extension zip!')
  await expect(syncExtension(paths)).rejects.toThrow('与 release.json 不一致')
})
