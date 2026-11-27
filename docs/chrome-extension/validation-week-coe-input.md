# CoE 双语候选回搜与高级装备转换核验

## 公开页面上的旧版复现

维护者在干净 Chromium 中加载扩展 0.12.0，打开 PoE2 英文首页，输入“水晶法器”。候选按钮的可访问名称为“水晶法器，Crystal Focus”。将整条名称输回同一个搜索框，面板显示“未找到术语”。仅把全角逗号换成空格，就能查到三项。[CoE Beta 的 PoE2 英文首页](https://beta.craftofexile.com/?game=poe2&language=us)

同一入口输入“鹿角法器”会出现 Antler Focus 和 Staghorn Focus 等分支。原样回搜“鹿角法器，Antler Focus”在旧版也没有候选。这三个英文基底名及其中文对照均能在现有国服词典中查到，扩展用同一条记录的中文名、全角逗号和英文名生成按钮的可访问名称。[国服基底词典](../../data/dict/zh-CN/items.json) · [候选按钮实现](../../apps/poe2-extension/src/content/search-controller.ts)

## 两个 ZIP 的离线对照

在各自独立的 happy-dom 文档中运行 0.12.0 和 0.12.1 ZIP 内的 `content.js`，从各自的包内加载完整词典。两个词典逐字节一致，各含 12,681 条记录。搜索框、导入框和装备文本均为本轮自造。下表的数量取自扩展实际生成的候选按钮。

| 搜索框输入 | 0.12.0 包内回放 | 0.12.1 包内回放 |
| --- | --- | --- |
| 水晶法器，Crystal Focus | 0 项 | 1 项，Enter 填入 Crystal Focus |
| 鹿角法器，Antler Focus | 0 项 | 1 项，Enter 填入 Antler Focus |
| 鹿角法器，Staghorn Focus | 0 项 | 1 项，Enter 填入 Staghorn Focus |
| 鹿角法器 | 保留分支，Enter 保留中文 | 保留分支，Enter 保留中文 |
| 水晶法器 Crystal Focus | 3 项 | 3 项 |
| 水晶法器，Staghorn Focus | 0 项 | 0 项 |

共用搜索按现有的大小写和空白规则比较整条按钮名称。条件下拉仍核对当前原生选项，材料价格框仍限定材料域。自动化用 60 个同中文名的自造条件验证过滤先于 50 项截断，并在原站选项改变后点击旧按钮，确认输入框保留原查询。另覆盖鼠标选择、部分名称、别名错配及名称中的逗号、千位分隔符、正号和百分号。[搜索实现](../../packages/l10n-core/src/search.ts) · [回归测试及自造样本](../../apps/poe2-extension/tests/public-coe-input.test.ts)

## 国服高级装备文本

两个 ZIP 的英文预览均保留了自造稀有水晶法器的物品等级 73 和前缀等阶 3。`+17(14-21) 魔力上限` 在英文栏显示为 `+17(14-21) to maximum Mana`。预览时原框保留中文，点击“填入英文到原站导入框”后内容与预览逐字一致，原站 Proceed 的点击次数为 0。

将基底换成“鹿角法器”，扩展提示存在多个英文候选。将数值换成 `+27(14-21)`，扩展提示数值超出原文范围。两种情况下，原文均保留，填入按钮禁用。

## 本地验证与待验收范围

产品工作树基线为 `bacc9f33`，验证和打包使用固定的 pnpm 11.21.0。先在 0.12.0 实现上单独运行新增测试，10 项中 6 项失败、4 项通过，三个完整基底标签都返回空列表。修复后的专项回归 14 个文件共 224 项通过，含全部 10 项新增测试、原有搜索与导入用例、扩展发布记录和网站的下载链接检查。

```bash
pnpm_config_verify_deps_before_run=false pnpm exec vitest run packages/l10n-core/src \
  apps/poe2-extension/tests/{public-coe-input,search,search-overlay,condition-empty,condition-labels,generic-import,advanced-import,import-controller,import-lines}.test.ts \
  apps/poe2-extension/tests/{manifest,release}.test.mjs apps/site/src/pages/extension/release.test.ts
```

`pnpm typecheck` 的 8 个工作区包通过，Biome 对 5 个改动的 TypeScript 和 JSON 文件检查通过。`pnpm extension:release` 生成 0.12.1 候选，再运行 `pnpm extension:package` 和 `pnpm extension:release-check`，两次均得到 7,372,846 字节，SHA-256 为 `95d0ae51cd13f253c365686db7b6f130407df1c1c5e030ee0c5988e451b363ef`。[候选发布记录](../../apps/poe2-extension/release.json)

真实浏览器证据来自维护者对 0.12.0 的复现。0.12.1 在上游窗口中的完整候选列表、选择后的原站结果和原站最终导入，留待宿主用该 ZIP 实测。本轮执行了上述专项检查，未运行全仓 `pnpm verify`。
