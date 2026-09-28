// 构建门禁：真正输出多页面和 404，每个 HTML 引用的本地资源都必须存在。
import { access, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export async function checkSite(root) {
  const pages = [
    'index.html',
    'build/index.html',
    'extension/index.html',
    'craft/index.html',
    '404.html',
  ]
  for (const page of pages) {
    try {
      await access(resolve(root, page))
    } catch {
      throw new Error(`缺少页面：${page}`)
    }
  }
  for (const page of pages) {
    const html = await readFile(resolve(root, page), 'utf8')
    for (const [, path] of html.matchAll(/(?:src|href)="(\/[^"#?]*)[^" ]*"/g)) {
      if (path.startsWith('//')) continue
      const resource = path.endsWith('/') ? `${path}index.html` : path
      try {
        await access(resolve(root, `.${resource}`))
      } catch {
        throw new Error(`${page} 引用缺失资源：${resource}`)
      }
    }
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await checkSite(fileURLToPath(new URL('../dist/', import.meta.url)))
  console.log('网站入口、404 和 HTML 静态资源引用检查通过')
}
