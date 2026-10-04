// compliance.mjs 的单元用例：合规判定只有这一份实现（spec §8.6）

import { readFileSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  assertAssets,
  assertFontSetEquals,
  assertLicenseText,
  checkLicenseFile,
  classifyAsset,
  cssUrlTargets,
  EXTENSION_FONT_FILES,
  EXTERNAL_URL_RE,
  externalUrls,
  FULL_DISCLAIMER,
  L1_FONT_BUDGET,
  L1_FONT_FAMILY,
  L1_FONT_FILE,
  LICENSE_REQUIRED_LINES,
  loadWhitelist,
  missingLines,
  POPUP_FONT_FILE,
  parseFontSources,
  parseLevel1Registration,
  parseRegisteredAssets,
  REPO_ROOT,
  SITE_NOTICE_REQUIRED_LINES,
  sha256,
  type Whitelist,
} from '../scripts/compliance.mjs'

const dataSources = readFileSync(join(REPO_ROOT, 'docs/data-sources.md'), 'utf8')
const SHA_A = 'a'.repeat(64)
const SHA_B = 'b'.repeat(64)
const SHA_C = 'c'.repeat(64)
const whitelist: Whitelist = {
  fontShards: new Map([['serif-sc-0.woff2', SHA_A]]),
  motifSvgs: new Map([['apps/site/public/favicon.svg', SHA_B]]),
  registered: new Map([['apps/site/public/og.png', SHA_C]]),
}

describe('许可文件必含行', () => {
  it('必含行逐字取自 spec §8.6', () => {
    expect(LICENSE_REQUIRED_LINES['NotoSerifSC-OFL.txt']).toEqual([
      '(c) 2017-2024 Adobe (http://www.adobe.com/).',
      'Noto is a trademark of Google Inc.',
      'Copyright 2012 Google Inc. All Rights Reserved.',
      'SIL OPEN FONT LICENSE Version 1.1',
    ])
    expect(LICENSE_REQUIRED_LINES['NotoSerifTC-OFL.txt']).toEqual(
      LICENSE_REQUIRED_LINES['NotoSerifSC-OFL.txt'],
    )
    expect(LICENSE_REQUIRED_LINES['Cinzel-OFL.txt']).toEqual([
      'Copyright 2020 The Cinzel Project Authors (https://github.com/NDISCOVER/Cinzel)',
      'SIL OPEN FONT LICENSE Version 1.1',
    ])
    expect(SITE_NOTICE_REQUIRED_LINES).toEqual([
      FULL_DISCLAIMER,
      '/fonts/NotoSerifSC-OFL.txt',
      '/fonts/NotoSerifTC-OFL.txt',
      '/fonts/Cinzel-OFL.txt',
    ])
  })

  it('缺行时报错信息列出文件名与缺失的每一行', () => {
    expect(missingLines('a\nb', ['a', 'c'])).toEqual(['c'])
    expect(() =>
      assertLicenseText(
        'Cinzel-OFL.txt',
        'SIL OPEN FONT LICENSE Version 1.1',
        LICENSE_REQUIRED_LINES['Cinzel-OFL.txt'],
      ),
    ).toThrow(/Cinzel-OFL\.txt[\s\S]*Copyright 2020 The Cinzel Project Authors/)
    expect(() => assertLicenseText('x', 'a b', ['a', 'b'])).not.toThrow()
  })

  it('文件缺失时抛错', async () => {
    await expect(checkLicenseFile('/nonexistent/NotoSerifSC-OFL.txt', ['x'])).rejects.toThrow(
      '缺少许可文件',
    )
  })
})

describe('CSS url() 判定（spec §8.5）', () => {
  it('正则命中 http、https 与协议相对地址，不误报 data URI 里的 xmlns', () => {
    for (const bad of [
      'url(https://x.test/a.woff2)',
      'url( "//cdn.test/a")',
      "url('http://a.test/b')",
    ]) {
      expect(EXTERNAL_URL_RE.test(bad), bad).toBe(true)
    }
    const svg = `url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>")`
    expect(EXTERNAL_URL_RE.test(svg)).toBe(false)
    expect(externalUrls(`a{background:${svg}} b{src:url(./x.woff2)}`)).toEqual([])
  })

  it('externalUrls 返回命中的片段，忽略注释', () => {
    expect(
      externalUrls('/* url(https://skip.test) */ a{b:url(https://x.test/y)} c{d:url(//z)}'),
    ).toEqual(['url(https://x.test/y)', 'url(//z)'])
  })

  it('cssUrlTargets 去引号、保持顺序，带引号的 data URI 内部的 url( 不再单列', () => {
    const grain = `url("data:image/svg+xml,%3Crect filter='url(%23n)'/%3E")`
    expect(cssUrlTargets(`a{src:url( "./a.woff2" ) , url(b.png)} b{c:${grain}}`)).toEqual([
      './a.woff2',
      'b.png',
      "data:image/svg+xml,%3Crect filter='url(%23n)'/%3E",
    ])
    // 压缩后的 dist：未加引号，data URI 里的括号写成 \( \)
    expect(cssUrlTargets('a{b:url(data:x,url\\(%23n\\)%3E)} c{src:url(/assets/a.woff2)}')).toEqual([
      'data:x,url\\(%23n\\)%3E',
      '/assets/a.woff2',
    ])
  })
})

