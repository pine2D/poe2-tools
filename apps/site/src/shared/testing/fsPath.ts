import { fileURLToPath } from 'node:url'

// happy-dom 环境下 Vite 会把 import.meta.url 重写成 http://localhost/@fs/<绝对路径>；还原成文件系统路径
export function fsPathFromMetaUrl(url: string): string {
  const parsed = new URL(url)
  if (parsed.protocol === 'file:') return fileURLToPath(parsed)
  const at = parsed.pathname.indexOf('/@fs')
  return at === -1 ? parsed.pathname : parsed.pathname.slice(at + 4)
}
