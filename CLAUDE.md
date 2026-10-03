# PoE2 Tools 开发指南

## 项目定位

### 当前优先级（2026-09-24）

用户已将独立简体中文做装网站／自研完整制作模拟器计划无限期搁置；保留现有实现和回归，不再自动推进其权重、品质、特殊制作或路线研究。此决定不等于原目标完成，也不删除已有网站。新主线为 Chrome 扩展，首站仅支持 `beta.craftofexile.com` 新版的 PoE2 模式，以英文界面映射国服简体术语，同时支持中文搜索及高级装备文本转换。规划入口为 `docs/chrome-extension/README.md`。扩展源码已于 2026-10-02 合入主树 `apps/poe2-extension`，0.2.0 起随网站同一流程发布：网站 `/extension/` 提供预构建 zip 下载，推送 main 后同一文件由 CI 发布为 GitHub Release（tag `ext-v<版本>`）；未上架 Chrome 应用商店。具体通过／未测范围见 `docs/chrome-extension/compatibility.md`。未经实际浏览器验收不得扩大页面或装备兼容性声明；公开发行与源码、验收状态应分别说明。

poe2-tools 是《流放之路 2》（Path of Exile 2，PoE2）辅助工具集：pnpm monorepo，TypeScript 单语言，
纯静态前端 + 构建期脚本，不部署服务端。

第一个工具 `build-l10n`：汉化游戏官方 Build Planner 的 `.build` 文件（JSON，规范见
`docs/build-format.md`）。翻译对象是攻略作者写在 `additional_text` / `description` 里的备注文本
（惯例为"基底名 + 编号词缀行"），输出一份可直接放进 BuildPlanner 目录的中文 `.build`，并在浏览器里
提供中英对照预览。目标语言是简体中文（zh-CN，国服术语）与繁体中文（zh-TW，台服术语）两套独立译名
体系，不做繁简机器互转。

Path of Building（PoB）的 XML / 分享码不是首版输入；相关调研结论保留在本地
`docs/superpowers/research/`，日后作为扩展再立项。

当前状态：`packages/build-core`、`packages/dict-builder` 与 `apps/site`（0.6.0）已实现；`data/dict/` 已有 zh-CN / zh-TW 的
词缀、天赋、宝石、物品基底与传奇、升华、职业、槽位词典（宝石与物品名来自 poe2db 列表页，gray）。游戏内加载输出文件的真机验收待做。
更新本段时只写事实，不把"计划"写成"已完成"。

## 扩展工程收敛（2026-09-26）

遵循 `docs/chrome-extension/engineering-lessons.md`：扩展负责词典与文本转换，不再建立逐基底／词缀ID／等阶范围准入名单，不代替CoE判定游戏规则。已有实测记录用于回归，已知原站问题单独提示。按完整用户流程合并交付，避免零碎发版和无变化的重复验证。参考扩展仅学习结构，不复制专有代码或词库。

## 仓库地图

- `packages/build-core/`：纯 TypeScript、无 DOM。`.build` 无损解析与序列化、标记语法分词、
  词典匹配、翻译管线。浏览器与 Node 共用。
- `packages/dict-builder/`：Node 脚本（tsx 运行）。`cache.ts` 是词典构建唯一发网络请求的模块（按日缓存到
  `data/cache/`，`--offline` 复用）；界面字体源由 `packages/ui-theme/scripts/build-fonts.mjs` 手动下载（唯一另一处联网脚本）。
  `adapters/` 是"已解析 JSON → 词典类型"的纯函数；`build.ts` 编排并写 `data/dict/<locale>/`，`check.ts` 做结构校验、
  审计与覆盖率回归门禁。
- `packages/ui-theme/`：设计语言共享包 `@poe2-tools/ui-theme`（私有，不单独计版本）。`src/tokens.css` 是唯一的令牌块（只有深色）；
  `src/motif.ts`、`src/noise.ts` 是母题与颗粒的唯一源，`scripts/build-motif-css.mjs` 生成 `src/generated/`；`src/components/*.css`
  是 `pt-*` 组件样式（`switch.css`、`provenance.css` 只用于扩展弹窗）；`src/l1.css` 是 CoE 注入 UI 的 L1 样式，扩展内容脚本以 adoptedStyleSheets 挂进各 Shadow DOM；`fonts/popup.css` 是扩展弹窗只含 SC shard0 的字体声明；`scripts/build-fonts.mjs` 生成 `fonts/` 下的字体分片、`fonts.css`、`coverage.json` 与 `LICENSES/`；
  `scripts/compliance.mjs` 是许可文件与素材白名单判定的唯一实现。`fonts/` 与 `src/generated/` 是生成物：入库、不手改、Biome 排除。
