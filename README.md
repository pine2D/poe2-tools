# poe2-tools

《流放之路 2》（Path of Exile 2）辅助工具集。TypeScript monorepo，纯静态前端，无服务端。

## 工具

| 工具 | 状态 | 说明 |
|---|---|---|
| `build-l10n` | 0.2.0：核心库、词典与静态站界面已完成；游戏内加载待真机验收 | 汉化游戏官方 Build Planner 的 `.build` 文件：翻译备注文本里的基底名与词缀行，输出可直接放进 BuildPlanner 目录的中文 `.build`，并提供中英对照预览。支持简体（国服术语）与繁体（台服术语）。 |

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

## 目录

```
packages/build-core/    .build 解析、词典匹配、翻译管线（无 DOM）
packages/dict-builder/  词典生成脚本
apps/build-l10n/        静态站
data/dict/<locale>/     生成的词典（入库）
data/fixtures/          测试样本（synthetic 入库，local 不入库）
docs/build-format.md    .build 格式速查
docs/data-sources.md    数据源登记表
```

## 文档

- [`.build` 格式速查](docs/build-format.md)
- [数据源登记表](docs/data-sources.md)
- 开发规范见 [`CLAUDE.md`](CLAUDE.md)

## 字体与许可

`apps/build-l10n/public/fonts/Cinzel-subset.woff2` 是 [Cinzel](https://github.com/google/fonts/tree/main/ofl/cinzel)
的拉丁子集，随站自托管，浏览器不向任何第三方域名发字体请求（`fonts.googleapis.com` 与
`web.poecdn.com` 都是明令禁止的）。只用于英文眉标（`OVERVIEW` / `GEAR` / `GEMS` / `PASSIVES`）、
空态的三步罗马数字与覆盖率数字；中文一律使用系统字体，不引任何 CJK 网络字体。

授权为 SIL Open Font License 1.1，全文见同目录的 `OFL.txt`；本仓库的 MIT 许可**不覆盖**这个字体文件。

子集配方（重新生成时照此执行，产物应在 16 KB 上下）：

```bash
fonttools varLib.instancer Cinzel[wght].ttf wght=500:700 -o Cinzel-500-700.ttf
pyftsubset Cinzel-500-700.ttf \
  --unicodes="U+0020-007E,U+00A0,U+00B7,U+2013-2014,U+2022,U+2026" \
  --layout-features='kern,liga' --flavor=woff2 \
  --output-file=Cinzel-subset.woff2
```

## 许可

代码采用 MIT 许可（见 `LICENSE`）。词典中的游戏文本版权归 Grinding Gear Games 及腾讯所有，
本项目与两者均无关联。数据来源与各自的许可状态见 `docs/data-sources.md`。
