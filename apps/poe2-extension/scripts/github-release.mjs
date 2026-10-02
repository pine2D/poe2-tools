// GitHub Release 的守卫与发布（扩展发布 spec §5、§7）。只在 CI 里运行，经 gh CLI 访问 GitHub（GH_TOKEN、GH_REPO 由工作流提供）。
// guard [zip]：verify job 用。release.json 的版本已有 Release 且带同名附件时，附件必须与 release.json 逐字节一致，
//   同一版本不能换内容（例如误用 EXTENSION_RELEASE_AMEND 改写了已发布的版本）。zip 默认 artifacts/<file>。
// publish <zip> <正文路径> <目标提交>：release-extension job 用。没有 Release 就创建（不标为 Latest）；
//   已有且附件一致就跳过；没有附件就补传；草稿、多余附件或附件不一致即失败。
// 本机不要运行 publish：它会真的创建 tag 与 Release。guard 只读，可以在本机演练。
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describeZip, releaseProblems } from './release.mjs'
import { releasePlan } from './release-notes.mjs'

export const PUBLISHED_HINT = '该版本已发布，必须升版本：同一文件名不能换内容'
const USAGE = '用法：github-release.mjs guard [zip] | publish <zip> <正文路径> <目标提交>'

/** publish 的下一步：没有 Release（view 为 null）就 create，没有附件就 upload，只有同名附件就 compare；草稿或意外附件抛错 */
export function publishAction(view, file) {
  if (view === null) return 'create'
  const names = view.assets.map((asset) => asset.name)
  if (names.some((name) => name !== file))
    throw new Error(`Release 含意外附件：${names.join('、')}（应只有 ${file}）`)
  if (view.isDraft)
    throw new Error(
      'Release 仍是草稿（上次发布可能中途被取消）：在 GitHub 上检查并删除该草稿后重跑本 job',
    )
  return names.length === 0 ? 'upload' : 'compare'
}

/** guard 只看已上传的同名附件：有就比对，没有（未发布或附件缺失）就放行 */
export function guardAction(view, file) {
  return view?.assets.some((asset) => asset.name === file) ? 'compare' : 'none'
}

function gh(args, env) {
  const result = spawnSync('gh', args, { encoding: 'utf8', env })
  if (result.error) throw result.error
  return result
}

function ghOk(args, env) {
  const result = gh(args, env)
  if (result.status !== 0)
    throw new Error(`gh ${args.slice(0, 2).join(' ')} 失败：${result.stderr.trim()}`)
  return result.stdout
}

/** gh release view：没有该 tag 的 Release 返回 null；其他错误（网络、权限）照常抛出，不当作未发布 */
function viewRelease(tag, env) {
  const result = gh(['release', 'view', tag, '--json', 'isDraft,assets'], env)
  if (result.status === 0) return JSON.parse(result.stdout)
  if (/release not found/i.test(result.stderr)) return null
  throw new Error(`gh release view ${tag} 失败：${result.stderr.trim()}`)
}

async function comparePublished(release, tag, env) {
  const dir = await mkdtemp(path.join(tmpdir(), 'ext-published-'))
  try {
    ghOk(['release', 'download', tag, '--pattern', release.file, '--dir', dir], env)
    const published = describeZip(await readFile(path.join(dir, release.file)), release.version)
    const problems = releaseProblems(release, published)
    if (problems.length > 0)
      throw new Error(
        `${PUBLISHED_HINT}。${tag} 的附件与 release.json 不一致：\n  ${problems.join('\n  ')}`,
      )
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

/** 返回写进日志的一行结果；任何不一致都抛错 */
export async function githubRelease({ root, mode, zip, notes, target, env = process.env }) {
  if (mode !== 'guard' && (mode !== 'publish' || !zip || !notes || !target)) throw new Error(USAGE)
  const release = JSON.parse(await readFile(path.join(root, 'release.json'), 'utf8'))
  const { tag, title, file } = releasePlan(release)
  const zipPath = zip ?? path.join(root, 'artifacts', file)
  if (path.basename(zipPath) !== file) throw new Error(`附件文件名应为 ${file}：${zipPath}`)
  const local = releaseProblems(release, describeZip(await readFile(zipPath), release.version))
  if (local.length > 0)
    throw new Error(`${zipPath} 与 release.json 不一致：\n  ${local.join('\n  ')}`)
  if (mode === 'guard') {
    if (guardAction(viewRelease(tag, env), file) === 'none')
      return `${tag} 还没有已上传的 ${file}，放行`
    await comparePublished(release, tag, env)
    return `${tag} 已发布，附件与 release.json 一致`
  }
  const action = publishAction(viewRelease(tag, env), file)
  if (action === 'create') {
    ghOk(
      [
        'release',
        'create',
        tag,
        zipPath,
        '--target',
        target,
        '--title',
        title,
        '--notes-file',
        notes,
        '--latest=false',
      ],
      env,
    )
    return `已创建 ${tag}（附件 ${file}，不标为 Latest）`
  }
  if (action === 'upload') {
    ghOk(['release', 'upload', tag, zipPath], env)
    return `${tag} 缺附件，已补传 ${file}`
  }
  await comparePublished(release, tag, env)
  return `${tag} 已发布且附件与 release.json 一致，跳过`
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, zip, notes, target] = process.argv.slice(2)
  try {
    const root = fileURLToPath(new URL('../', import.meta.url))
    console.log(await githubRelease({ root, mode, zip, notes, target }))
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}