- `apps/site/`：Vite + React 静态站。拖入或粘贴 `.build` → 对照预览 → 下载中文 `.build`。首页与扩展说明在 `src/pages/`，构筑和历史工坊在 `src/features/`；令牌与组件样式来自 `@poe2-tools/ui-theme`，页面专属样式在 `src/shared/styles/`，由各页面入口按级联顺序引入（历史工坊只引入冻结的 `src/features/craft/legacy-*.css`，不接入 ui-theme）。词典由 `scripts/sync-dict.mjs` 从 `data/dict/` 复制到 `public/dict/`（不入库）随站发布；`scripts/sync-fonts.mjs` 把字体许可文件与根目录 `NOTICE` 复制到 `public/fonts/`、`public/NOTICE.txt`（不入库）；`scripts/sync-extension.mjs` 按 `apps/poe2-extension/release.json` 把扩展 zip 复制到 `public/downloads/`（不入库）；测试用 happy-dom。
- `apps/poe2-extension/`：Chrome 扩展（Manifest V3，只申请 `storage` 权限，内容脚本只匹配 `https://beta.craftofexile.com/*`）。`scripts/build.mjs` 构建 `dist/`（content.js、popup 及其 SC shard0 字体、词典、LICENSE、NOTICE、NotoSerifSC-OFL.txt、图标），`scripts/check.mjs` 校验 manifest、产物白名单、字体许可与素材白名单，`scripts/generate-icons.mjs` 手动重新生成图标，`scripts/package.mjs` 打包到 `artifacts/`（不入库）。版本号独立于网站，唯一来源是该目录的 `package.json`（`manifest.json` 的 `version` 须一致，构建时核对）；发布记录 `release.json` 入库。
- `packages/l10n-core/`：扩展的术语匹配核心，纯 TypeScript、无 DOM、无 Chrome API；扩展运行时与打包校验共用。
- `data/l10n/`：扩展专用数据——`coe-beta/ui.zh-CN.json`（manual 界面译文）、`aliases.zh-CN.json`（manual 别名）、`coe-beta/tablets.zh-CN.json`（gray 石板名）；构建扩展时与 `data/dict/zh-CN/items.json`、`stats.json` 及 `data/craft/catalog.json`（名称对照）一起裁剪进 `assets/dictionary.json`。
- `data/dict/<locale>/`：生成的词典，入库并标注 generated；按表分文件（`stats.json`、`passives.json`、
  `gems.json`、`items.json`、`ascendancies.json`、`classes.json`、`inventories.json`），来源等级记在每张表的
  `_meta.tier`，灰区表可整体删除而不影响 primary 表；`meta.json` 记录各服版本、来源哈希、审计计数与覆盖率
  基线；`_review/` 是待人工复核清单。
- `data/dict/_overrides/`：手工三语表（升华、职业、槽位）与配置（`versions.json` 各服版本、
  `stat-order.json` 占位符顺序、`stat-winners.json` 同键冲突取舍）。改这里 → 重跑 `pnpm dict:build`。
- `data/fixtures/synthetic/`：自造的最小 `.build` 样本，入库。`data/fixtures/local/`：第三方
  导出的真实样本，只在本地，永不提交。
- `docs/build-format.md`：`.build` 格式速查与本仓库的翻译字段清单（权威来源：GGG 开发者文档
  Build Planner 一节）。
- `docs/data-sources.md`：数据源登记表（来源 / 覆盖 / 许可 / 风险等级 / 开关）。新增任何
  数据源前必须先在此登记。
- `docs/superpowers/`：research、specs、plans；本地保留，不入库（见 `.gitignore`）。

## 不可破坏的约束

- 输出的 `.build` 必须仍能被游戏加载：只改写 `additional_text` 与 `description` 的文本；
  `id`、`unique_name`、`inventory_id`、`level_interval`、`slot_x`、`slot_y`、`weapon_set`、
  `name`、`link` 以及所有未知字段原样保留。未启用翻译时，解析 → 序列化必须与输入语义等价
  （键、顺序、值全部不变）。
