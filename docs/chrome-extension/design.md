# 新版 CoE 简体中文扩展设计与文件安排

状态：2026-09-24 原设计与 0.1.0 实施对照。下方目录保留责任规划，不表示每个拟定文件已创建；当前实际目录以仓库为准。

0.1.0 使用 `scripts/build.mjs` 的 Vite JS API 完成两个入口，无独立 vite.config.ts；检查脚本为 `scripts/check.mjs`。小型候选与预览 UI 暂随控制器维护，settings 合并于 platform，资源加载在启动入口；新增 `content/stat-layer.ts` 保留 CoE 关键词并叠加译文。`item-core/text` 为独立文本入口。未创建空文件占位，独立诊断出口与自制图标留待后续。

## 一、设计选择

采用现有 pnpm monorepo 中的独立 Chrome 扩展应用。扩展负责显示和输入适配，原站负责制作、计算、模拟与保存。无需自建服务端、权重库或制作引擎。既有网站不迁移、不删改。

选 Manifest V3 内容脚本，默认隔离执行环境。首版不设置后台 service worker、不加远程代码执行、不覆盖 fetch／XHR、不读取站点内部 JavaScript 状态或下载其数据文件。若原生 DOM 事件不足以驱动某个控件，先记录不兼容原因并单独评估该控件方案，不默认注入 MAIN world。

Chrome 为首个验收环境；Edge 可后续独立验收。构建工具优先复用仓库 Vite／TypeScript 的既有版本，应用需要的开发依赖显式声明，不依赖 pnpm 的隐式提升；不引入扩展框架或新增生产依赖。构建脚本输出固定名称的内容脚本及自包含资源，Chrome 不需访问开发服务器。

## 二、拟新增目录

```text
apps/poe2-extension/
  package.json                 独立版本与 build/typecheck/package/check 脚本
  tsconfig.json                浏览器环境类型检查
  vite.config.ts               内容脚本独立 IIFE 构建；popup 作为另一构建入口
  vitest.config.ts             DOM 回归环境与测试范围
  manifest.json                MV3 源清单；版本与 package.json 构建时核对
  popup.html                   工具栏设置入口
  public/icons/                自制扩展图标，不复制原站标识
  scripts/
    build.mjs                  顺序构建内容脚本、popup，合并输出，不互相清空
    build-dictionary.mjs       既有词典 → 扩展专用裁剪资源与来源元数据
    check-package.mjs          清单、权限、入口、离线资源和产物大小检查
    package.mjs                将 dist 打包为发行 ZIP
  src/
    content/index.ts           单次启动、启停、页面切换后的生命周期
    content/observer.ts        增量 DOM 观察、批处理和卸载
    content/text-layer.ts      原文／译文所有权、翻译与安全恢复
    content/page-labels.ts     新版介绍页伪元素徽标的可撤销样式（0.1.16已实现）
    content/search-controller.ts  组词、候选选择、原站查询同步
    content/import-controller.ts  粘贴、转换预览、诊断和用户提交
    adapters/coe-beta/
      context.ts              PoE2／英文模式及支持页面检测
      selectors.ts            所有站点相关 DOM 定位与特征校验
      regions.ts              允许翻译的区域、属性及排除区域
      search.ts               基底／词缀／材料等具体搜索控件适配
      import.ts               新版原站导入入口及事件适配
    ui/candidate-list.ts      键盘可操作的中英候选列表
    ui/import-panel.ts        原文、转换结果、未识别行和提交按钮
    ui/content.css            扩展浮层的隔离样式
    popup/index.ts            开关、显示模式和本地诊断出口
    popup/popup.css           设置面板样式
    settings.ts               storage.local 配置、默认值与格式升级
    platform.ts               最小 Chrome API 封装及测试替身接口
    dictionary.ts             加载打包资源、版本校验、失败回退
    diagnostics.ts            本地聚合漏译；不保存用户完整装备或备注
  tests/fixtures/             自造的最小 DOM 与装备文本
  tests/*.test.ts             适配器、生命周期、输入、导入与打包测试
  dist/                      生成的可加载扩展，不入库
  artifacts/                 生成的 ZIP 与构建报告，不入库

packages/l10n-core/
  package.json
  tsconfig.json
  src/types.ts                术语身份、领域、来源、命中与歧义类型
  src/dictionary.ts           国服术语索引、去重、版本与来源检查
  src/display.ts              英文文本及数字模板 → 国服简体显示
  src/search.ts               中文／混合输入 → 英文候选
  src/index.ts                不依赖 DOM／Chrome 的公共接口
  src/*.test.ts               词义、数字位置、领域过滤与歧义回归

data/l10n/
  coe-beta/ui.zh-CN.json      自写站点界面译文；不混入游戏术语表
  aliases.zh-CN.json          人工维护的国服别名及明确身份
```