describe('data-sources.md 机读段落（契约 §3.7.6）', () => {
  it('从真实登记读出固定提交与 6 个源文件的 SHA-256', () => {
    const { commit, files } = parseFontSources(dataSources)
    expect(commit).toMatch(/^[0-9a-f]{40}$/)
    expect([...files.keys()]).toEqual([
      'ofl/notoserifsc/NotoSerifSC[wght].ttf',
      'ofl/notoserifsc/OFL.txt',
      'ofl/notoseriftc/NotoSerifTC[wght].ttf',
      'ofl/notoseriftc/OFL.txt',
      'ofl/cinzel/Cinzel[wght].ttf',
      'ofl/cinzel/OFL.txt',
    ])
    for (const sha of files.values()) expect(sha).toMatch(/^[0-9a-f]{64}$/)
  })

  it('读出一级字表登记；第 3 类白名单只登记扩展的 4 个自绘图标', () => {
    expect(parseLevel1Registration(dataSources)).toMatch(/^[0-9a-f]{64}$/)
    expect([...parseRegisteredAssets(dataSources).keys()]).toEqual([
      'apps/poe2-extension/public/icons/icon-16.png',
      'apps/poe2-extension/public/icons/icon-32.png',
      'apps/poe2-extension/public/icons/icon-48.png',
      'apps/poe2-extension/public/icons/icon-128.png',
    ])
  })

  it('缺节、缺提交号或哈希格式不对时抛错', () => {
    expect(() => parseFontSources('# 别的登记\n')).toThrow('界面字体与素材')
    const noCommit =
      '# 界面字体与素材（2026-09-28 登记）\n\n## 字体源文件\n\n| 上游路径 | SHA-256 |\n|---|---|\n'
    expect(() => parseFontSources(noCommit)).toThrow('固定提交')
    const badSha = `# 界面字体与素材（2026-09-28 登记）\n\n## 素材白名单（第 3 类）\n\n| 路径 | SHA-256 |\n|---|---|\n| \`a.png\` | \`xyz\` |\n`
    expect(() => parseRegisteredAssets(badSha)).toThrow('a.png')
  })

  it('段落范围止于下一个一级标题：后面的登记不被误读', () => {
    const md = `# 界面字体与素材（2026-09-28 登记）\n\n## 素材白名单（第 3 类）\n\n| 路径 | SHA-256 |\n|---|---|\n| \`a.png\` | \`${SHA_A}\` |\n\n# 别的登记\n\n| \`b.png\` | \`${SHA_B}\` |\n`
    expect([...parseRegisteredAssets(md)]).toEqual([['a.png', SHA_A]])
  })
})

