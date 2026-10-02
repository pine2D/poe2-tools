// @vitest-environment node
import { readFile } from 'node:fs/promises'
import { expect, it } from 'vitest'
import { POPUP_LINKS, popupReferences, popupStyleExternal } from '../scripts/check.mjs'

const ASSETS =
  '<script type="module" crossorigin src="./assets/popup-a1.js"></script><link rel="stylesheet" crossorigin href="./assets/popup-b2.css">'
const UPDATE = `<a id="check-update" href="${POPUP_LINKS[0]}" target="_blank" rel="noopener noreferrer">检查更新</a>`

it('只接受包内 assets 资源与“检查更新”链接', () => {
  expect(POPUP_LINKS).toEqual(['https://poe2-tools.pine2d.com/extension/'])
  expect(popupReferences(`${ASSETS}${UPDATE}`)).toEqual([
    'assets/popup-a1.js',
    'assets/popup-b2.css',
  ])
})

it.each([
  ['<a href="https://example.com/">别处</a>', 'popup 含未登记的链接'],
  ['<a href="https://poe2-tools.pine2d.com/">首页</a>', 'popup 含未登记的链接'],
  ['<script src="https://cdn.example.com/x.js"></script>', 'popup 含外部资源'],
  ['<link rel="stylesheet" href="../secret.css">', 'popup 含外部资源'],
  ['<img src="./assets/logo.png">', 'popup 含外部资源'],
  ['<link rel="stylesheet" href=./assets/x.css>', 'popup 含无法识别的资源引用'],
  ['<img srcset="https://cdn.example.com/x.png 2x">', 'popup 含不允许的引用属性：srcset'],
  ['<form action="https://example.com/"></form>', 'popup 含不允许的引用属性：action'],
  ['<p style="background:url(https://cdn.example.com/x.png)">x</p>', 'popup 含内联样式引用'],
  // 属性名与等号之间、等号与引号之间有空白，或属性名前不是空白，同样要识别
  ['<script src = "https://cdn.example.com/x.js"></script>', 'popup 含外部资源'],
  ['<link rel="stylesheet" href = "https://cdn.example.com/x.css">', 'popup 含外部资源'],
  ['<a id="x"href="https://example.com/">别处</a>', 'popup 含未登记的链接'],
  ['<a/href="https://example.com/">别处</a>', 'popup 含未登记的链接'],
  [
    '<meta http-equiv="refresh" content="0;url=https://example.com/">',
    'popup 含不允许的引用属性：http-equiv',
  ],
  [
    '<link rel="preload" as="image" imagesrcset="https://cdn.example.com/x.png 2x">',
    'popup 含不允许的引用属性：imagesrcset',
  ],
  ['<svg><image xlink:href="https://cdn.example.com/x.png"/></svg>', 'popup 含外部资源'],
])('拒绝 %s', (html, message) => {
  expect(() => popupReferences(`${ASSETS}${html}`)).toThrow(message)
})

it('源码 popup.html 的链接都在名单里', async () => {
  const html = await readFile(new URL('../popup.html', import.meta.url), 'utf8')
  const links = [...html.matchAll(/<a\b[^>]*\shref="([^"]*)"/g)].map((match) => match[1])
  expect(links).toEqual(POPUP_LINKS)
})

it('弹窗样式里的 @import 与外部 url() 都被找出，包内与 data: 引用不算', () => {
  expect(
    popupStyleExternal(
      'a{color:red}b{background:url(./x.png)}c{background:url(data:image/png;base64,AA)}',
    ),
  ).toEqual([])
  expect(
    popupStyleExternal(
      '@import \'https://x.example/a.css\';a{background:url( "https://cdn.example.com/x.png")}b{background:url(//cdn.example.com/y.png)}',
    ),
  ).toEqual([
    "@import 'https://x.example/a.css'",
    'url( "https://cdn.example.com/x.png")',
    'url(//cdn.example.com/y.png)',
  ])
})