以上为责任划分，不为每个小函数创建文件；实现时只在对应阶段创建实际需要的文件。生成词典放在扩展 `dist/assets/`，不复制一份手工维护的 `data/dict`。

## 三、现有文件的复用与修改边界

| 路径 | 安排 |
| --- | --- |
| `data/dict/zh-CN/` 与各表元数据 | 继续作为国服术语输入，英文键与稳定身份优先；不从 zh-TW 补译 |
| `packages/build-core/src/` | 评估复用数字模板／文本匹配纯函数，不导入整条 `.build` 处理流程 |
| `packages/item-core/src/parse.ts`、`resolve.ts`、`export.ts` | 实施前确认实际导出接口，复用解析与身份核对；新增适配不绕过既有未知行保护 |
| `packages/item-core/src/index.ts` | 按需暴露纯文本能力；不让扩展打包制作目录和规则引擎 |
| 根 `package.json`、锁文件 | 实施时增加 `extension:build/check/package` 命令并显式登记既有版本开发工具 |
| `pnpm-workspace.yaml`、`vitest.config.ts` | 当前通配符已覆盖新包；仅在实际构建／测试需要时修改 |
| `.gitignore` | 实施时忽略扩展 artifacts；现有 dist 规则已覆盖产物 |
| `.github/workflows/` | 实施时增加扩展产物验证／附件；不将扩展 ZIP 部署成 Cloudflare 页面 |
| `apps/build-l10n/` 与制作规则 | 保持独立，复用修正要通过既有回归；不增加模拟机制 |

依赖方向：扩展 → `l10n-core`（术语）；扩展 → `item-core`（文本）；核心包不得反向依赖扩展或站点选择器。`item-core` 不依赖 CoE DOM，站点特殊输入格式留在扩展适配器。

## 四、三个用户流程

### 页面显示

识别英文 PoE2 页面 → 加载国服资源 → 在已识别区域翻译文本节点及明确允许的 title／aria-label／placeholder → 观察新增节点与原站改值。游戏术语、数字模板和界面文案分开匹配；不改 DOM 业务属性、ID、链接、数字、概率、费用、输入值或原站存档。

用 WeakMap 保存每个节点最新的原站文本和本次扩展写入值。恢复时仅回退仍由扩展持有的译文；原站已重写的文本不被旧值覆盖。观察器排除自己的浮层、去重更新，并在关闭时断开观察与移除监听。翻译后的文本若参与原站检索／复制，应在适配器中隔离显示层，不能只为“看起来中文”破坏功能。

显示模式为“简体”和“中英对照”，保留随时关闭功能。未知文本保持英文；歧义术语不猜译。长句逐模板匹配，不用全页面 innerHTML 替换，不调用在线机器翻译。

扩展内开关负责立即恢复；通过 Chrome 扩展管理页禁用／卸载后，既有页面可能需要刷新才能完全恢复，安装说明须明确此区别，不依赖失效的内容脚本执行清理。

### 中文搜索

只对确认用途的搜索框接管中文查询；价格、备注、流程名称、代码和普通编辑框不处理。`compositionstart` 到 `compositionend` 期间保持原输入；组词结束后用控件领域检索国服词典。