describe('素材白名单（spec §8.6）', () => {
  it('repo 模式按路径与哈希同时判定', () => {
    expect(
      classifyAsset(
        { path: 'packages/ui-theme/fonts/serif-sc-0.woff2', sha256: SHA_A },
        whitelist,
        'repo',
      ),
    ).toBe(1)
    expect(
      classifyAsset(
        { path: 'apps/site/public/serif-sc-0.woff2', sha256: SHA_A },
        whitelist,
        'repo',
      ),
    ).toBeNull()
    expect(
      classifyAsset({ path: 'apps/site/public/favicon.svg', sha256: SHA_B }, whitelist, 'repo'),
    ).toBe(2)
    expect(
      classifyAsset({ path: 'apps/site/public/other.svg', sha256: SHA_B }, whitelist, 'repo'),
    ).toBeNull()
    expect(
      classifyAsset({ path: 'apps/site/public/og.png', sha256: SHA_C }, whitelist, 'repo'),
    ).toBe(3)
    expect(
      classifyAsset({ path: 'apps/site/public/og.png', sha256: SHA_A }, whitelist, 'repo'),
    ).toBeNull()
  })

  it('dist 模式只比 SHA-256', () => {
    expect(
      classifyAsset({ path: 'assets/serif-sc-0-Ab12.woff2', sha256: SHA_A }, whitelist, 'dist'),
    ).toBe(1)
    expect(classifyAsset({ path: 'favicon.svg', sha256: SHA_B }, whitelist, 'dist')).toBe(2)
    expect(classifyAsset({ path: 'assets/og-x.png', sha256: SHA_C }, whitelist, 'dist')).toBe(3)
    expect(classifyAsset({ path: 'assets/x.png', sha256: SHA_A }, whitelist, 'dist')).toBeNull()
  })

  it('woff、ttf、otf 恒为 null，即使哈希在白名单里', () => {
    for (const ext of ['woff', 'ttf', 'otf']) {
      for (const mode of ['repo', 'dist'] as const) {
        expect(
          classifyAsset(
            { path: `packages/ui-theme/fonts/x.${ext}`, sha256: SHA_A },
            whitelist,
            mode,
          ),
        ).toBeNull()
      }
    }
  })

  it('assertAssets 列出不合格文件的路径与哈希；assertFontSetEquals 要求集合相等', () => {
    expect(() => assertAssets([{ path: 'x.png', sha256: SHA_A }], whitelist, 'dist')).toThrow(
      `x.png  ${SHA_A}`,
    )
    expect(() => assertFontSetEquals([SHA_A], whitelist)).not.toThrow()
    expect(() => assertFontSetEquals([], whitelist)).toThrow(SHA_A)
    expect(() => assertFontSetEquals([SHA_A, SHA_B], whitelist)).toThrow(SHA_B)
  })

  it('assertFontSetEquals 不要求网站产物含扩展弹窗子集；网站产物里出现它则拒绝（扩展 0.3.2）', () => {
    expect(POPUP_FONT_FILE).toBe('serif-sc-popup.woff2')
    const withPopup: Whitelist = {
      ...whitelist,
      fontShards: new Map([
        ['serif-sc-0.woff2', SHA_A],
        [POPUP_FONT_FILE, SHA_B],
      ]),
    }
    expect(() => assertFontSetEquals([SHA_A], withPopup)).not.toThrow()
    expect(() => assertFontSetEquals([SHA_A, SHA_B], withPopup)).toThrow(SHA_B)
    expect(() => assertFontSetEquals([], withPopup)).toThrow(SHA_A)
  })

  it('L1 注入衬线子集常量；assertFontSetEquals 对扩展两片都豁免，网站产物里出现任一片即拒绝（扩展 0.4.0）', () => {
    expect(L1_FONT_FILE).toBe('serif-sc-l1.woff2')
    expect(L1_FONT_FAMILY).toBe('PoE2 Serif SC L1')
    expect(L1_FONT_BUDGET).toBe(131_072)
    expect(EXTENSION_FONT_FILES).toEqual([POPUP_FONT_FILE, L1_FONT_FILE])
    const withExtension: Whitelist = {
      ...whitelist,
      fontShards: new Map([
        ['serif-sc-0.woff2', SHA_A],
        [POPUP_FONT_FILE, SHA_B],
        [L1_FONT_FILE, SHA_C],
      ]),
    }
    expect(() => assertFontSetEquals([SHA_A], withExtension)).not.toThrow()
    expect(() => assertFontSetEquals([SHA_A, SHA_C], withExtension)).toThrow(SHA_C)
    expect(() => assertFontSetEquals([SHA_A, SHA_B], withExtension)).toThrow(SHA_B)
  })

  it('loadWhitelist 读 coverage.json、母题生成物与第 3 类登记', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ui-theme-whitelist-'))
    try {
      const coveragePath = join(dir, 'coverage.json')
      const dataSourcesPath = join(dir, 'data-sources.md')
      await writeFile(
        coveragePath,
        JSON.stringify({ shards: [{ file: 'serif-sc-0.woff2', sha256: SHA_A }] }),
      )
      await writeFile(
        dataSourcesPath,
        `# 界面字体与素材（2026-09-28 登记）\n\n## 素材白名单（第 3 类）\n\n| 路径 | SHA-256 |\n|---|---|\n| \`apps/site/public/og.png\` | \`${SHA_C}\` |\n`,
      )
      const loaded = await loadWhitelist({ coveragePath, dataSourcesPath })
      expect([...loaded.fontShards]).toEqual([['serif-sc-0.woff2', SHA_A]])
      expect([...loaded.registered]).toEqual([['apps/site/public/og.png', SHA_C]])
      const favicon = readFileSync(join(REPO_ROOT, 'apps/site/public/favicon.svg'))
      expect(loaded.motifSvgs.get('apps/site/public/favicon.svg')).toBe(sha256(favicon))
      expect([...loaded.motifSvgs.keys()]).toEqual([
        'packages/ui-theme/src/generated/favicon.svg',
        'packages/ui-theme/src/generated/logo.svg',
        'packages/ui-theme/src/generated/knot-full.svg',
        'apps/site/public/favicon.svg',
      ])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
