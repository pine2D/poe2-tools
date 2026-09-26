# 仓库级设计技能

2026-09-26 安装，仅作用于本仓库，不改全局技能、不新增应用依赖。

| 技能 | 上游 | 固定提交 | 安装目录 |
| --- | --- | --- | --- |
| make-interfaces-feel-better | https://github.com/jakubkrehel/make-interfaces-feel-better | `35545ea1512ad59fa463e6b1f95ca9c052981fe6` | `.agents/skills/make-interfaces-feel-better` |
| impeccable | https://github.com/pbakaus/impeccable | `9d715cc4f5564a990ca8345abfdd5df6dc9b41c8` | `.agents/skills/impeccable` |

使用 skill-installer 的 GitHub 安装器，分别安装上游 `skills/make-interfaces-feel-better` 和 `.agents/skills/impeccable`，指定表中提交与本仓库 `.agents/skills` 为目标。按现有 `.gitignore`，安装目录仅在本地；新克隆需按上述路径重装。新一轮会话可发现这两个技能，本轮已直接读取使用。

Impeccable 使用上游手动复制安装方式：保留全部 reference、脚本与版本文件，不启用自动编辑 hooks。本次引擎仅缓存于临时目录。若 ZIP 提取丢失启动脚本执行位，可用 `sh .agents/skills/impeccable/scripts/impeccable context` 调用；引擎首次运行会下载对应版本。

日常优化顺序与项目适配原则见根目录 `DESIGN.md`。不机械套用营销页字体、动画或卡片建议：本项目的中文可读性、精确对照和高频操作效率优先。
