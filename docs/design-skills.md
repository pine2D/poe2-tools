# 设计工具与工作约定

状态核对：2026-10-23。v4 共享样式、弹窗、阅读侧栏、翻译设置、站点管理与 CoE 自有浮层已进入 0.11.0 本地候选；网站布局待迁移，公开版仍为 0.10.1。设计工具、技能和产品代码分别维护，不因安装工具而新增网站或扩展依赖。

## 规范入口

| 文件 | 职责 |
| --- | --- |
| [PRODUCT.md](../PRODUCT.md) | 用户、产品能力、来源与验收边界 |
| [DESIGN.md](../DESIGN.md) | 已确认的 v4 视觉与交互规范；单独标明迁移前生产基线 |
| [ui-copy.md](ui-copy.md) | 网站与扩展的文案规则 |
| [CLAUDE.md](../CLAUDE.md) | 工程、数据、字体、版本与操作授权约束 |
| [design-system-pre-v4.md](design-system-pre-v4.md) | 旧设计快照，只用于历史实现核对 |
| `docs/superpowers/design/poe2-tools-v4/` | OpenDesign 原型工作目录，本地保留，不入库 |
| `HANDOFF.md` | 本地会话交接，按日期读取，不代替正式规范或新授权 |

用户最新指令优先。产品事实按 PRODUCT 与实际发布／验收记录核对；设计目标按根 DESIGN；当前生产外观按源码和测试核对。旧代码不是撤回新设计的理由，设计稿也不是生产已完成的证据。

## OpenDesign 与 impeccable 的分工

两者在布局、配色、文案、动效和无障碍评审上有重叠；区别在于工作方式与上下文，不需要重复安装或连续运行两套完整设计流程。

| 工作 | 本项目用法 |
| --- | --- |
| 原型生成、查看、多页设计迭代 | OpenDesign 管理同一个原型项目和预览，已选定 v4 设计系统 |
| 生产代码实施与回归 | Codex／Claude Code 依据正式规范和原型，在已授权范围内实现并验证 |
| 界面评审、检查与局部精修 | impeccable 作为可选检查工具，服从项目已确认的设计，不重新选品牌或视觉方向 |
| 产品事实、正式设计与文案归档 | 维护上表中的仓库文档，不能只存在于某个工具的本机目录 |

同一轮由一个执行者修改一个目标，不让 OpenDesign 生成任务与直接编辑并发写同一文件。设计已确认时，不机械重做方向问答或套用营销模板。impeccable 的一般建议不能把钢蓝主按钮、直角控件、中文衬线和阶段表改回其他风格。

### OpenDesign 本机项目

- 项目名：`PoE2 Tools 改版 v4`；项目 ID：`b48d7ba9-a5a7-45ff-a924-f4e73e64a3ca`；绑定设计系统：`user:poe2-tools-v4`。这些是本机查找信息，其他开发环境不要求存在相同 ID。
- 浏览器工作台入口为 `http://127.0.0.1:7456/`。当前本机配置下 `localhost` 留给预览来源，不能用其 API 访问结果判断工作台正常；预览链接以工具实际返回为准。
- 项目以 folder 方式**原地导入** `docs/superpowers/design/poe2-tools-v4/`。OpenDesign、Codex 与 Claude Code 编辑的是同一份原型；不是工具自动维护的备份副本。
- `index.html` 为构筑／站点／阅读／弹窗演示，另有 `home.html`、`extension.html`、`coe.html`。其权限、下载和翻译操作为模拟。
- 已发布到本机设计系统库的文件另存于 `~/.local/share/open-design/design-systems/poe2-tools-v4/`。本次核对 `DESIGN.md`、`tokens.css` 与项目目录内容相同，但不是同一文件；不能假定原地编辑项目会自动同步该副本。
- 原型目录不在当前 OpenDesign 管理器的自动备份范围内；Git 忽略也不提供备份。大范围改稿前保留本地快照，不删除旧稿或另起一套活动主目录。
- 使用已接入的官方 CLI 登录路径；不恢复已卸载的 `maxritter/open-claude-design`，不修改官方客户端认证。

### 169 个条目是否已安装

2026-10-23 对本机 `open-design-v0.26.1` 的实际核对：MCP `list_skills` 成功返回 **169 个条目，全部标为 built-in**；安装目录 `skills/` 同样有 169 个 `SKILL.md`。它们随 OpenDesign 安装包带来，供 OpenDesign 发现和选用，没有全部另外安装进 Codex／Claude Code 的用户级技能目录。

