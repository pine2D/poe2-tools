import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { crc32 } from 'node:zlib'

// 可复现 ZIP（扩展发布 spec §5）：只存储（method 0）、不压缩，字节与机器、Node 及 zlib 版本无关。
// 条目按路径的码元顺序排序；时间固定为 DOS 2026-01-01 00:00:00；不写目录条目、扩展字段、注释与权限位。
export const FIXED_DOS_TIME = 0
export const FIXED_DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1
// 条目名只允许可打印 ASCII（不含空格与反斜杠），避免各解压工具按不同代码页解释文件名
const NAME_RE = /^[\x21-\x5b\x5d-\x7e]+$/

/** @param {{ name: string, data: Uint8Array }[]} entries */
export function storedZip(entries) {
  const sorted = [...entries].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  if (sorted.length >= 0xffff) throw new Error('ZIP 条目过多')
  const locals = []
  const centrals = []
  let offset = 0
  for (const [index, { name, data }] of sorted.entries()) {
    if (
      !NAME_RE.test(name) ||
      name.startsWith('/') ||
      name.split('/').some((part) => part === '' || part === '.' || part === '..')
    )
      throw new Error(`ZIP 条目名不合法：${name}`)
    if (index > 0 && sorted[index - 1].name === name) throw new Error(`ZIP 条目重复：${name}`)
    const nameBytes = Buffer.from(name, 'ascii')
    const crc = crc32(data)
    const size = data.length
    if (size >= 0xffffffff || offset >= 0xffffffff) throw new Error('ZIP 超过 4 GiB')
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(10, 4) // 解压所需版本 1.0（只存储）
    local.writeUInt16LE(0, 6) // 通用标志：无
    local.writeUInt16LE(0, 8) // 方法：存储
    local.writeUInt16LE(FIXED_DOS_TIME, 10)
    local.writeUInt16LE(FIXED_DOS_DATE, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(size, 18)
    local.writeUInt32LE(size, 22)
    local.writeUInt16LE(nameBytes.length, 26)
    local.writeUInt16LE(0, 28) // 扩展字段长度
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4) // 创建者：MS-DOS 主机、规范 2.0，不携带 Unix 权限位
    central.writeUInt16LE(10, 6)
    central.writeUInt16LE(0, 8)
    central.writeUInt16LE(0, 10)
    central.writeUInt16LE(FIXED_DOS_TIME, 12)
    central.writeUInt16LE(FIXED_DOS_DATE, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(size, 20)
    central.writeUInt32LE(size, 24)
    central.writeUInt16LE(nameBytes.length, 28)
    // 30 扩展字段长、32 注释长、34 起始磁盘、36 内部属性、38 外部属性：保持 0
    central.writeUInt32LE(offset, 42)
    locals.push(local, nameBytes, data)
    centrals.push(central, nameBytes)
    offset += local.length + nameBytes.length + size
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(sorted.length, 8)
  end.writeUInt16LE(sorted.length, 10)
  end.writeUInt32LE(centralSize, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, ...centrals, end])
}

/** 打包目录下全部普通文件；遇到符号链接即拒绝，空目录不入包 */
export async function zipDirectory(dir) {
  const entries = []
  for (const entry of await readdir(dir, { recursive: true, withFileTypes: true })) {
    const full = path.join(entry.parentPath, entry.name)
    const name = path.relative(dir, full).split(path.sep).join('/')
    if (entry.isSymbolicLink()) throw new Error(`不允许打包符号链接：${name}`)
    if (entry.isFile()) entries.push({ name, data: await readFile(full) })
  }
  return storedZip(entries)
}

/** 读回 storedZip 写出的 ZIP（只支持本仓库的只存储格式、无注释），按中央目录顺序返回条目；格式或 CRC 不符即抛错 */
export function readStoredZip(buffer) {
  const zip = Buffer.from(buffer)
  const endAt = zip.length - 22
  if (endAt < 0 || zip.readUInt32LE(endAt) !== 0x06054b50) throw new Error('ZIP 结尾记录缺失')
  const count = zip.readUInt16LE(endAt + 10)
  const centralSize = zip.readUInt32LE(endAt + 12)
  let at = zip.readUInt32LE(endAt + 16)
  if (at + centralSize !== endAt) throw new Error('ZIP 中央目录位置不符')
  const entries = []
  for (let index = 0; index < count; index += 1) {
    if (zip.readUInt32LE(at) !== 0x02014b50) throw new Error('ZIP 中央目录损坏')
    const method = zip.readUInt16LE(at + 10)
    const crc = zip.readUInt32LE(at + 16)
    const size = zip.readUInt32LE(at + 20)
    const nameLength = zip.readUInt16LE(at + 28)
    const extraLength = zip.readUInt16LE(at + 30)
    const commentLength = zip.readUInt16LE(at + 32)
    const offset = zip.readUInt32LE(at + 42)
    const name = zip.toString('ascii', at + 46, at + 46 + nameLength)
    if (method !== 0) throw new Error(`ZIP 条目不是只存储：${name}`)
    if (zip.readUInt32LE(offset) !== 0x04034b50) throw new Error(`ZIP 本地头损坏：${name}`)
    const start = offset + 30 + zip.readUInt16LE(offset + 26) + zip.readUInt16LE(offset + 28)
    const data = zip.subarray(start, start + size)
    if (data.length !== size || crc32(data) !== crc) throw new Error(`ZIP 条目校验失败：${name}`)
    entries.push({ name, data })
    at += 46 + nameLength + extraLength + commentLength
  }
  return entries
}
