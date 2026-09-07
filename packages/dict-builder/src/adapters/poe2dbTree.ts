// poe2db 天赋树 JSON 的端点版本号是前端 bundle 里硬编码的模板版本（当前 4.5），不是游戏版本；
// 运行时从页面 → bundle 两步解析，失败时由调用方回退到 POE2DB_TREE_FALLBACK_VERSION 并告警。
import { POE2DB_JS_BASE } from '../config'

export function findTreeBundleFile(pageHtml: string): string | null {
  const match = /passive-skill-tree\.[0-9a-f]+\.js/.exec(pageHtml)
  return match === null ? null : match[0]
}

export function bundleUrl(file: string): string {
  return `${POE2DB_JS_BASE}${file}`
}

export function findTreeVersion(bundleJs: string): string | null {
  const match = /poe2version:"([0-9.]+)"/.exec(bundleJs)
  return match?.[1] ?? null
}
