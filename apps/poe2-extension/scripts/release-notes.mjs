// GitHub Release 的计划与正文（扩展发布 spec §7）：只读 release.json 与扩展 CHANGELOG，不联网。
// 用法：node apps/poe2-extension/scripts/release-notes.mjs <正文输出路径>
// 标准输出为 key=value 行（tag、title、file、sha256），供工作流写入 $GITHUB_OUTPUT。
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { changelogEntry } from './release.mjs'

export const SITE = 'https://poe2-tools.pine2d.com'

export function releasePlan(release) {
  return {
    tag: `ext-v${release.version}`,
    title: `PoE2 中文助手 ${release.version}`,
    file: release.file,
    sha256: release.sha256,
  }
}

export function formatBytes(bytes) {
  const grouped = String(bytes).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${grouped} 字节（${(bytes / 1048576).toFixed(1)} MB）`
}

export function releaseNotes(release, changelog) {
  const { body } = changelogEntry(changelog, release.version)
  return [
    body,
    '',
    '## 下载与校验',
    '',
    `- 网站下载：${SITE}/downloads/${release.file}`,
    `- 安装与更新说明：${SITE}/extension/`,
    `- 文件：\`${release.file}\`，${formatBytes(release.bytes)}`,
    `- SHA-256：\`${release.sha256}\``,
    `- 发布日期：${release.date}`,
    '',
    '非官方扩展，与 Grinding Gear Games、腾讯及 Craft of Exile 无关联，也未获其认可。',
    '',
  ].join('\n')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const out = process.argv[2]
    if (!out)
      throw new Error('用法：node apps/poe2-extension/scripts/release-notes.mjs <正文输出路径>')
    const root = fileURLToPath(new URL('../', import.meta.url))
    const release = JSON.parse(await readFile(path.join(root, 'release.json'), 'utf8'))
    const changelog = await readFile(path.join(root, 'CHANGELOG.md'), 'utf8')
    await writeFile(out, releaseNotes(release, changelog))
    for (const [key, value] of Object.entries(releasePlan(release))) console.log(`${key}=${value}`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}
