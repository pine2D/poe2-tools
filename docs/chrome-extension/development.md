# 扩展开发与维护

普通用户请阅读[扩展介绍](README.md)与[安装和使用](install.md)。仓库环境和通用命令见[项目开发指南](../development.md)。

## 当前基线（2026-10-23）

v4 界面迁移已通过 [PR #2](https://github.com/pine2D/poe2-tools/pull/2) 以合并提交 `93763c5` 合入 main；main CI 的 verify、deploy / pages、release-extension 全部成功。[0.11.0](https://github.com/pine2D/poe2-tools/releases/tag/ext-v0.11.0) 已通过网站与 GitHub Release 公开分发，定位为开发预览，未上架 Chrome 应用商店；网站同步部署 0.10.0。前一公开版本为 [0.10.1](https://github.com/pine2D/poe2-tools/releases/tag/ext-v0.10.1)（扩展、CoE 修复及攻略阅读代码经 [PR #1](https://github.com/pine2D/poe2-tools/pull/1) 合入 main，`4608705`）。`feat/v4-ui-migration` 已合并并删除，后续统一使用主工作区 main。

`apps/poe2-extension/release.json` 是产物核对依据。已发布的同版本 ZIP 不得替换内容；后续改变扩展包须升版本并更新发布记录。

0.11.0 包含 v4 共享样式、弹窗、阅读侧栏、翻译设置、站点管理与 CoE 自有浮层；四批界面复盘及第二轮用户裁定后的修正见[v4 界面复盘](../validation-2026-10-23-v4-ui-retrospective.md)。证据见 [v4 弹窗验收](validation-2026-10-23-v4-popup.md)、[阅读侧栏与站点验收](validation-2026-10-23-v4-reading-sites.md)和[CoE 浮层验收](validation-2026-10-23-v4-coe-overlays.md)。完整 `pnpm verify` 以 CI 为准；本地完整门禁超时经诊断为宿主 CPU 吞吐波动，本地结果不作放行依据，见[完整门禁记录](../validation-2026-10-23-v4-integration.md)。

工程与阅读交互已通过对应门禁，旧整段语义质量失败结论保持。0.5.0 与 0.6.0 的付费质量周期已结束，封存、重复和最终付费浏览器未因后续 UI 改进而自动重启；不可复用旧剩余额度。具体证据见[发布与验收状态](release-readiness.md)和[兼容性记录](compatibility.md)。

## 从源码构建

仓库根目录运行：

```sh
pnpm install --frozen-lockfile
pnpm extension:package
```

产物是 `apps/poe2-extension/dist/`（可直接“加载已解压的扩展程序”）与 `apps/poe2-extension/artifacts/poe2-extension-<版本>.zip`。zip 只存储不压缩，条目顺序与时间固定，同一份源码打出的 SHA-256 相同；`pnpm extension:release-check` 核对它与入库的 `release.json` 一致。发版步骤见 [发版步骤](#发版步骤)。Chrome 不能把这个 ZIP 当商店安装包直接安装。

## 发版步骤

扩展版本号独立于网站，唯一来源是 `apps/poe2-extension/package.json`（`manifest.json` 须一致，构建时核对）。任何改变扩展产物的改动都会让 `pnpm verify` 的发布闸门失败，必须显式发版。会改变产物的有：

- 扩展源码与构建脚本（`apps/poe2-extension/`）、`packages/l10n-core`、`packages/guide-core`；
- `packages/item-core`：网站工坊与扩展共用，只为网站改它也会改变扩展 zip；
- `packages/ui-theme` 中扩展用到的部分：令牌（含尺寸阶梯）、母题、弹窗组件、L1 样式、弹窗字体子集与弹窗衬线文案 `scripts/popup-text.txt`、侧栏固定标签子集 `serif-sc-guide` 与 `scripts/guide-text.txt`、注入衬线字体子集 `serif-sc-l1` 及其收字来源（`data/l10n/coe-beta/ui.zh-CN.json` 全部译文、`apps/poe2-extension/src/content/*.ts` 与 `src/provenance.ts` 的中文文案）、完整声明，只为网站改它也会改变扩展 zip。收字来源出现新字时 `packages/ui-theme` 的 coverage.test 会失败：运行 `pnpm ui-theme:fonts --offline` 重新生成（`serif-sc-l1` 超过 131,072 字节时脚本以退出码 4 终止），与扩展版本放进同一提交；
- 数据：`data/dict/zh-CN/` 的 items/gems/passives、`data/dict/zh-TW/items.json`、`data/l10n/stats/` 两服原始词缀、`data/dict/_overrides/` 职业/升华、`data/l10n/`（含攻略术语、CoE 界面和裁决）、`data/craft/catalog.json`，以及根目录 `LICENSE`；
- 依赖与 `pnpm-lock.yaml` 升级：Vite、Rolldown 等构建链版本变化会改变 `content.js` 与弹窗资源。

只在 Linux（含 WSL）上发版：CI 在 Linux 上重新打包核对；Windows 原生检出若开启换行转换，数据文件的哈希会写进词典的 sources，产物随之不同。

1. 升版本：同时改 `apps/poe2-extension/package.json` 与 `manifest.json` 的 `version`（修复、词典与依赖更新升补丁位，新功能升次版本位）。
2. 在 `apps/poe2-extension/CHANGELOG.md` 顶部写 `## [<版本>] - <YYYY-MM-DD>` 一段；这个日期会写进 `release.json` 与 GitHub Release，写预计推送的日期。推送日晚于这个日期时，推送前把日期改成实际推送日，再运行 `EXTENSION_RELEASE_AMEND=1 pnpm extension:release`（产物不变，只改日期）。
3. 运行 `pnpm extension:release`：重新构建、打包并改写 `apps/poe2-extension/release.json`（版本、文件名、字节数、SHA-256、日期）。同一版本已记录另一份产物时会拒绝；只有日期不同时也会拒绝，并单独提示。该版本尚未推送发布时可用 `EXTENSION_RELEASE_AMEND=1 pnpm extension:release` 覆盖；已发布则只能再升版本——CI 的 verify 会比对 GitHub 上已发布的同版本附件，内容不同即失败。同一个尚未推送的版本在功能分支上分几个提交改动产物时：第一个提交运行 `pnpm extension:release`，之后每个改动产物的提交都运行 `EXTENSION_RELEASE_AMEND=1 pnpm extension:release`，`release.json` 与改动放在同一提交；中间提交不能单独推上 main，否则会以半成品发布该版本，之后只能再升版本。
4. 运行 `pnpm verify`，把 `release.json`、版本号与 CHANGELOG 和改动一起提交。
5. 推送 main（由用户执行）：CI 验证后部署网站，`/downloads/<文件>` 随站发布；部署成功后 `release-extension` job 创建 tag `ext-v<版本>` 与同名 GitHub Release（不标为 Latest），附件是同一个 zip。已有一致的 Release 则跳过，缺附件会补传，草稿、多余附件或内容不一致则失败，需要在 GitHub 上人工检查。推送含 `.github/workflows/` 改动时，HTTPS 令牌需要 `workflow` 权限（SSH 不受影响）。经 PR 合入时，分支里若有合并提交（例如扩展合入主线的 `feat/extension-release`），合并 PR 只能选“Create a merge commit”，或在 PR 的 CI 通过后本地快进推送；Squash 与 Rebase 会丢掉被合并分支的历史。

### 下线 gray 来源

`apps/poe2-extension/scripts/build.mjs` 的 `--no-gray` 会去掉所有 gray 来源的词条（poe2db 派生的物品名与石板名，以及攻略词典中的宝石与天赋名（`gems.json`、`passives.json`）），primary 与 manual 来源不受影响。根脚本与 `extension:*` 都不传这个参数，而 `pnpm verify` 与 CI 每次都按扩展 `package.json` 的 `build` 脚本重建，所以一次性带参数构建过不了发布闸门。长期下线：

1. 把 `apps/poe2-extension/package.json` 的 `build` 脚本改为 `node scripts/build.mjs --no-gray`。
2. 按上面的步骤升补丁版本、在 CHANGELOG 写明去掉了哪些来源、运行 `pnpm extension:release`、`pnpm verify` 后一起提交。

只想在本机看效果时运行 `node apps/poe2-extension/scripts/build.mjs --no-gray`，不要拿它的产物发版。

## 本机检查数据开关

只想在本机看关闭 gray 数据的效果时运行：

```sh
node apps/poe2-extension/scripts/build.mjs --no-gray
pnpm extension:check
```

然后加载 `apps/poe2-extension/dist/`。关闭后基底／传奇名覆盖会减少，依赖其识别的装备导入也不可用。不要接着运行 `package.mjs`：它会用另一份内容覆盖 `artifacts/` 里同版本的 zip，网站构建与 `pnpm extension:release-check` 随之失败；误跑后运行 `pnpm extension:package` 恢复。长期下线按 [下线 gray 来源](#下线-gray-来源) 的步骤发版。

此开关按词典表的来源等级移除数据，不是“仅使用官方译文”模式。自写界面标签、完整用途说明和手工别名仍保留，其中部分术语曾参考社区资料，来源见 `docs/data-sources.md`。0.1.70 实测从6916条降为4928条，移除1988条gray词条；这些数字仅对应当时快照。关闭后输入缺失的中文基底名会显示未找到术语提示，不自动猜译。

### 打包前的词典校验

`extension:check` 和 ZIP 打包入口会用浏览器同一套 `createLexicon` 校验实际产物词典，包括身份、来源、数字模板及数值顺序。无效词典会阻止打包，不以资源文件存在代替可加载性。检查时利用已有 Vite 在 Node 进程内编译核心，不写入扩展目录，也不增加浏览器权限或依赖。该检查不能代替完整测试与实站验收。

## 自制图标维护

`apps/poe2-extension/public/icons/`保存16、32、48、128像素的原创PNG，自有MIT许可适用，图形是设计语言母题的 gem 符号（核心菱环 + 扩展青宝石）。构建直接复制入库PNG。仅在母题或配色改变时重新生成：运行`CHROME_PATH=<本机 Chrome> node apps/poe2-extension/scripts/generate-icons.mjs`，四个尺寸各自渲染，不需要 Python，也不新增依赖。生成后把四个文件的 SHA-256 更新到`docs/data-sources.md`的“素材白名单（第 3 类）”，否则包检查会拒绝。生成器不使用外部字体或图片，未进入扩展包。

## 开发与验证边界

- 站点适配遵循[工程教训](engineering-lessons.md)：扩展负责词典与文本转换，不重建游戏规则，不建立逐物品准入名单。
- 日常命令、样本格式门禁及包管理器故障排查见[验证说明](validation.md)。集成前完整运行 `pnpm verify`。
- 当前用户流程、未测项与历史浏览器证据以[兼容性记录](compatibility.md)为准。旧包或隔离浏览器的通过不能外推为新版全站、Windows 输入法或真实译文质量通过。
- 制作网站保留原生输入与数据；“英文回填成功”不代表原站接受或数值完全保真。权杖的技能等级差异见[导入核对](sceptre-import-audit.md)。
- 新增来源先登记[数据来源与许可](../data-sources.md)；不复制原站规则文件、专有扩展代码或词库。
- 界面中文字、字体、共享包和词典都可能改变 ZIP；发布影响范围见 [CLAUDE.md](../../CLAUDE.md#版本与发布)。

## 当前版本证据

| 记录 | 内容 |
| --- | --- |
| [发布与验收状态](release-readiness.md) | 0.11.0 与 0.10.1 的工程基线、公开发行与未完成事项 |
| [v4 弹窗与共享样式](validation-2026-10-23-v4-popup.md) | 0.11.0 第一批（记录时为本地候选）的实际弹窗、跨界面冒烟与工程门禁 |
| [v4 CoE 自有浮层](validation-2026-10-23-v4-coe-overlays.md) | 第三批双语候选、装备步骤、语言提示、字体后备与原站实际导入 |
| [v4 阅读侧栏、设置与站点](validation-2026-10-23-v4-reading-sites.md) | 第二批字体隔离、真实侧栏、合成阅读流程和站点授权／删除验收 |
| [v4 界面复盘](../validation-2026-10-23-v4-ui-retrospective.md) | 四批真实界面复盘、问题清单、修正与复验，含第二轮用户裁定与实施 |
| [侧栏紧凑布局](validation-2026-10-22-sidebar-compact.md) | 阅读密度、键盘与窄窗口 |
| [范围与空态](validation-2026-10-22-scope-selection.md) | 保存服务后的章节子集、零选择与重名章节 |
| [阅读重构与自动划词](validation-2026-10-21-reading-010.md) | 0.10.0 对应的授权、侧栏与气泡流程 |
| [翻译质量失败记录](validation-2026-10-20-bridge.md) | 真实服务对照、语义错误与停止条件 |
| [中文输入验收](ime-audit.md) | Linux Fcitx5 已测路径与平台边界 |
| [阶段审计](stage-audit.md) | 早期覆盖记录与当时的剩余项 |

## 设计与历史验收索引

| 文档 | 用途 |
| --- | --- |
| [0.9.0 跟进验收](validation-2026-10-21-followup.md) | 多气泡、译文术语和 CoE 漏译及导入边界 |
| [0.9.0 跟进契约](translation-followup-090.md) | 对应迭代五项需求、实施顺序与验收边界 |
| [0.8.0 工作区验收](validation-2026-10-21-workspace.md) | 对应迭代侧栏、原位、划词、CoE 与工程证据 |
| [0.8.0 实施契约](reading-workspace.md) | 用户批准选择、顺序及后台边界 |
| [阅读体验验收](validation-2026-10-21-reading.md) | 0.7.0 本地候选的浏览器、工程结果与未测范围 |
| [阅读与范围契约](guide-reading.md) | 对应迭代范围预览、原文位置、页内对照、格式及缓存门禁 |
| [衔接契约](translation-bridge.md) | 对应迭代数据、路由、语境缓存、预算与停止条件 |
| [设计与文件安排](design.md) | 包边界、目录、数据流、权限、失败行为 |
| [分阶段实施计划](plan.md) | 开发顺序、文件范围、验证及提交单元 |
| [验收清单](acceptance.md) | 真实 Chrome、动态页面、中文输入和导入验收 |
| [数据源登记](../data-sources.md) | 来源、风险、使用范围与构建期数据约束 |
| [词缀翻译契约](translation-contract.md) | 原始模板、共用匹配、冲突诊断与扩展覆盖门禁 |
| [原做装路线](../crafting-roadmap.md) | 已无限期搁置的历史，不作为扩展待办 |

索引中的日期和版本标明证据范围，不把历史“待推进”条目自动列入当前任务；当前范围以用户授权和 [CLAUDE.md](../../CLAUDE.md) 为准。

## 商店草稿历史

2026-10-19 曾创建 0.5.0 的 Chrome 商店未发布草稿并取得固定扩展身份。该草稿不等于 0.11.0 或此前版本已送审或上架。草稿材料见[商店草稿记录](store-draft.md)，真实商店安装仍须在可分发后单独验收。
