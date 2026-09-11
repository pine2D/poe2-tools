// 扫描两类死代码：① :root 里定义了但全站没有任何 var() 引用的令牌；
// ② CSS 里写了但没有任何 .tsx 用到的类选择器。
// 纯 Node、零依赖、不进 pnpm verify —— 它是人工排查工具，正则难免误报
// （字符串拼出来的类名、由 CSS 自己消费的 modifier），当成门禁只会把 CI 变成噪音源。
// 用法：pnpm --filter @poe2-tools/build-l10n scan-css
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const stylesDir = join(root, 'src/styles')

function walk(dir, test) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full, test))
    else if (test(entry.name)) out.push(full)
  }
  return out
}

const cssFiles = walk(stylesDir, (name) => name.endsWith('.css'))
const css = cssFiles.map((file) => readFileSync(file, 'utf8')).join('\n')
const tsxFiles = walk(join(root, 'src'), (name) => name.endsWith('.tsx') || name.endsWith('.ts'))
const tsx = tsxFiles
  .filter((file) => !file.endsWith('.test.tsx') && !file.endsWith('.test.ts'))
  .map((file) => readFileSync(file, 'utf8'))
  .join('\n')

// ① 零引用令牌
const defined = new Set()
for (const match of css.matchAll(/^\s*(--[a-z0-9-]+):/gm)) defined.add(match[1])
const used = new Set()
for (const match of css.matchAll(/var\((--[a-z0-9-]+)/g)) used.add(match[1])
for (const match of tsx.matchAll(/'(--[a-z0-9-]+)'/g)) used.add(match[1])
const deadTokens = [...defined].filter((name) => !used.has(name)).sort()

// ② 孤儿类选择器。跳过 CSS 自己消费的 modifier（写在别的选择器里的），
// 与由 build-core / 运行时拼出来的 mk-* 标记语法类。先剥注释再扫：注释里的
// `styles.css:107`、`mockup-1.html`、`.build`、`docs/…md` 都长得像类名，不剥会把
// 孤儿清单淹掉。
const rules = css.replace(/\/\*[\s\S]*?\*\//g, '')
const declared = new Set()
for (const match of rules.matchAll(/\.([a-z][a-z0-9_-]*)/gi)) declared.add(match[1])
const orphans = [...declared]
  .filter((name) => !name.startsWith('mk-'))
  .filter((name) => !tsx.includes(name))
  .sort()

let bad = 0
if (deadTokens.length > 0) {
  bad += deadTokens.length
  console.log(`零引用令牌 ${deadTokens.length} 个：`)
  for (const name of deadTokens) console.log(`  ${name}`)
}
if (orphans.length > 0) {
  bad += orphans.length
  console.log(`没有任何 .tsx 用到的类 ${orphans.length} 个（可能是误报，逐个看）：`)
  for (const name of orphans) console.log(`  .${name}`)
}
if (bad === 0) console.log('干净：没有零引用令牌，也没有孤儿类选择器。')
console.log(`\n扫了 ${cssFiles.length} 个 CSS 文件、${tsxFiles.length} 个源文件。`)
process.exit(bad === 0 ? 0 : 1)
