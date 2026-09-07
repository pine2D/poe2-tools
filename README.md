# poe2-tools

《流放之路 2》（Path of Exile 2）辅助工具集。TypeScript monorepo，纯静态前端，无服务端。

## 工具

| 工具 | 状态 | 说明 |
|---|---|---|
| `build-l10n` | 核心库与词典生成已完成（词缀 / 天赋 / 升华），物品与宝石中文名、界面未开始 | 汉化游戏官方 Build Planner 的 `.build` 文件：翻译备注文本里的基底名与词缀行，输出可直接放进 BuildPlanner 目录的中文 `.build`，并提供中英对照预览。支持简体（国服术语）与繁体（台服术语）。 |

## 快速开始

```bash
pnpm install --frozen-lockfile
pnpm verify
```

需要 Node 24 与 pnpm 11。

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

## 许可

代码采用 MIT 许可（见 `LICENSE`）。词典中的游戏文本版权归 Grinding Gear Games 及腾讯所有，
本项目与两者均无关联。数据来源与各自的许可状态见 `docs/data-sources.md`。
