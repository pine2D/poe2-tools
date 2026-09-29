// 读取 TTF/OTF 与 woff2 的表：只为 name 表与 OS/2 表断言服务（spec §7.3），不新增依赖
import { brotliDecompressSync } from 'node:zlib'

// woff2 规范 5.1 的已知表标签（下标 0–62）；flags 低 6 位为 63 时标签另写 4 字节
const KNOWN_TAGS = [
  'cmap',
  'head',
  'hhea',
  'hmtx',
  'maxp',
  'name',
  'OS/2',
  'post',
  'cvt ',
  'fpgm',
  'glyf',
  'loca',
  'prep',
  'CFF ',
  'VORG',
  'EBDT',
  'EBLC',
  'gasp',
  'hdmx',
  'kern',
  'LTSH',
  'PCLT',
  'VDMX',
  'vhea',
  'vmtx',
  'BASE',
  'GDEF',
  'GPOS',
  'GSUB',
  'EBSC',
  'JSTF',
  'MATH',
  'CBDT',
  'CBLC',
  'COLR',
  'CPAL',
  'SVG ',
  'sbix',
  'acnt',
  'avar',
  'bdat',
  'bloc',
  'bsln',
  'cvar',
  'fdsc',
  'feat',
  'fmtx',
  'fvar',
  'gvar',
  'hsty',
  'just',
  'lcar',
  'mort',
  'morx',
  'opbd',
  'prop',
  'trak',
  'Zapf',
  'Silf',
  'Glat',
  'Gloc',
  'Feat',
  'Sill',
] as const

function view(buf: Uint8Array): DataView {
  return new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
}

function tagAt(buf: Uint8Array, offset: number): string {
  return String.fromCharCode(...buf.subarray(offset, offset + 4))
}

/** 读 TTF/OTF 的表目录，返回 tag → 表字节 */
export function readSfntTables(buf: Uint8Array): Map<string, Uint8Array> {
  const dv = view(buf)
  const numTables = dv.getUint16(4)
  const tables = new Map<string, Uint8Array>()
  for (let i = 0; i < numTables; i += 1) {
    const record = 12 + i * 16
    const offset = dv.getUint32(record + 8)
    const length = dv.getUint32(record + 12)
    if (offset + length > buf.byteLength) throw new Error(`表 ${tagAt(buf, record)} 越界`)
    tables.set(tagAt(buf, record), buf.subarray(offset, offset + length))
  }
  return tables
}

/** 读 woff2：brotli 解压数据流后按表目录切出各表（name、OS/2 不做变换） */
export function readWoff2Tables(buf: Uint8Array): Map<string, Uint8Array> {
  const dv = view(buf)
  if (tagAt(buf, 0) !== 'wOF2') throw new Error('不是 woff2 文件')
  if (tagAt(buf, 4) === 'ttcf') throw new Error('不支持字体集合')
  const numTables = dv.getUint16(12)
  const totalCompressedSize = dv.getUint32(20)
  let pos = 48
  const readBase128 = (): number => {
    let value = 0
    for (let i = 0; i < 5; i += 1) {
      const byte = buf[pos] ?? 0
      pos += 1
      if (i === 0 && byte === 0x80) throw new Error('UIntBase128 前导零')
      value = value * 128 + (byte & 0x7f)
      if ((byte & 0x80) === 0) return value
    }
    throw new Error('UIntBase128 超过 5 字节')
  }
  const entries: { tag: string; length: number }[] = []
  for (let i = 0; i < numTables; i += 1) {
    const flags = buf[pos] ?? 0
    pos += 1
    let tag: string
    if ((flags & 0x3f) === 0x3f) {
      tag = tagAt(buf, pos)
      pos += 4
    } else {
      tag = KNOWN_TAGS[flags & 0x3f] ?? ''
    }
    const version = (flags >> 6) & 0x03
    const origLength = readBase128()
    // glyf/loca 的变换版本 0 表示已变换；其余表的版本 0 表示未变换
    const transformed = tag === 'glyf' || tag === 'loca' ? version !== 3 : version !== 0
    const length = transformed ? readBase128() : origLength
    entries.push({ tag, length })
  }
  const stream = brotliDecompressSync(buf.subarray(pos, pos + totalCompressedSize))
  const tables = new Map<string, Uint8Array>()
  let offset = 0
  for (const { tag, length } of entries) {
    tables.set(tag, new Uint8Array(stream.buffer, stream.byteOffset + offset, length))
    offset += length
  }
  return tables
}

/** name 表中 platformID 3 的记录（UTF-16BE），nameID → 字符串；同一 ID 取 languageID 0x409 */
export function readNameRecords(nameTable: Uint8Array): Map<number, string> {
  const dv = view(nameTable)
  const count = dv.getUint16(2)
  const stringOffset = dv.getUint16(4)
  const names = new Map<number, string>()
  const langs = new Map<number, number>()
  for (let i = 0; i < count; i += 1) {
    const record = 6 + i * 12
    if (dv.getUint16(record) !== 3) continue
    const languageID = dv.getUint16(record + 4)
    const nameID = dv.getUint16(record + 6)
    const length = dv.getUint16(record + 8)
    const offset = stringOffset + dv.getUint16(record + 10)
    if (names.has(nameID) && langs.get(nameID) === 0x409) continue
    let text = ''
    for (let j = 0; j + 1 < length; j += 2) text += String.fromCharCode(dv.getUint16(offset + j))
    names.set(nameID, text)
    langs.set(nameID, languageID)
  }
  return names
}

export function readUsWeightClass(os2Table: Uint8Array): number {
  return view(os2Table).getUint16(4)
}
