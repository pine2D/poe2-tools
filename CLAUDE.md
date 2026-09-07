# PoE2 Tools 开发指南

## 项目定位

poe2-tools 是《流放之路 2》（Path of Exile 2，PoE2）辅助工具集：pnpm monorepo，TypeScript 单语言，
纯静态前端 + 构建期脚本，不部署服务端。

第一个工具 `build-l10n`：汉化游戏官方 Build Planner 的 `.build` 文件（JSON，规范见
`docs/build-format.md`）。翻译对象是攻略作者写在 `additional_text` / `description` 里的备注文本
（惯例为"基底名 + 编号词缀行"），输出一份可直接放进 BuildPlanner 目录的中文 `.build`，并在浏览器里
提供中英对照预览。目标语言是简体中文（zh-CN，国服术语）与繁体中文（zh-TW，台服术语）两套独立译名
体系，不做繁简机器互转。

Path of Building（PoB）的 XML / 分享码不是首版输入；相关调研结论保留在本地
`docs/superpowers/research/`，日后作为扩展再立项。

当前状态：`packages/build-core` 与 `packages/dict-builder` 已实现；`data/dict/` 已有 zh-CN / zh-TW 的
词缀、天赋、升华、职业、槽位词典。物品基底 / 传奇 / 宝石的中文名（需 poe2db 页面桥接）与静态站
`apps/build-l10n` 尚未开始。更新本段时只写事实，不把"计划"写成"已完成"。

## 仓库地图

- `packages/build-core/`：纯 TypeScript、无 DOM。`.build` 无损解析与序列化、标记语法分词、
  词典匹配、翻译管线。浏览器与 Node 共用。
- `packages/dict-builder/`：Node 脚本（tsx 运行）。`cache.ts` 是唯一发网络请求的模块（按日缓存到
  `data/cache/`，`--offline` 复用）；`adapters/` 是"已解析 JSON → 词典类型"的纯函数；`build.ts` 编排并
  写 `data/dict/<locale>/`，`check.ts` 做结构校验、审计与覆盖率回归门禁。
- `apps/build-l10n/`：Vite + React 静态站。拖入或粘贴 `.build` → 对照预览 → 下载中文 `.build`。
- `data/dict/<locale>/`：生成的词典，入库并标注 generated；按表分文件（`stats.json`、`passives.json`、
  `ascendancies.json`、`classes.json`、`inventories.json`），来源等级记在每张表的 `_meta.tier`，灰区表可整体
  删除而不影响 primary 表；`meta.json` 记录各服版本、来源哈希、审计计数与覆盖率基线；`_review/` 是待人工复核清单。
- `data/dict/_overrides/`：手工三语表（升华、职业、槽位）与配置（`versions.json` 各服版本、
  `stat-order.json` 占位符顺序）。改这里 → 重跑 `pnpm dict:build`。
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
  审计计数与覆盖率，再用独立提交 `chore(dict): 更新词典至 <游戏版本>`。覆盖率下降需先查原因，不要直接
  `--allow-regression`。
- 涉及游戏内渲染的结论（中文是否显示、`name` 截断、国服客户端行为）必须来自真机；未验证就
  明确写"待验收"。
- 文档与用户可见文本用简体中文；标识符用英文；代码注释用简体中文。

## 常用验证命令

```bash
pnpm install --frozen-lockfile
pnpm verify        # typecheck + lint + test + build + dict:check，与 CI 同构
pnpm dict:build    # 联网生成词典（按日缓存；--offline 复用缓存；--allow-regression 放行覆盖率下降）
pnpm dict:check    # 入库词典的结构校验、审计与覆盖率回归比较
```

## 隐私与合规

- 不提交 `.env*`、令牌、本机绝对路径、`data/fixtures/local/`、`data/cache/`。
- 入库词典每个文件必须能追溯到 `docs/data-sources.md` 里的登记项；生成物文件头或
  `meta.json` 写明来源与游戏版本。
- 同类工具曾因抄袭同行代码与数据被 DMCA 整仓下架；不复制任何同类工具的代码或数据文件。
- 游戏内文本版权归 Grinding Gear Games 与腾讯；本仓库 MIT 许可只覆盖自有代码。

## 版本与发布

- Semantic Versioning 2.0.0；`CHANGELOG.md` 按 Keep a Changelog 维护（首个发布前创建）。
- `apps/build-l10n` 通过 GitHub Pages 发布静态站；词典随构建产物一起发布。
- 词典更新不单独发版；应用行为变化才升版本。

## 分支与提交规范

- `main` 保持可构建；开发分支用稳定可读的名字，经 PR 合入；禁止 force-push `main`。
- 提交采用 Conventional Commits 1.0.0：`<type>(<scope>): <简体中文摘要>`。
- type：`feat`、`fix`、`docs`、`test`、`refactor`、`perf`、`build`、`ci`、`chore`、`revert`。
- scope：`build-core`、`dict-builder`、`build-l10n`、`dict`、`data`、`docs`、`ci`；跨域时省略。
- 一次提交一个逻辑变更，含其测试与文档；只显式暂存本次文件，不用 `git add -A`。
- 破坏性变更用 `type(scope)!:` 并加 `BREAKING CHANGE:` footer。

## 完成标准

- 只报告本轮实际运行的验证及其输出；失败或跳过要说明原因。
- 大改动完成后对照 spec 检查范围、任务外复杂度、数据来源合规与隐私风险。