- 标记语法（`<red>{...}`、`<b>{...}`、`<rgb(r,g,b)>{...}`，可嵌套）原样保留，翻译只作用于
  标记内外的文本节点；花括号配对不能被破坏。无法解析的标记按纯文本透传。
- 未命中词典的行保留英文原文并在预览中标记；不做模糊猜测替换。
- 词典来源分三级并按表分文件：primary（官方交易站三服 API、GGG 官方数据导出、PoB2 仓库 MIT 数据）、
  gray（poe2db.tw 等无明确授权的来源）、manual（`data/dict/_overrides/` 手工表）；等级记在每张表的
  `_meta.tier`。灰区适配器必须带总开关、限速与标识性 User-Agent，能整体下线而不影响 primary 覆盖的功能。
- 禁止把专有或无授权数据文件放进仓库：「PoE2'说'中文」浏览器扩展（All Rights Reserved）、
  PoeCharm2 的 CSV（无 LICENSE）、PobTools-zh 数据包、任何客户端解包产物。只允许学习其结构。
- 不解包游戏客户端；不调用需要 OAuth 的 GGG API；官方交易站静态端点只在构建期抓取并缓存，
  用户浏览器里不向第三方站点发请求。
- zh-CN 与 zh-TW 词典平行生成，绝不用 OpenCC 之类工具互转填充空缺。
- 天赋与宝石表随游戏版本快照，`meta.json` 必须记录对应版本；不同版本的表不混用。
- 未经用户明确要求，不执行 commit、push、rebase、reset，也不创建或切换分支。

## 开发工作流

- 先读 `docs/build-format.md`、相关 spec、测试和调用方，再修改；bug 修在根因处。
- 只实现当前需求；优先标准库与已安装依赖，未经明确同意不新增生产依赖。
- 非平凡逻辑先写一个能复现问题的最小测试，再写最小实现。
- 保留工作树中的无关修改；不顺手格式化任务外文件。
- 新增数据源：先在 `docs/data-sources.md` 登记许可与风险等级，再写适配器。
- 词典更新：先按各服实际版本改 `data/dict/_overrides/versions.json`，运行 `pnpm dict:build`，检查日志里的
  审计计数与覆盖率。若 `packages/ui-theme` 的 coverage.test 因新名称字符失败，运行 `pnpm ui-theme:fonts`，先用独立提交
  `chore(ui-theme): 更新字体分片` 提交 `packages/ui-theme/fonts/`（覆盖只增不减，旧词典在这个提交下仍能通过测试），再用独立提交
  `chore(dict): 更新词典至 <游戏版本>` 提交词典；两个提交各自都要能通过 `pnpm verify`。覆盖率下降需先查原因，不要直接
  `--allow-regression`。`data/dict/zh-CN/items.json`、`stats.json`、`data/l10n/` 或 `data/craft/catalog.json` 的变化会改变扩展 zip，`pnpm verify` 的
  扩展发布闸门随之失败：在同一个 `chore(dict)` 提交里升扩展补丁版本（`apps/poe2-extension/package.json` 与 `manifest.json`），
  在 `apps/poe2-extension/CHANGELOG.md` 写一段“词典更新至 <游戏版本>”，运行 `pnpm extension:release` 并一起提交 `release.json`，
  保证该提交单独通过 `pnpm verify`。
- 涉及游戏内渲染的结论（中文是否显示、`name` 截断、国服客户端行为）必须来自真机；未验证就
  明确写"待验收"。
- 文档与用户可见文本用简体中文；标识符用英文；代码注释用简体中文。

## 常用验证命令

```bash
pnpm install --frozen-lockfile
pnpm verify        # typecheck + lint + test + 扩展打包与发布闸门 + build + dict:check + craft:check，与 CI 同构
                   # （扩展在 verify 里构建两次：extension:package 一次，根 build 递归一次，属预期）
pnpm extension:package       # 构建并校验扩展，打出可复现 zip（apps/poe2-extension/artifacts/，不入库）
pnpm extension:release-check # 核对 zip 与 apps/poe2-extension/release.json 一致（verify 内含）
pnpm extension:release       # 有意发版时运行：先升扩展版本、写扩展 CHANGELOG，再打包并改写 release.json
# 新克隆单独运行 pnpm build 或网站构建前，先 pnpm extension:package：网站构建要复制扩展 zip，缺包即失败
pnpm dev           # 本地启动静态站
pnpm dict:build    # 联网生成词典（按日缓存；--offline 复用缓存；--allow-regression 放行覆盖率下降）
pnpm dict:check    # 入库词典的结构校验、审计与覆盖率回归比较
pnpm ui-theme:fonts # 手动运行：联网下载固定提交的字体源，重新生成 packages/ui-theme/fonts/（不进 verify）
pnpm ui-theme:motif # 手动运行：由 motif.ts 重新生成母题 CSS 与 SVG（不联网，不进 verify）
```

