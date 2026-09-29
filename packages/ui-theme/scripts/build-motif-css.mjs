// 生成母题 CSS 与 SVG（spec §4.5）：只手动运行（pnpm ui-theme:motif），不联网。
// 用法：node packages/ui-theme/scripts/build-motif-css.mjs [--check]
// --check 只比较不写，有差异时逐个列出文件并以 1 退出。
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { GENERATED_NAMES, renderGenerated } from '../src/motif-css.ts'

const args = process.argv.slice(2)
const unknown = args.filter((arg) => arg !== '--check')
if (unknown.length > 0) {
  console.error(`未知参数：${unknown.join(' ')}`)
  process.exit(1)
}
const check = args.includes('--check')
const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = resolve(pkgDir, '..', '..')
const files = renderGenerated()
const targets = GENERATED_NAMES.map((name) => [resolve(pkgDir, 'src/generated', name), files[name]])
// 站点副本：与 generated/favicon.svg 同字节
targets.push([resolve(repoRoot, 'apps/site/public/favicon.svg'), files['favicon.svg']])

async function readOrNull(path) {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return null
  }
}

try {
  const stale = []
  for (const [path, content] of targets) {
    if ((await readOrNull(path)) === content) continue
    stale.push(relative(repoRoot, path))
    if (!check) {
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, content)
    }
  }
  if (check && stale.length > 0) {
    console.error(`生成物与源不一致：\n${stale.join('\n')}\n运行 pnpm ui-theme:motif 重新生成`)
    process.exit(1)
  }
  console.log(check ? '母题生成物一致' : `已写入 ${stale.length} 个文件`)
} catch (error) {
  console.error(error)
  process.exit(1)
}
