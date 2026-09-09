// 下载：单文件直接给 .build，多文件用 fflate 打成 zip；全部在浏览器内存里完成
import { strToU8, zipSync } from 'fflate'

export interface Downloadable {
  name: string
  output: string
}

export function textBlob(text: string): Blob {
  return new Blob([text], { type: 'application/json;charset=utf-8' })
}

// 同名文件加 (2)、(3) 后缀，避免 zip 内互相覆盖
export function uniqueNames(names: readonly string[]): string[] {
  const seen = new Map<string, number>()
  const out: string[] = []
  for (const name of names) {
    const count = (seen.get(name) ?? 0) + 1
    seen.set(name, count)
    if (count === 1) {
      out.push(name)
      continue
    }
    const dot = name.lastIndexOf('.')
    out.push(dot > 0 ? `${name.slice(0, dot)} (${count})${name.slice(dot)}` : `${name} (${count})`)
  }
  return out
}

export function zipBlob(files: readonly Downloadable[]): Blob {
  const names = uniqueNames(files.map((file) => file.name))
  const entries: Record<string, Uint8Array> = {}
  for (const [i, file] of files.entries()) entries[names[i] ?? file.name] = strToU8(file.output)
  const zipped = zipSync(entries, { level: 6 })
  return new Blob([zipped.slice().buffer], { type: 'application/zip' })
}

export function zipName(locale: string): string {
  return `build-l10n-${locale}.zip`
}

export function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  // 部分浏览器（Firefox）在点击后同步 revoke 会掐断尚未开始的下载，延迟释放规避
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
