# Changelog

本文件遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。
版本号对应仓库整体（根 `package.json`），`apps/build-l10n` 与之同步；`build-core` / `dict-builder` 是私有内部包，不单独计版本。仓库私有，暂不提供版本比较链接。

## [Unreleased]

### Added

- 词缀匹配增加 reduced / increased 对调回退：交易站词典只登记 increased 形式，攻略里 `25% reduced Attribute Requirements` 这类写法现在按对调后的模板命中，译文表述词一并对调（zh-CN 提高→降低，zh-TW 增加→減少）；英文或译文里表述词不唯一时仍按未命中处理。

## [0.1.0] - 2026-09-09

### Added

- `build-l10n` 静态站：拖入 / 选择 / 粘贴官方 Build Planner `.build` 文件，按 zh-CN（国服术语）或 zh-TW（台服术语）翻译备注里的基底名、传奇名与编号词缀行；槽位 / 宝石 / 天赋左英右中对照预览，未命中行高亮与覆盖率；下载中文 `.build`（多文件打 zip）；输出缩进跟随输入、文件名保持原名。
- 可选：传奇名注入（默认开）、双语模式（默认关）。
- 词典（词缀、天赋、宝石、物品基底与传奇、升华、职业、槽位）随站发布，浏览器零第三方请求。
