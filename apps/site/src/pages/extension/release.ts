// 扩展发布信息：构建期从 apps/poe2-extension/release.json 读入（扩展发布 spec §6、§9）。
// zip 由 scripts/sync-extension.mjs 复制到 /downloads/，与这里的文件名、字节数一致。
import release from '../../../../poe2-extension/release.json'

export interface ExtensionRelease {
  version: string
  file: string
  bytes: number
  sha256: string
  date: string
}

export const EXTENSION_RELEASE: ExtensionRelease = release

export const downloadHref = `/downloads/${release.file}`

/** 页面显示用的大小：按 1024 进位，保留一位小数，如“1.6 MB” */
export function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