## 隐私与合规

- 不提交 `.env*`、令牌、本机绝对路径、`data/fixtures/local/`、`data/cache/`。
- 入库词典每个文件必须能追溯到 `docs/data-sources.md` 里的登记项；生成物文件头或
  `meta.json` 写明来源与游戏版本。
- 同类工具曾因抄袭同行代码与数据被 DMCA 整仓下架；不复制任何同类工具的代码或数据文件。
- 游戏内文本版权归 Grinding Gear Games 与腾讯；本仓库 MIT 许可只覆盖自有代码。

## 版本与发布

- Semantic Versioning 2.0.0；`CHANGELOG.md` 按 Keep a Changelog 维护（首个发布前创建）。
- `apps/site` 通过 Cloudflare Pages 发布静态站（`.github/workflows/deploy.yml`，凭据在仓库 secrets）；词典随构建产物一起发布。
- 词典更新不单独发网站版本；网站行为变化才升网站版本。词典更新会改变扩展产物，扩展要随之发补丁版（见“开发工作流”的词典更新）。
- 扩展 `apps/poe2-extension` 版本独立于网站：唯一来源是它的 `package.json`（`manifest.json` 须一致，构建时核对），更新日志在
  `apps/poe2-extension/CHANGELOG.md`。入库的 `apps/poe2-extension/release.json` 是发布闸门：`pnpm verify` 与 CI 重新打包后核对
  版本、文件名、字节数与 SHA-256，不一致即失败。会改变扩展 zip 的改动：扩展源码、`packages/l10n-core`、网站与扩展共用的
  `packages/item-core`（只为网站改它也算）、`packages/ui-theme` 中扩展用到的部分（令牌、母题、弹窗组件、L1 样式、弹窗字体分片与 shard0 文案 `scripts/shard0-text.txt`、完整声明；只为网站改它也算）、扩展用到的数据、根目录 `LICENSE`、依赖与 `pnpm-lock.yaml` 升级（构建链版本）。
  有意发版：升版本 → 写扩展 CHANGELOG → `pnpm extension:release` → 提交；只在 Linux（含 WSL）上发版；
  步骤见 `docs/chrome-extension/README.md` 的“发版步骤”。
- 推送 main 触发网站部署（扩展 zip 随站发布在 `/downloads/`），部署成功后 `release-extension` job 创建 tag `ext-v<版本>` 与
  GitHub Release（附件是同一个 zip，不标为 Latest；已有一致的 Release 即跳过，缺附件补传，草稿、多余附件或内容不一致即失败）。
  CI 的 verify 还比对 GitHub 上已发布的同版本附件，内容不同即失败：已发布的版本只能升版本，不能 amend。
  推送由用户执行；推送含 `.github/workflows/` 改动时，HTTPS 令牌需要 `workflow` 权限（SSH 不受影响）。

## 分支与提交规范

- `main` 保持可构建；开发分支用稳定可读的名字，经 PR 合入；禁止 force-push `main`。
- 提交采用 Conventional Commits 1.0.0：`<type>(<scope>): <简体中文摘要>`。
- type：`feat`、`fix`、`docs`、`test`、`refactor`、`perf`、`build`、`ci`、`chore`、`revert`。
- scope：`build-core`、`dict-builder`、`build-l10n`、`dict`、`data`、`docs`、`ci`、`ui-theme`、`extension`；跨域时省略。
- 一次提交一个逻辑变更，含其测试与文档；只显式暂存本次文件，不用 `git add -A`。
- 破坏性变更用 `type(scope)!:` 并加 `BREAKING CHANGE:` footer。

## 完成标准

- 只报告本轮实际运行的验证及其输出；失败或跳过要说明原因。
- 大改动完成后对照 spec 检查范围、任务外复杂度、数据来源合规与隐私风险。
