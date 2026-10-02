// 扩展发布闸门（扩展发布 spec §5）：release.json 记录已发布 zip 的版本、文件名、字节数、SHA-256 与日期。
// check：CI 与 pnpm verify 用，重新打出的 zip 必须与 release.json 完全一致；
// write：开发者有意发版时在本机运行（pnpm extension:release），日期取自扩展 CHANGELOG 的版本标题。
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const CHANGED_HINT =
  '扩展产物已变化：请升版本、写 CHANGELOG、运行 `pnpm extension:release` 更新 release.json'

export function zipName(version) {
  return `poe2-extension-${version}.zip`
}

/** 扩展 CHANGELOG 中 `## [版本] - YYYY-MM-DD` 一段：返回日期与正文（不含标题）；缺段、缺日期或正文为空时抛错 */
export function changelogEntry(markdown, version) {
  const lines = markdown.split(/\r?\n/)
  const heading = `## [${version}] - `
  const start = lines.findIndex((line) => line.startsWith(heading))
  if (start < 0) throw new Error(`扩展 CHANGELOG 缺少“## [${version}] - YYYY-MM-DD”段落`)
  const date = lines[start].slice(heading.length).trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    throw new Error(`扩展 CHANGELOG 的 ${version} 标题日期不是 YYYY-MM-DD：${date}`)
  const next = lines.findIndex((line, index) => index > start && line.startsWith('## '))
  const body = lines
    .slice(start + 1, next < 0 ? lines.length : next)
    .join('\n')
    .trim()
  if (body === '') throw new Error(`扩展 CHANGELOG 的 ${version} 段落没有内容`)
  return { date, body }
}

/** 一个 zip 的发布描述（不含日期） */
export function describeZip(zip, version) {
  return {
    version,
    file: zipName(version),
    bytes: zip.length,
    sha256: createHash('sha256').update(zip).digest('hex'),
  }
}

/** release.json 与本次产物逐项比较；返回不一致的说明，空数组表示一致 */
export function releaseProblems(release, actual) {
  const problems = []
  for (const key of ['version', 'file', 'bytes', 'sha256']) {
    if (release?.[key] !== actual[key])
      problems.push(
        `${key}：release.json 为 ${release?.[key] ?? '（缺）'}，本次产物为 ${actual[key]}`,
      )
  }
  return problems
}

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'))
}

async function readArtifact(root, version) {
  try {
    return await readFile(path.join(root, 'artifacts', zipName(version)))
  } catch (error) {
    if (error?.code === 'ENOENT')
      throw new Error(`缺少 artifacts/${zipName(version)}：先运行 pnpm extension:package`)
    throw error
  }
}

/** 发布闸门：版本、文件名、字节数、SHA-256 与 release.json 一致，且 CHANGELOG 有同日期的版本段落 */
export async function checkRelease(root) {
  const pkg = await readJson(path.join(root, 'package.json'))
  let release
  try {
    release = await readJson(path.join(root, 'release.json'))
  } catch (error) {
    if (error?.code === 'ENOENT') throw new Error(`缺少 release.json。${CHANGED_HINT}`)
    throw error
  }
  const actual = describeZip(await readArtifact(root, pkg.version), pkg.version)
  const problems = releaseProblems(release, actual)
  if (problems.length > 0) throw new Error(`${CHANGED_HINT}\n  ${problems.join('\n  ')}`)
  const { date } = changelogEntry(
    await readFile(path.join(root, 'CHANGELOG.md'), 'utf8'),
    release.version,
  )
  if (release.date !== date)
    throw new Error(
      `release.json 的日期 ${release.date} 与 CHANGELOG ${release.version} 的日期 ${date} 不一致`,
    )
  return release
}

/** 写 release.json；同一版本已记录另一份产物或另一个日期时拒绝，除非 amend（只用于尚未推送发布的版本） */
export async function writeRelease(root, { amend = false } = {}) {
  const pkg = await readJson(path.join(root, 'package.json'))
  const actual = describeZip(await readArtifact(root, pkg.version), pkg.version)
  const { date } = changelogEntry(
    await readFile(path.join(root, 'CHANGELOG.md'), 'utf8'),
    pkg.version,
  )
  const release = { ...actual, date }
  let previous = null
  try {
    previous = await readJson(path.join(root, 'release.json'))
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  if (previous?.version === pkg.version) {
    const sameZip = releaseProblems(previous, actual).length === 0
    if (sameZip && previous.date === date) return { release: previous, changed: false }
    if (!amend)
      throw new Error(
        sameZip
          ? `release.json 已记录 ${pkg.version}：产物相同，只有日期不同（release.json 为 ${previous.date}，CHANGELOG 为 ${date}）。` +
              `该版本尚未推送发布时运行 EXTENSION_RELEASE_AMEND=1 pnpm extension:release 更新日期；已发布则把 CHANGELOG 的日期改回 ${previous.date}`
          : `release.json 已记录 ${pkg.version} 的另一份产物。该版本若已推送发布（GitHub 已有 ext-v${pkg.version}），必须升版本；` +
              '若尚未推送，可运行 EXTENSION_RELEASE_AMEND=1 pnpm extension:release 覆盖',
      )
  }
  await writeFile(path.join(root, 'release.json'), `${JSON.stringify(release, null, 2)}\n`)
  return { release, changed: true }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../', import.meta.url))
  try {
    if (process.argv[2] === 'check') {
      const release = await checkRelease(root)
      console.log(
        `扩展发布闸门通过：${release.file}，${release.bytes} 字节，SHA-256 ${release.sha256}`,
      )
    } else if (process.argv[2] === 'write') {
      const { release, changed } = await writeRelease(root, {
        amend: process.env.EXTENSION_RELEASE_AMEND === '1',
      })
      console.log(
        `${changed ? '已写入' : '无变化'} release.json：${release.file}，${release.bytes} 字节，SHA-256 ${release.sha256}，${release.date}`,
      )
    } else {
      throw new Error('用法：node apps/poe2-extension/scripts/release.mjs check|write')
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}
