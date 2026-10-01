# @poe2-tools/ui-theme

PoE2 设计语言的共享样式包：令牌、母题「符文菱结」、组件 CSS 与自托管字体分片。私有内部包，不单独计版本；网站（`apps/site`）通过 workspace 依赖引用。

## 用法

页面入口先引入本包，再引入页面专属样式：

```ts
import '@poe2-tools/ui-theme/index.css' // 令牌、母题与组件
import '@poe2-tools/ui-theme/fonts.css' // 字体分片的 @font-face
```

`src/tokens.css` 是全站唯一的 `:root` 令牌块，只有深色，没有主题变体。其他导出：

| 导出 | 内容 |
|---|---|
| `@poe2-tools/ui-theme/motif` | 母题几何唯一源（`src/motif.ts`） |
| `@poe2-tools/ui-theme/selectors` | `SERIF_SELECTORS`：组件 CSS 里用衬线的选择器 |
| `@poe2-tools/ui-theme/compliance` | 合规判定（许可文件、素材白名单、CSS 外链），只在 Node 里用 |

## 层级规则摘要

- L3 沉浸：页头 `pt-header`、金属框 `pt-frame`（同一路由状态最多两扇、不嵌套、角饰最多 8 个）、金属主按钮 `pt-forge-btn`（每个路由状态最多一个，只用在规格白名单列出的位置）、构筑页的金属页签 `pt-tabs`、hero 标题与衬线。
- 游戏对象：名称牌 `pt-nameplate` 与译文提示框。
- L0 数据：对照行、表单、说明正文，一律平涂、系统无衬线、左对齐。
- 页面层不直接写衬线字体；需要衬线时做成本包的组件类，并登记到 `src/selectors.ts`（扩展介绍页的能力小标题 `pt-subhead` 即按此做法，M3 新增）。
- `pt-frame` 及其祖先不得设 `overflow: hidden`、`overflow: clip` 或 `contain: paint`；`z-index ≥ 3` 只属于角饰伪元素。
- 母题一律 `aria-hidden`；强制色彩下母题与颗粒隐藏，减少动态效果下取消下压与过渡。

## 生成物（勿手改）

| 命令 | 产物 | 说明 |
|---|---|---|
| `pnpm ui-theme:motif` | `src/generated/*`、`apps/site/public/favicon.svg` | 由 `src/motif.ts`、`src/noise.ts` 生成，不联网；`node packages/ui-theme/scripts/build-motif-css.mjs --check` 只比较不写 |
| `pnpm ui-theme:fonts` | `fonts/*` | 下载 `docs/data-sources.md` 登记的 google/fonts 固定提交的 6 个文件，校验 SHA-256 后切片；`node packages/ui-theme/scripts/build-fonts.mjs --offline` 只用缓存 |

两条命令都只手动运行，不进 `pnpm verify`；生成物与源是否一致由 `motif.test.ts`、`coverage.test.ts`、`fonts.test.ts` 把关。

- 新增衬线文案：先补 `scripts/shard0-text.txt`，再运行 `pnpm ui-theme:fonts`。
- 站点固定文案新增了字、`coverage.test.ts` 失败：运行 `pnpm ui-theme:fonts`，把 `fonts/` 的变更与文案放在同一个提交里。
- 词典更新后 `coverage.test.ts` 失败：先单独提交重新生成的字体分片，再提交词典；覆盖只增不减，旧词典在新分片下仍能通过。

## 字体许可

`fonts/` 下的分片是 Noto Serif SC、Noto Serif TC、Cinzel 的子集，以 SIL Open Font License 1.1 授权，项目的 MIT 许可不覆盖该目录。每个家族的许可全文在 `fonts/LICENSES/`，网站发布为 `/fonts/<Family>-OFL.txt`；来源、固定提交与哈希登记在 `docs/data-sources.md` 的“界面字体与素材”一节。
