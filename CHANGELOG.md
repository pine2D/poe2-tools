# Changelog

本文件遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。
版本号对应仓库整体（根 `package.json`），`apps/build-l10n` 与之同步；`build-core` / `dict-builder` 是私有内部包，不单独计版本。仓库私有，暂不提供版本比较链接。

## [Unreleased]

### Added

- 词缀匹配增加 reduced / increased 对调回退：交易站词典只登记 increased 形式，攻略里 `25% reduced Attribute Requirements` 这类写法现在按对调后的模板命中，译文表述词一并对调（zh-CN 提高→降低，zh-TW 增加→減少）；英文或译文里表述词不唯一时仍按未命中处理。

### Changed

- `build-l10n` 界面第一期改版：样式表重写为分层设计令牌（暖近黑表面 + 发丝金描边 + 语义色与品牌金分家），正文基准字号 14→15px、左英右中对照区 11.9→14px，顶栏字标由内部包名 `build-l10n` 改为「PoE2 构筑汉化」并加中文副标题，「全部下载」与文件行「下载」升为主按钮，对照区改为一块面板加一条中缝。站点补 `description`、OG 与 Twitter 卡片字段、内联 SVG favicon（不新增任何网络请求）。

### Fixed

- `build-l10n` 窄屏（≤900px）下侧栏被主区挤成一条缝、拖放区看不见：窄屏改为整页文档滚动，并把断点从 1 档补到 1280 / 900 / 560 三档；新增 `:focus-visible` 焦点环、`prefers-reduced-motion` 与 `forced-colors` 兜底；解析错误文案对比度从 3.2:1 提到 5.5:1。

## [0.1.0] - 2026-09-09

### Added

- `build-l10n` 静态站：拖入 / 选择 / 粘贴官方 Build Planner `.build` 文件，按 zh-CN（国服术语）或 zh-TW（台服术语）翻译备注里的基底名、传奇名与编号词缀行；槽位 / 宝石 / 天赋左英右中对照预览，未命中行高亮与覆盖率；下载中文 `.build`（多文件打 zip）；输出缩进跟随输入、文件名保持原名。
- 可选：传奇名注入（默认开）、双语模式（默认关）。
- 词典（词缀、天赋、宝石、物品基底与传奇、升华、职业、槽位）随站发布，浏览器零第三方请求。
