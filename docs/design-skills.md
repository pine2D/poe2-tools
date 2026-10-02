# 设计技能

自 2026-10-02 起改为用户级安装，不再随本仓库安装或锁定提交；Claude Code 与 Codex 共用，由本机更新脚本跟随上游维护，不新增应用依赖。

| 技能 | 上游 | 安装方式 | 安装位置 |
| --- | --- | --- | --- |
| make-interfaces-feel-better | https://github.com/jakubkrehel/make-interfaces-feel-better | `npx skills add … -g` | `~/.agents/skills/make-interfaces-feel-better` |
| impeccable | https://github.com/pbakaus/impeccable | 官方 `npx impeccable install --global --no-hooks` | `~/.agents/skills/impeccable`；Claude 另有专用副本 `~/.claude/skills/impeccable` |

Impeccable 不启用自动编辑 hooks；它在本仓库生成的 `DESIGN.md`、`.impeccable/` 等设计上下文仍是项目文件，与技能安装位置无关。上游升级后如提示项目产物与新版本不一致，在本仓库运行 `$impeccable doctor` 核对。

日常优化顺序与项目适配原则见根目录 `DESIGN.md`。不机械套用营销页字体、动画或卡片建议：本项目的中文可读性、精确对照和高频操作效率优先。
