# 开发与维护

本文面向需要修改源码、构建或维护发布的开发者。直接使用工具请回到[项目首页](../README.md)；扩展的构建、发版和数据开关见[扩展开发指南](chrome-extension/development.md)。

## 项目与当前状态

项目使用 pnpm monorepo、TypeScript 和静态前端，不部署翻译服务端。Chrome 扩展是当前主线，构筑汉化继续可用；独立制作模拟器维持搁置，现有实现和回归保留。

2026-10-22，扩展与攻略阅读代码已通过 PR #1 合入 main（`4608705`），0.10.1 已作为开发预览发布。正文语义质量仍未通过既定门槛；工程、交互与语义结果分别记录。项目约束与工作区状态以 [CLAUDE.md](../CLAUDE.md) 为准。

## 本地启动与构建

需要 Node.js 24 或更高版本，以及根 `package.json` 指定的 pnpm 11.21.0。在仓库根目录运行：

```sh
pnpm install --frozen-lockfile
pnpm dev
```

`pnpm dev` 会同步词典、历史工坊数据、字体许可和已有扩展包，再启动网站；扩展包缺失时仍允许本地开发。若需要调试下载入口或构建网站，先生成扩展包：

```sh
pnpm extension:package
pnpm build
```

网站产物在 `apps/site/dist/`，扩展目录和 ZIP 在 `apps/poe2-extension/dist/`、`apps/poe2-extension/artifacts/`。只构建网站时可运行 `pnpm --filter @poe2-tools/site build`，同样要求已有扩展 ZIP。

## 验证

```sh
pnpm test:active
pnpm verify:active
pnpm verify
```

| 命令 | 用途 |
| --- | --- |
| `pnpm test:active` | 当前产品测试：构筑、扩展、共享界面与装备文本 |
| `pnpm verify:active` | 当前产品测试，加全仓类型、格式、打包发布闸门、构建与数据检查 |
| `pnpm verify` | 集成前完整门禁，与 CI 同构，包含冻结工坊与制作算法测试 |

日常门禁不运行 `packages/dict-builder` 的全部测试，也不覆盖 `packages/item-core` 的全部制作算法；修改这些包时先运行对应测试。集成或发布前运行完整 `pnpm verify`。真实网页、游戏内渲染和 Windows 输入法的结论须有对应环境的实际证据。

样本约定见[测试样本说明](../data/fixtures/README.md)，扩展迭代与故障排查见[验证说明](chrome-extension/validation.md)。

## 仓库地图

| 路径 | 职责 |
| --- | --- |
| `apps/site/` | 工具网站：构筑汉化、扩展介绍与下载、保留的历史工坊 |
| `apps/poe2-extension/` | Chrome 扩展：CoE 中文显示、搜索与装备文本转换、攻略阅读与划词 |
| `packages/build-core/` | 无 DOM 的 `.build` 解析、词典匹配与翻译管线 |
| `packages/item-core/` | 装备高级文本解析、逆向词典、CoE 转接与历史制作逻辑 |
| `packages/l10n-core/` | 扩展术语匹配核心，无 DOM 和 Chrome API |
| `packages/guide-core/` | 攻略文档契约、术语、保护、请求格式、核对与缓存身份 |
| `packages/dict-builder/` | 构建期词典与历史制作目录生成脚本 |
| `packages/ui-theme/` | 共享设计令牌、组件样式、母题与字体 |
| `data/dict/`、`data/l10n/` | 独立国服／台服词典与扩展专用译文数据 |
| `data/fixtures/` | 测试样本；自造样本入库，第三方本地样本不入库 |

网站中 `src/pages/` 放首页与扩展介绍，`src/features/` 放构筑与历史工坊，`src/shared/` 放共用控件和样式。更细的边界见 [CLAUDE.md](../CLAUDE.md#仓库地图)。

## 数据与样式维护

设计与实现分开核对：[PRODUCT.md](../PRODUCT.md) 记录能力事实，[DESIGN.md](../DESIGN.md) 记录已确认的 v4 目标及迁移前生产基线，[文案规则](ui-copy.md)约束用户可见文字。v4 尚未落地，不能把原型验证当成产品验收。

OpenDesign 的原地项目、impeccable 的读取范围、技能安装层级和 Git 归属见[设计工具与工作约定](design-skills.md)。本地原型与 HANDOFF 被忽略，正式规范保留入库；历史工坊保持冻结。

词典生成、来源登记、版本与覆盖率要求见 [CLAUDE.md](../CLAUDE.md#开发工作流) 和[数据源登记表](data-sources.md)。国服与台服独立生成，不能繁简互转补缺；不导入专有同行词库或游戏解包数据。

```sh
pnpm dict:check
pnpm craft:check
pnpm --filter @poe2-tools/site scan-css
```

样式扫描只供手动检查，不接入 `pnpm verify`：它按正则识别未引用令牌与未使用类名，会误报动态拼接的类名。历史工坊的 `legacy-*.css` 保持冻结，扫描到的旧样式不因此自动清理；`.pt-panel--card` 等模板拼接类也须核对调用方。

字体与母题生成、许可及产物要求见[共享界面包说明](../packages/ui-theme/README.md)。字体为自托管 Noto Serif SC/TC 与 Cinzel 分片，许可证随站提供，不依赖第三方字体请求。

## 网站部署

部署使用 GitHub Actions 与 Cloudflare Pages。推送 main 会在验证通过后部署网站，并发布同版本扩展附件；操作前须明确发布授权。

配置步骤、所需 GitHub Variables / Secrets 及 preview / production 区别见[Cloudflare 部署说明](website/deployment.md)。扩展版本、ZIP 摘要与 GitHub Release 约束见[扩展发版步骤](chrome-extension/development.md#发版步骤)。凭据只放仓库 Secrets，不写入源码或文档。

首次配置沿用直接上传方式：

1. 在 Cloudflare 控制台创建 Pages 项目，选择直接上传，不额外连接 Git 自动构建。
2. 在仓库 Settings → Secrets and variables → Actions 设置变量 `CF_PAGES_PROJECT`，以及 Secrets `CLOUDFLARE_API_TOKEN`（Cloudflare Pages: Edit 权限）、`CLOUDFLARE_ACCOUNT_ID`。
3. 获得发布授权后，推送 main，或手动运行 CI 并选择 preview / production。未配置项目变量时只跳过部署，验证仍执行；凭据缺失则部署失败。

## 进一步阅读

- [构筑文件格式](build-format.md)与[构筑汉化使用说明](build-l10n.md)。
- [装备高级文本格式与转接边界](item-text-format.md)。
- [扩展开发与验收入口](chrome-extension/development.md)。
- [网站阶段分组与排序验收](website/validation-2026-10-06.md)、[门户改版](website/redesign.md)与[设计语言记录](website/redesign-2026-09-design-language.md)。
- [游戏内真机走查清单](manual-qa-checklist.md)。
- [历史工坊能力记录](crafting-workbench-legacy.md)与[已搁置的制作路线](crafting-roadmap.md)。
