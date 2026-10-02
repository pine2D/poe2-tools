// @vitest-environment node
// CI 里的已发布版本守卫与 Release 创建/核对（扩展发布 spec §5、§7）：用假 gh 演练各分支，不联网
import { createHash } from 'node:crypto'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import {
  githubRelease,
  guardAction,
  PUBLISHED_HINT,
  publishAction,
} from '../scripts/github-release.mjs'

const FILE = 'poe2-extension-9.9.9.zip'
const ZIP = 'PK fake extension zip'
// 假 gh：按同目录 state.json 回应 release view / download，把每次调用的参数逐行记进 calls.log
const FAKE_GH = `#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')
const dir = path.dirname(process.argv[1])
const state = JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf8'))
const args = process.argv.slice(2)
fs.appendFileSync(path.join(dir, 'calls.log'), JSON.stringify(args) + '\\n')
if (args[1] === 'view') {
  if (state.viewError) {
    process.stderr.write(state.viewError + '\\n')
    process.exit(1)
  }
  process.stdout.write(JSON.stringify(state.view))
} else if (args[1] === 'download') {
  const target = path.join(args[args.indexOf('--dir') + 1], args[args.indexOf('--pattern') + 1])
  fs.writeFileSync(target, state.asset)
}
`
const NOT_FOUND = { viewError: 'release not found' }
const published = (asset) => ({ view: { isDraft: false, assets: [{ name: FILE }] }, asset })

const roots = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})
// 最小扩展目录（release.json 与 artifacts 里的 zip）加一个放在 PATH 最前面的假 gh
async function fixture(state) {
  const root = await mkdtemp(path.join(tmpdir(), 'ext-github-release-'))
  roots.push(root)
  const bin = path.join(root, 'bin')
  await mkdir(path.join(root, 'artifacts'))
  await mkdir(bin)
  const zip = path.join(root, 'artifacts', FILE)
  await writeFile(zip, ZIP)
  await writeFile(
    path.join(root, 'release.json'),
    JSON.stringify({
      version: '9.9.9',
      file: FILE,
      bytes: ZIP.length,
      sha256: createHash('sha256').update(ZIP).digest('hex'),
      date: '2026-10-02',
    }),
  )
  await writeFile(path.join(bin, 'gh'), FAKE_GH)
  await chmod(path.join(bin, 'gh'), 0o755)
  await writeFile(path.join(bin, 'state.json'), JSON.stringify(state))
  const env = { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` }
  const calls = async () =>
    (await readFile(path.join(bin, 'calls.log'), 'utf8').catch(() => ''))
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
  return { root, env, calls, zip }
}

it('publishAction：没有 Release 就创建，没有附件就补传，只有同名附件就比对', () => {
  expect(publishAction(null, FILE)).toBe('create')
  expect(publishAction({ isDraft: false, assets: [] }, FILE)).toBe('upload')
  expect(publishAction({ isDraft: false, assets: [{ name: FILE }] }, FILE)).toBe('compare')
})

it('publishAction：草稿或意外附件明确失败', () => {
  expect(() => publishAction({ isDraft: true, assets: [] }, FILE)).toThrow('草稿')
  expect(() =>
    publishAction({ isDraft: false, assets: [{ name: FILE }, { name: 'x.zip' }] }, FILE),
  ).toThrow('意外附件')
})

it('guardAction：只在已上传同名附件时比对，草稿也比对', () => {
  expect(guardAction(null, FILE)).toBe('none')
  expect(guardAction({ isDraft: false, assets: [] }, FILE)).toBe('none')
  expect(guardAction({ isDraft: true, assets: [{ name: FILE }] }, FILE)).toBe('compare')
})

it('guard：已发布附件与 release.json 不一致时失败并提示升版本', async () => {
  const { root, env } = await fixture(published(`${ZIP}!`))
  await expect(githubRelease({ root, mode: 'guard', env })).rejects.toThrow(PUBLISHED_HINT)
})

it('guard：没有 Release 时放行；gh 的其他错误不当作未发布', async () => {
  const missing = await fixture(NOT_FOUND)
  await expect(
    githubRelease({ root: missing.root, mode: 'guard', env: missing.env }),
  ).resolves.toBe(`ext-v9.9.9 还没有已上传的 ${FILE}，放行`)
  const broken = await fixture({ viewError: 'HTTP 502: Bad Gateway' })
  await expect(
    githubRelease({ root: broken.root, mode: 'guard', env: broken.env }),
  ).rejects.toThrow('HTTP 502')
})

it('publish：没有 Release 时在目标提交创建 tag 与 Release，不标为 Latest', async () => {
  const { root, env, calls, zip } = await fixture(NOT_FOUND)
  const notes = path.join(root, 'notes.md')
  await expect(
    githubRelease({ root, mode: 'publish', zip, notes, target: 'abc123', env }),
  ).resolves.toBe(`已创建 ext-v9.9.9（附件 ${FILE}，不标为 Latest）`)
  expect((await calls()).at(-1)).toEqual([
    'release',
    'create',
    'ext-v9.9.9',
    zip,
    '--target',
    'abc123',
    '--title',
    'PoE2 中文助手 9.9.9',
    '--notes-file',
    notes,
    '--latest=false',
  ])
})

it('publish：已有一致附件就跳过；有 Release 但缺附件就补传', async () => {
  const same = await fixture(published(ZIP))
  const options = { mode: 'publish', notes: 'notes.md', target: 'abc123' }
  await expect(
    githubRelease({ ...options, root: same.root, zip: same.zip, env: same.env }),
  ).resolves.toContain('跳过')
  expect((await same.calls()).map((args) => args[1])).toEqual(['view', 'download'])
  const empty = await fixture({ view: { isDraft: false, assets: [] } })
  await expect(
    githubRelease({ ...options, root: empty.root, zip: empty.zip, env: empty.env }),
  ).resolves.toContain('已补传')
  expect((await empty.calls()).at(-1)).toEqual(['release', 'upload', 'ext-v9.9.9', empty.zip])
})

it('本地 zip 与 release.json 不一致时不调用 gh 就失败', async () => {
  const { root, env, calls, zip } = await fixture(NOT_FOUND)
  await writeFile(zip, `${ZIP}?`)
  await expect(
    githubRelease({ root, mode: 'publish', zip, notes: 'notes.md', target: 'abc123', env }),
  ).rejects.toThrow('与 release.json 不一致')
  expect(await calls()).toEqual([])
})
