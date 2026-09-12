# poe2-tools

《流放之路 2》（Path of Exile 2）辅助工具集。TypeScript monorepo，纯静态前端，无服务端。

## 工具

| 工具 | 状态 | 说明 |
|---|---|---|
| `build-l10n` | 已发布 0.3.0；当前工作区已实现原灰阶工作台（内容分区、对照/译文、待核对筛选与定位），尚未发布；游戏内加载与真机走查待验收 | 汉化游戏官方 Build Planner 的 `.build` 文件：翻译备注文本里的基底名与词缀行，输出可直接放进 BuildPlanner 目录的中文 `.build`，并提供中英对照预览。支持简体（国服术语）与繁体（台服术语）。 |

## 快速开始

```bash
pnpm install --frozen-lockfile
pnpm verify
```

需要 Node 24 与 pnpm 11。

## 使用 build-l10n

```bash
pnpm dev            # 本地启动静态站（先把 data/dict 同步到 apps/build-l10n/public/dict）
pnpm --filter @poe2-tools/build-l10n build   # 产物在 apps/build-l10n/dist
```

浏览器里拖入或粘贴 `.build` 文件 → 选目标语言 → 查看对照预览 → 下载。所有处理都在浏览器本地完成，不上传文件。

### 部署到 Cloudflare Pages

1. 在 Cloudflare 控制台新建 Pages 项目（直接上传类型，不连接 Git）。
2. 仓库 Settings → Secrets and variables → Actions：
   - Variables：`CF_PAGES_PROJECT` = Pages 项目名
   - Secrets：`CLOUDFLARE_API_TOKEN`（权限 Cloudflare Pages: Edit）、`CLOUDFLARE_ACCOUNT_ID`
3. 推送到 `main`（或手动触发 `deploy` workflow）。变量未设置时 workflow 自动跳过。令牌只放 GitHub secrets，不写进仓库任何文件。

### 样式的死代码扫描

```bash
pnpm --filter @poe2-tools/build-l10n scan-css
```

扫两类东西：`src/styles/*.css` 里定义了但没有任何 `var()` 引用的设计令牌，以及写了样式但没有任何
`.tsx` 用到的类选择器。**不接进 `pnpm verify`**——它靠正则匹配，对「字符串拼出来的类名」和
「只被别的 CSS 规则消费的 modifier」会误报，当成门禁只会让 CI 变吵。改完样式、或删组件之后手动跑
一次即可；有发现时退出码是 1，输出里逐条列出名字。

已知误报（跑一次会看到，不是死代码）：`.filelist__status--ok` / `--error` / `--pending`
（`FileList.tsx` 用模板字符串 `` `filelist__status--${kind}` `` 拼出来，脚本只按整串字面量匹配）；
`.w3` / `.woff2`（分别来自内联 SVG 的 `www.w3.org` 命名空间地址和 `@font-face` 里的
`Cinzel-subset.woff2` 文件名，不是类选择器，被正则误判）。

## 目录

```
packages/build-core/    .build 解析、词典匹配、翻译管线（无 DOM）
packages/dict-builder/  词典生成脚本
apps/build-l10n/        静态站
data/dict/<locale>/     生成的词典（入库）
data/fixtures/          测试样本（synthetic 入库，local 不入库）
docs/build-format.md    .build 格式速查
docs/data-sources.md    数据源登记表
docs/manual-qa-checklist.md  真机走查清单
```

## 文档

- [`.build` 格式速查](docs/build-format.md)
- [数据源登记表](docs/data-sources.md)
- [真机走查清单](docs/manual-qa-checklist.md)
- 开发规范见 [`CLAUDE.md`](CLAUDE.md)

## 界面使用

导入攻略网站或作者提供的 `.build` 文件后，在文件区选择构筑，并按装备、技能、天赋分区查看。
“中英对照 / 译文”只改变阅读方式；下载文件是否保留英文，由右上角“设置”中的
“导出时保留英文原行”决定。“补充传奇装备中文名”默认开启。

待核对包含词缀未命中、基底名与传奇名未收录，自由备注保留原文、不算失败。
`N` 定位下一项、`F` 切换筛选，输入期间不触发快捷键。
当前文件下载在构筑标题旁，批量下载在文件区，同名文件打包时自动加序号避免覆盖。

界面使用系统无衬线字体，支持深色、浅色和跟随系统，不加载第三方字体。

## 许可

代码采用 MIT 许可（见 `LICENSE`）。词典中的游戏文本版权归 Grinding Gear Games 及腾讯所有，
本项目与两者均无关联。数据来源与各自的许可状态见 `docs/data-sources.md`。
