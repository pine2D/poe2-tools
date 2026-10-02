# Chrome 扩展

当前施工以[工程教训与收敛约定](engineering-lessons.md)为准：导入改为通用文本转换，逐基底验收记录仅作回归证据。

2026-10-02：扩展源码已合入主树 `apps/poe2-extension`，0.2.0 为首个公开下载版：普通用户在[网站介绍页](https://poe2-tools.pine2d.com/extension/)下载预构建 zip，推送 main 后同一文件由 CI 发布到 [GitHub Releases](https://github.com/pine2D/poe2-tools/releases)（tag `ext-v<版本>`）；没有商店安装入口。支持范围、未验收部分见 [兼容性记录](compatibility.md)，使用细节与从源码构建见 [安装与使用](install.md)。六阶段完整路线尚未全部验收；Windows 原生输入法仍待对应环境验收。

## 产品目标

在成熟 PoE2 工具网站中直接使用国服简体中文：页面术语与操作文案可读，中文搜索能驱动原站查询，国服 Ctrl+Alt+C 装备文本可转换后导入。首站为 [CoE 新版介绍](https://beta.craftofexile.com/whats-new)所指的 Beta，实际制作入口为 [PoE2 模式](https://beta.craftofexile.com/?game=poe2)。新版 CoE 与游戏 PoE2 是两个不同维度，不将新版首页默认的 PoE1 当成目标。

用户实测：原站名为“简体中文”的选项实际显示繁体，并有大量英文遗漏。扩展以英文界面为基准，使用独立国服译名，不依赖原站繁体包、不做繁简转换。

本轮核心覆盖与集中验收见[发布准备记录](release-readiness.md)，其中区分实际通过与待验收项。

## 文档导航

| 文档 | 用途 |
| --- | --- |
| [设计与文件安排](design.md) | 包边界、目录、数据流、权限、失败行为 |
| [分阶段实施计划](plan.md) | 开发顺序、文件范围、验证及提交单元 |
| [验收清单](acceptance.md) | 真实 Chrome、动态页面、中文输入和导入验收 |
| [数据源登记](../data-sources.md) | 来源、风险、使用范围与构建期数据约束 |
| [原做装路线](../crafting-roadmap.md) | 已无限期搁置的历史，不作为扩展待办 |

## 范围与交付

- 首发支持桌面 Chrome、Manifest V3；产物为可加载的未打包目录和发行 ZIP。商店上架单独安排，不是当前已完成事项。
- 首个端到端验证使用法器，但正式首版不能将法器试点当成全部装备导入完成。按页面与文本结构记录覆盖和未支持项。
- 交付包括扩展包、国服术语资源及来源清单、安装说明、兼容性记录、隐私说明和验收结果。
- 暂不适配旧版 `www.craftofexile.com`、PoE1、手机浏览器或其他工具站。后续站点复用术语核心，单独写站点适配器。
- 原制作网站无限期搁置；共用解析／词典的必要修正可以继续，但不能借此重启制作引擎开发。

## 发版步骤

扩展版本号独立于网站，唯一来源是 `apps/poe2-extension/package.json`（`manifest.json` 须一致，构建时核对）。任何改变扩展产物的改动都会让 `pnpm verify` 的发布闸门失败，必须显式发版。会改变产物的有：

- 扩展源码与构建脚本（`apps/poe2-extension/`）、`packages/l10n-core`；
- `packages/item-core`：网站工坊与扩展共用，只为网站改它也会改变扩展 zip；
- 数据：`data/dict/zh-CN/items.json`、`stats.json`、`data/l10n/`、`data/craft/catalog.json`，以及根目录 `LICENSE`；
- 依赖与 `pnpm-lock.yaml` 升级：Vite、Rolldown 等构建链版本变化会改变 `content.js` 与弹窗资源。

只在 Linux（含 WSL）上发版：CI 在 Linux 上重新打包核对；Windows 原生检出若开启换行转换，数据文件的哈希会写进词典的 sources，产物随之不同。

1. 升版本：同时改 `apps/poe2-extension/package.json` 与 `manifest.json` 的 `version`（修复、词典与依赖更新升补丁位，新功能升次版本位）。
2. 在 `apps/poe2-extension/CHANGELOG.md` 顶部写 `## [<版本>] - <YYYY-MM-DD>` 一段；这个日期会写进 `release.json` 与 GitHub Release，写预计推送的日期。
3. 运行 `pnpm extension:release`：重新构建、打包并改写 `apps/poe2-extension/release.json`（版本、文件名、字节数、SHA-256、日期）。同一版本已记录另一份产物时会拒绝；只有日期不同时也会拒绝，并单独提示。该版本尚未推送发布时可用 `EXTENSION_RELEASE_AMEND=1 pnpm extension:release` 覆盖；已发布则只能再升版本——CI 的 verify 会比对 GitHub 上已发布的同版本附件，内容不同即失败。
4. 运行 `pnpm verify`，把 `release.json`、版本号与 CHANGELOG 和改动一起提交。
5. 推送 main（由用户执行）：CI 验证后部署网站，`/downloads/<文件>` 随站发布；部署成功后 `release-extension` job 创建 tag `ext-v<版本>` 与同名 GitHub Release（不标为 Latest），附件是同一个 zip。已有一致的 Release 则跳过，缺附件会补传，草稿、多余附件或内容不一致则失败，需要在 GitHub 上人工检查。推送含 `.github/workflows/` 改动时，HTTPS 令牌需要 `workflow` 权限（SSH 不受影响）。经 PR 合入时，分支里若有合并提交（例如扩展合入主线的 `feat/extension-release`），合并 PR 只能选“Create a merge commit”，或在 PR 的 CI 通过后本地快进推送；Squash 与 Rebase 会丢掉被合并分支的历史。

### 下线 gray 来源

`apps/poe2-extension/scripts/build.mjs` 的 `--no-gray` 会去掉所有 gray 来源的词条（poe2db 派生的物品名与石板名），primary 与 manual 来源不受影响。根脚本与 `extension:*` 都不传这个参数，而 `pnpm verify` 与 CI 每次都按扩展 `package.json` 的 `build` 脚本重建，所以一次性带参数构建过不了发布闸门。长期下线：

1. 把 `apps/poe2-extension/package.json` 的 `build` 脚本改为 `node scripts/build.mjs --no-gray`。
2. 按上面的步骤升补丁版本、在 CHANGELOG 写明去掉了哪些来源、运行 `pnpm extension:release`、`pnpm verify` 后一起提交。

只想在本机看效果时运行 `node apps/poe2-extension/scripts/build.mjs --no-gray`，不要拿它的产物发版。

## 已知证据与待验证项

CoE 开发者文档公开 `game=poe2&eimport=...`，没有公开 API。既有 `docs/coe-focus-bridge-research.md` 仅验收了部分普通法器导入，不能外推全部装备。上一轮隔离浏览器观察到基底搜索异步更新；填值后的即时快照不代表最终结果。现已实际装载扩展并核对首页基底检索、制作页词缀查询、中文导入和 popup 关闭恢复；并不等于所有搜索框、模拟流程或真实中文输入法均已验收。

安装、兼容性和隐私文档已提供；版本证据与剩余验收项分别记录。公开下载版能安装，不等于所有页面、装备格式与输入法都已验收。

## 施工入口

0.2.0 起为公开下载版；安装见 [安装与使用](install.md)，权限见 [隐私说明](privacy.md)，实测和未验收范围见 [兼容性记录](compatibility.md)。完整路线仍以 plan.md 为准，未勾选项不是已交付承诺。

阶段完成证据与下一轮施工顺序见 [阶段审计](stage-audit.md)。

权杖的原站输入、复合词缀与技能等级差异见[权杖导入核对](sceptre-import-audit.md)；不能将英文导入无报错等同于值完整保留。

迭代命令、样本格式门禁及包管理器故障排查见[验证说明](validation.md)。

Linux Fcitx5真实拼音输入的已验收路径及平台边界见[IME验收记录](ime-audit.md)。
