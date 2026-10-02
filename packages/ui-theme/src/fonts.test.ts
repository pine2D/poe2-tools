// 字体分片的 name 表、哈希与许可文件（spec §7.3、§8.6）
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  checkLicenseFile,
  LICENSE_FILES,
  LICENSE_REQUIRED_LINES,
  parseFontSources,
  parseLevel1Registration,
  REPO_ROOT,
  sha256,
} from '../scripts/compliance.mjs'
import { readNameRecords, readUsWeightClass, readWoff2Tables } from './font-tables'

interface CoverageShard {
  file: string
  family: 'PoE2 Serif SC' | 'PoE2 Serif TC' | 'PoE2 Cinzel'
  weight: 700 | 400
  sha256: string
  chars: string
}
interface Coverage {
  sourceCommit: string
  sources: Record<string, string>
  sourceNames: Record<string, Record<string, string>>
  shards: CoverageShard[]
}

const FONTS = join(REPO_ROOT, 'packages/ui-theme/fonts')
const coverage = JSON.parse(readFileSync(join(FONTS, 'coverage.json'), 'utf8')) as Coverage
const dataSources = readFileSync(join(REPO_ROOT, 'docs/data-sources.md'), 'utf8')
const HINT = '运行 pnpm ui-theme:fonts 重新生成'

const FAMILY = {
  'PoE2 Serif SC': {
    name: 'Noto Serif SC',
    copyright: '(c) 2017-2024 Adobe (http://www.adobe.com/).',
    weight: 700,
  },
  'PoE2 Serif TC': {
    name: 'Noto Serif TC',
    copyright: '(c) 2017-2024 Adobe (http://www.adobe.com/).',
    weight: 700,
  },
  'PoE2 Cinzel': {
    name: 'Cinzel',
    copyright: 'Copyright 2020 The Cinzel Project Authors (https://github.com/NDISCOVER/Cinzel)',
    weight: 400,
  },
} as const

describe('分片 name 表（spec §7.3 断言 1–5）', () => {
  for (const shard of coverage.shards) {
    it(shard.file, () => {
      const tables = readWoff2Tables(readFileSync(join(FONTS, shard.file)))
      const names = readNameRecords(tables.get('name') ?? new Uint8Array())
      const family = FAMILY[shard.family]
      const source = coverage.sourceNames[family.name] ?? {}
      for (const id of [0, 1, 13, 14]) expect(names.has(id), `ID ${id}`).toBe(true)
      if (family.name !== 'Cinzel') expect(names.get(7)).toBe('Noto is a trademark of Google Inc.')
      expect(names.get(0)).toBe(family.copyright)
      expect(names.get(13)).toMatch(
        /^This Font Software is licensed under the SIL Open Font License/,
      )
      expect(names.get(13)).toBe(source['13'])
      expect(names.get(14)).toBe(source['14'])
      expect(names.get(1)?.startsWith(family.name)).toBe(true)
      expect(names.get(1)).toBe(source['1'])
      expect(readUsWeightClass(tables.get('OS/2') ?? new Uint8Array())).toBe(family.weight)
      expect(shard.weight).toBe(family.weight)
    })
  }
})

describe('分片集合、源文件登记与许可文件（spec §7.3 断言 6、§7.4、§8.6）', () => {
  it('fonts/ 下的 woff2 与 coverage.json 登记的分片完全相同，SHA-256 一致', () => {
    const onDisk = readdirSync(FONTS)
      .filter((name) => name.endsWith('.woff2'))
      .sort()
    expect(onDisk, HINT).toEqual(coverage.shards.map((shard) => shard.file).sort())
    for (const shard of coverage.shards) {
      expect(sha256(readFileSync(join(FONTS, shard.file))), `${shard.file}：${HINT}`).toBe(
        shard.sha256,
      )
    }
  })

  it('popup.css 只有一条 @font-face，与 fonts.css 里 serif-sc-0 那条逐字相同（spec §7.6）', () => {
    const faces = (css: string) => css.match(/@font-face \{[^}]*\}/g) ?? []
    const popup = faces(readFileSync(join(FONTS, 'popup.css'), 'utf8'))
    expect(popup).toHaveLength(1)
    expect(popup[0]).toContain('url("./serif-sc-0.woff2")')
    expect(faces(readFileSync(join(FONTS, 'fonts.css'), 'utf8'))).toContain(popup[0])
  })

  it('SC shard0 覆盖扩展弹窗的衬线文案：PoE2 中文助手、使用前（spec §6.8）', () => {
    const shard0 = coverage.shards.find((shard) => shard.file === 'serif-sc-0.woff2')
    for (const ch of 'PoE2中文助手使用前') expect(shard0?.chars, ch).toContain(ch)
  })

  it('coverage.json 的提交号与 6 个源文件 SHA-256 就是 data-sources.md 登记的那组', () => {
    const { commit, files } = parseFontSources(dataSources)
    expect(coverage.sourceCommit).toBe(commit)
    expect(coverage.sources).toEqual(Object.fromEntries(files))
    expect(Object.keys(coverage.sources)).toHaveLength(6)
  })

  it('一级字表文件的实际 SHA-256 与登记一致', () => {
    const text = readFileSync(join(REPO_ROOT, 'packages/ui-theme/scripts/tongyong-level1.txt'))
    expect(sha256(text)).toBe(parseLevel1Registration(dataSources))
  })

  it('三份许可文件含 spec §8.6 的全部必含行', async () => {
    for (const name of LICENSE_FILES) {
      await checkLicenseFile(join(FONTS, 'LICENSES', name), LICENSE_REQUIRED_LINES[name])
    }
    expect(readdirSync(join(FONTS, 'LICENSES')).sort()).toEqual([...LICENSE_FILES].sort())
  })
})
