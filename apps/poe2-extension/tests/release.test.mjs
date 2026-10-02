// @vitest-environment node
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import {
  CHANGED_HINT,
  changelogEntry,
  checkRelease,
  releaseProblems,
  writeRelease,
} from '../scripts/release.mjs'

const roots = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})
const CHANGELOG = `# 更新日志

## [0.2.0] - 2026-10-02

### 新增

- 首个公开下载版。

## [0.1.111] - 2026-09-26

### 修复

- 旧条目。
`
// 一个最小的扩展目录：package.json、CHANGELOG 与 artifacts 里的 zip
async function fixture({ version = '0.2.0', zip = 'zip-bytes-v1', changelog = CHANGELOG } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'ext-release-test-'))
  roots.push(root)
  await mkdir(path.join(root, 'artifacts'))
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ version }))
  await writeFile(path.join(root, 'CHANGELOG.md'), changelog)
  await writeFile(path.join(root, 'artifacts', `poe2-extension-${version}.zip`), zip)
  return root
}
const readRelease = async (root) =>
  JSON.parse(await readFile(path.join(root, 'release.json'), 'utf8'))

it('changelogEntry 取出指定版本的日期与正文，不含相邻版本', () => {
  const entry = changelogEntry(CHANGELOG, '0.2.0')
  expect(entry.date).toBe('2026-10-02')
  expect(entry.body).toBe('### 新增\n\n- 首个公开下载版。')
  expect(() => changelogEntry(CHANGELOG, '0.3.0')).toThrow('缺少“## [0.3.0] - YYYY-MM-DD”')
  expect(() => changelogEntry('## [0.2.0] - 未定\n\n- x\n', '0.2.0')).toThrow('不是 YYYY-MM-DD')
  expect(() =>
    changelogEntry('## [0.2.0] - 2026-10-02\n\n## [0.1.0] - 2026-09-01\n', '0.2.0'),
  ).toThrow('没有内容')
})

it('写入的 release.json 字段与 zip 一致，日期取自 CHANGELOG，随后闸门通过', async () => {
  const root = await fixture()
  const { release, changed } = await writeRelease(root)
  expect(changed).toBe(true)
  expect(release).toEqual({
    version: '0.2.0',
    file: 'poe2-extension-0.2.0.zip',
    bytes: 12,
    sha256: createHash('sha256').update('zip-bytes-v1').digest('hex'),
    date: '2026-10-02',
  })
  expect(Object.keys(await readRelease(root))).toEqual([
    'version',
    'file',
    'bytes',
    'sha256',
    'date',
  ])
  await expect(checkRelease(root)).resolves.toEqual(release)
  expect((await writeRelease(root)).changed).toBe(false)
})

it('同一版本产物变化时闸门失败并提示升版本，且报出两边的值', async () => {
  const root = await fixture()
  await writeRelease(root)
  await writeFile(path.join(root, 'artifacts/poe2-extension-0.2.0.zip'), 'zip-bytes-v2!')
  const error = await checkRelease(root).catch((caught) => caught)
  expect(error.message).toContain(CHANGED_HINT)
  expect(error.message).toContain('bytes：release.json 为 12，本次产物为 13')
  expect(error.message).toContain('sha256：')
})

it('升了版本却没更新 release.json 时闸门失败', async () => {
  const root = await fixture()
  await writeRelease(root)
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ version: '0.2.1' }))
  await writeFile(path.join(root, 'artifacts/poe2-extension-0.2.1.zip'), 'zip-bytes-v1')
  await expect(checkRelease(root)).rejects.toThrow(
    'version：release.json 为 0.2.0，本次产物为 0.2.1',
  )
})

it('缺 release.json、缺 zip、CHANGELOG 日期与 release.json 不一致时分别报错', async () => {
  const root = await fixture()
  await expect(checkRelease(root)).rejects.toThrow('缺少 release.json')
  await writeRelease(root)
  await writeFile(path.join(root, 'CHANGELOG.md'), CHANGELOG.replace('2026-10-02', '2026-10-03'))
  await expect(checkRelease(root)).rejects.toThrow(
    '日期 2026-10-02 与 CHANGELOG 0.2.0 的日期 2026-10-03 不一致',
  )
  await rm(path.join(root, 'artifacts/poe2-extension-0.2.0.zip'))
  await expect(checkRelease(root)).rejects.toThrow('先运行 pnpm extension:package')
})

it('同一版本已记录另一份产物时拒绝覆盖，只有 amend 才改写', async () => {
  const root = await fixture()
  const { release: first } = await writeRelease(root)
  await writeFile(path.join(root, 'artifacts/poe2-extension-0.2.0.zip'), 'zip-bytes-v2!')
  await expect(writeRelease(root)).rejects.toThrow('必须升版本')
  expect(await readRelease(root)).toEqual(first)
  const { release: amended, changed } = await writeRelease(root, { amend: true })
  expect(changed).toBe(true)
  expect(amended.bytes).toBe(13)
})

it('只有日期不同时单独提示改日期，amend 只改 date', async () => {
  const root = await fixture()
  const { release: first } = await writeRelease(root)
  await writeFile(path.join(root, 'CHANGELOG.md'), CHANGELOG.replace('2026-10-02', '2026-10-05'))
  await expect(writeRelease(root)).rejects.toThrow('产物相同，只有日期不同')
  expect(await readRelease(root)).toEqual(first)
  const { release: amended } = await writeRelease(root, { amend: true })
  expect(amended).toEqual({ ...first, date: '2026-10-05' })
})

it('新版本缺 CHANGELOG 段落时不写 release.json', async () => {
  const root = await fixture({ version: '0.3.0' })
  await expect(writeRelease(root)).rejects.toThrow('缺少“## [0.3.0] - YYYY-MM-DD”')
  await expect(readFile(path.join(root, 'release.json'))).rejects.toMatchObject({ code: 'ENOENT' })
})

it('releaseProblems 对一致的描述返回空数组', () => {
  const same = { version: '1.0.0', file: 'poe2-extension-1.0.0.zip', bytes: 1, sha256: 'a' }
  expect(releaseProblems({ ...same, date: '2026-10-02' }, same)).toEqual([])
  expect(releaseProblems(undefined, same)).toHaveLength(4)
})