其中 **85 个条目明确写着仅作目录介绍，完整脚本、素材和参考资料需另装上游包**，例如 `design-review`、`design-md`。因此“已加载 169 个条目”不代表 169 套上游完整工具均已安装或逐项验证。模板和设计系统另有目录，也不能混算成技能数。数量随 OpenDesign 版本变化；使用某项能力时再核对其文件、依赖和实际调用，不自动全量补装。

内置 `impeccable-design-polish` 自述为 inspired by Impeccable，提供 audit、critique、polish、animate、harden 等简化指令；它不等同于本机完整 impeccable 4.7.0 的检查器、上下文与维护工具。两者可择一承担本轮评审，不因名称相近同时运行。

## impeccable 的安装与项目文件

自 2026-10-02 起，外部设计技能采用用户级安装，由本机更新脚本维护，不随本仓库锁定或安装。以下为现行安装方式记录，不是要求每次执行的命令：

| 技能 | 上游 | 安装方式 | 安装位置 |
| --- | --- | --- | --- |
| make-interfaces-feel-better | https://github.com/jakubkrehel/make-interfaces-feel-better | `npx skills add … -g` | `~/.agents/skills/make-interfaces-feel-better` |
| impeccable | https://github.com/pbakaus/impeccable | `npx impeccable install --global --no-hooks` | `~/.agents/skills/impeccable`；Claude 专用副本为 `~/.claude/skills/impeccable` |

本次读取两端 SKILL.md 均为 4.7.0；执行 `context` 和只读 `doctor --json` 的是用户级 Codex 入口。`context` 在根目录列出了网站、扩展、共享 UI 三个候选，它们都继承根 PRODUCT／DESIGN，没有另一套子目录规范。后续检查具体表面时应在对应 workspace 执行，或传入明确目标；仓库文档整理不需要凭空选一个页面。

`doctor` 仅报告 workspace 继承根 PRODUCT 的提示，没有 schema 修复项，规则注册表可用。继承是预期行为，不能据此生成九份重复产品文档。需要注意：doctor 的通过不证明设计与实现一致，本次旧暖铜规范和 v4 的矛盾来自文件内容核对。

本仓库保持不启用自动编辑 hooks；本轮没有改动用户级安装或 hook 设置。`.impeccable/design.json` 侧车此前已按用户决定删除，本次没有重建。不要为了满足通用技能模板重新创建一份与 v4 并列的视觉权威。需要 live 面板等依赖侧车的功能时，再按届时明确需求生成与当前规范一致的派生文件。

## 同步与文件归属

1. 改设计时先在已有 OpenDesign 项目迭代；规则获用户确认后，同步根 DESIGN、相关文案规则和原型设计系统。尚未确认的试验不覆盖正式规范。
2. 本机发布的设计系统是另一份副本；需更新时使用 OpenDesign 的对应操作并核对文件，不假设自动同步。文档整理不隐式重新发布设计系统。
3. 生产迁移把目标值映射到 `packages/ui-theme`，保留现有尺寸、字体、许可与打包门禁。原型 token 别名不直接导入产品；完成哪一面就记录哪一面的实际验证。
4. 只有操作、颜色或字体等已确认规则变化才同步规范；某一页面的布局细节留在对应设计说明，避免所有工具维护一份巨型副本。

| 文件类别 | Git 处理 |
| --- | --- |
| PRODUCT、DESIGN、文案／流程文档、生产 token 和源码 | 入库；当前生产源码与 v4 目标的差异须明确标注 |
| HANDOFF、`docs/superpowers/` 下的原型、截图、调研与历史稿 | 忽略，本地保留；不能因此删除 |
| `.impeccable/config.local.json`、`.impeccable/questions/` | 本机覆盖配置与会话日志，精确忽略 |
| `.impeccable/config.json`、brief、评审记录、经需求生成的侧车 | 不整体忽略；如新增，先审查是否应共享及是否含本机信息 |
| OpenDesign 安装目录、用户数据与设计系统库 | 在仓库外，由本机工具维护，不复制进产品或 Git |

当前仓库没有 `.open-design/`，不为假定目录添加宽泛忽略规则，也不使用 `DESIGN.md`、`tokens.css` 等全局文件名忽略模式。
