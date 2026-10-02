// @vitest-environment node
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { FIXED_DOS_DATE, FIXED_DOS_TIME, storedZip, zipDirectory } from '../scripts/zip.mjs'

const dirs = []
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})
async function tempDir() {
  const dir = await mkdtemp(path.join(tmpdir(), 'ext-zip-test-'))
  dirs.push(dir)
  return dir
}
const sha = (buffer) => createHash('sha256').update(buffer).digest('hex')
const FILES = ['assets/dictionary.json', 'content.js', 'icons/icon-16.png', 'manifest.json']
async function fixture() {
  const dir = await tempDir()
  await mkdir(path.join(dir, 'assets'))
  await mkdir(path.join(dir, 'icons'))
  await mkdir(path.join(dir, 'empty'))
  await writeFile(path.join(dir, 'manifest.json'), '{"name":"PoE2 中文助手"}\n')
  await writeFile(path.join(dir, 'assets/dictionary.json'), JSON.stringify({ terms: ['水晶法器'] }))
  await writeFile(path.join(dir, 'icons/icon-16.png'), Buffer.from([137, 80, 78, 71, 0, 1, 2, 3]))
  await writeFile(path.join(dir, 'content.js'), 'void 0;\n')
  return dir
}

it('同一目录打包两次字节相同；修改时间与权限位不影响结果', async () => {
  const dir = await fixture()
  const first = await zipDirectory(dir)
  const later = new Date('2030-05-06T07:08:09Z')
  await utimes(path.join(dir, 'content.js'), later, later)
  await chmod(path.join(dir, 'manifest.json'), 0o600)
  expect(sha(await zipDirectory(dir))).toBe(sha(first))
})

it('条目按路径排序，与传入或列举顺序无关', () => {
  const a = Buffer.from('a')
  const b = Buffer.from('b')
  const forward = storedZip([
    { name: 'a.txt', data: a },
    { name: 'b.txt', data: b },
  ])
  const backward = storedZip([
    { name: 'b.txt', data: b },
    { name: 'a.txt', data: a },
  ])
  expect(forward.equals(backward)).toBe(true)
})

it('任一文件内容改变一个字节，SHA-256 随之改变', async () => {
  const dir = await fixture()
  const before = sha(await zipDirectory(dir))
  await writeFile(path.join(dir, 'content.js'), 'void 1;\n')
  expect(sha(await zipDirectory(dir))).not.toBe(before)
})

it('unzip 校验通过，列出按路径排序的文件（不含目录条目），解出的内容逐字节相同', async () => {
  const dir = await fixture()
  const out = await tempDir()
  const file = path.join(out, 'extension.zip')
  await writeFile(file, await zipDirectory(dir))
  execFileSync('unzip', ['-tq', file])
  expect(execFileSync('unzip', ['-Z1', file], { encoding: 'utf8' }).trim().split('\n')).toEqual(
    FILES,
  )
  execFileSync('unzip', ['-q', file, '-d', path.join(out, 'x')])
  for (const name of FILES)
    expect(
      (await readFile(path.join(out, 'x', name))).equals(await readFile(path.join(dir, name))),
    ).toBe(true)
})

it('每个条目都写固定的 DOS 时间与日期', () => {
  const zip = storedZip([{ name: 'empty.txt', data: Buffer.alloc(0) }])
  expect(zip.readUInt32LE(0)).toBe(0x04034b50)
  expect(zip.readUInt16LE(10)).toBe(FIXED_DOS_TIME)
  expect(zip.readUInt16LE(12)).toBe(FIXED_DOS_DATE)
  expect(FIXED_DOS_DATE).toBe(0x5c21)
})

it('拒绝 65535 个及以上条目（EOCD 条目数 0xFFFF 是 ZIP64 标记值）', () => {
  expect(() =>
    storedZip(Array.from({ length: 0xffff }, (_, i) => ({ name: `f${i}`, data: Buffer.alloc(0) }))),
  ).toThrow('ZIP 条目过多')
})

it('拒绝非 ASCII、越界或重复的条目名，以及符号链接', async () => {
  const data = Buffer.from('x')
  for (const name of ['中文.txt', '../x', 'a/../b', '/abs', 'a b', 'a\\b', 'a//b'])
    expect(() => storedZip([{ name, data }]), name).toThrow('条目名不合法')
  expect(() =>
    storedZip([
      { name: 'a', data },
      { name: 'a', data },
    ]),
  ).toThrow('条目重复')
  const dir = await fixture()
  await symlink(path.join(dir, 'content.js'), path.join(dir, 'link.js'))
  await expect(zipDirectory(dir)).rejects.toThrow('不允许打包符号链接：link.js')
})