唯一明确匹配：保留用户中文查询状态，将英文查询交给原站；多个匹配：列出中英候选，键盘上下／回车选择、Escape 取消；无匹配：原样保留并说明未识别。不将多个英文名简单拼成原站不支持的查询语法。别名与部分匹配只产生候选，不将近似命中当成确认身份。

原站输入框承担英文执行值，扩展候选／提示保留中文查询供继续编辑；须处理清空、替换、粘贴、连续组词与光标。每次查询带序号，丢弃过期候选。站点适配器负责提交所需事件并等待可见结果；不以设置 value 或发出事件作为成功证据。

### 装备导入

在原站导入流程提供“简体装备转换”入口：用户粘贴 → 复用高级文本解析 → 逐行反查英文 → 显示歧义与未知 → 预览 → 用户提交给原站。原文保持可取回；交易备注不进入提交文本，不能静默删除有语义的装备行。

新适配器按原站文本能力验收，不能沿用旧模拟器的制作资格来拒绝可翻译文本，也不能直接取消旧 `bridgeText` 的保护。咒符／传奇可翻译和对照；是否可在 CoE 导入或制作由原站能力决定，扩展不承诺可修改。

默认在原站导入框提交，避免把完整装备放入 URL 历史；公开 eimport URL 仅作用户主动选择的备用出口。固有、复合词缀、范围、破裂、工艺、亵渎、技能、品质、孔位和腐化分别建验收样例；未通过的结构明确诊断，不冒充完整导入成功。无需权重和真实游戏制作实验来证明纯文本转换，但必须证明身份和值保留。

## 五、权限、来源与站点边界

- manifest 静态匹配仅 `https://beta.craftofexile.com/*`，默认顶层 frame；运行时再次检查 PoE2，不能仅看 URL 参数，因为切换游戏／本地设置也可能改变上下文。
- 只请求 `storage`。不申请 `<all_urls>`、cookies、history、webRequest、clipboardRead；用户主动粘贴，无后台剪贴板监听。不为未知将来功能预加权限。
- 词典随包发布；无远程脚本、云翻译、遥测或词典在线抓取。若通过扩展 URL 读取词典，仅将所需 JSON 声明为针对 Beta 域的 web-accessible resource，不暴露其他文件。
- storage.local 只保存开关、显示模式和有界聚合诊断；完整装备、网页全文、私人备注不持久化。诊断只记录可确认的公共界面模板与计数，导出前用户预览。
- 非英文模式提示切回 English；不静默改用户站点设置。PoE1、旧站或无法确认上下文时不进行游戏术语和输入替换。
- 游戏数据沿用已登记来源和灰区开关；UI 译文为本项目人工编写，来源标记为 manual。CoE 页面只参考交互，不复制其代码、语言包或权重文件。

## 六、维护与发布

站点选择器集中维护，用“页面特征＋区域＋控件用途”定位；选择器失效时停止该控件适配，保留原站可用性并提示兼容性问题。不得以扫描所有输入框代替适配。

扩展独立版本从 0.1.0 起，包清单与 manifest 一致；站点版本、词典快照、浏览器版本和验收日期分别记录。Chrome 原生安装与发布包检查是验收门槛，页面中执行一段脚本只能算原型验证。新增其他站点时沿用核心和设置，单独新增适配器及权限评估，不预建插件市场或通用网页翻译引擎。


### 新版介绍页补充（0.1.16）

开场介绍保留每个原有文本、链接和强调节点，只在`/whats-new`的`main .messageBox`中应用人工片段译文，不替换HTML。区域上下文进入显示缓存；历史导航与DOM更新会重新核对上下文。模块徽标使用空span的CSS伪元素，由`page-labels.ts`提供限定页面和结构的样式，启停由现有设置生命周期管理；离开页面、关闭翻译或切换对照时撤下旧样式。其原始class、内容和业务属性不变。
