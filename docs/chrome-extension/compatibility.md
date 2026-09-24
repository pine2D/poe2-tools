# 新版 CoE 接入与覆盖记录

调查日期：2026-09-24。目标入口为 `https://beta.craftofexile.com/whats-new` 所述 **Craft of Exile 2**；该页面未提供可用于锁定构建的版本号。浏览器为 Linux HeadlessChrome 151.0.0.0。只观察公开 DOM 与可见结果，不读取 CoE 源码或词缀库。

## 接入约定

模式来自 `#gameToggler a.poe2.selected`，语言来自 `#languageToggler .list [key="us"].active`，两者都须唯一。导航后 URL 可能没有 `game=poe2`，因此不凭 URL 参数判断。只允许 Beta 精确域名。

| 页面／用途 | 公开控件 | 已观察行为 | 范围 |
|---|---|---|---|
| 首页基底搜索 | `#searchItemInput input[type=text]` | value + input 不足以稳定出结果；keyup 后异步出现 Runed Focus 与 Runeforged Runed Focus | 已接入中文候选，选择后可进入制作页 |
| 制作词缀搜索 | `#searchInput input[type=text]` | keyup 后 Lightning Resistance 只显示对应词缀；中文候选回填英文模板后结果相同 | 已接入 |
| Data 物品搜索 | `#dataItemSearchInput input[type=text]` | keyup 后出现 Runed Focus 等候选 | 已接入；最终 ZIP 实装中文选择返回同一对基底 |
| Data 词缀搜索 | `#dataModSearchInput input[type=text]` | 控件存在，使用相同适配器 | 0.1.2 最终 ZIP 实装：选择 lightning_resistance 标签后，中文候选与英文查询的 68 条结果标识及顺序一致 |
| 材料检索 | 未确认独立稳定文本框 | 制作方式中的 Essences 未出现可单独核实的材料输入控件 | 不接入，避免把条件编辑器当材料搜索 |
| 高级装备导入 | `dialog #importerInput`、`.importCommitButton` | 原站接受用户点击 Proceed 后读取文本 | 接入独立中文预览与主动回填；覆盖见下文 |
| Inventory | `dialog#inventoryDialog` | Reset／Import／Export／Close；背包标签名属于用户文本 | 按钮可翻译，标签区排除 |
| Simulator | 原站 Simulator 按钮进入流程区 | 数值配置、标题、描述及流程节点存在 | UI 精确词条可翻译；输入框与描述不做查询替换；复杂节点流程验收待补 |

## 文本与原站语义

普通界面按文字节点精确匹配，不修改 HTML、链接或业务属性。输入、textarea、contenteditable、代码、广告、扩展区域和背包标签排除。切换原站语言／游戏模式后停用并恢复拥有的文本；未知模式不启用。

词缀 `.stat` 可能包含 CoE 自动插入的 `.keyword` 节点。它们保留原英文及悬浮交互，用旁边的 Shadow DOM 显示中文；不把词缀元素内的英文替换成中文。数字、`#`、`(16-20)`、高级 `18(16-20)` 范围按源文本保留。未匹配复杂分段／合并词缀仍是英文。

首页中文 `符文法器` 已在实际安装扩展中显示候选，选择 Runed Focus 后原站出现制作按钮，并可进入对应基底制作界面。词缀中文 `闪电抗性` 选择后输入值为 `#% to Lightning Resistance`，可见结果为对应的两条词缀组，与直接英文检索一致。

## 导入覆盖与待验收

扩展复用 `item-core/text` 的解析与文本对照；导入资格由扩展单独检查，不调用本机制作引擎。首批只放行 Runed Focus 的魔法／稀有普通前后缀，六类属性、范围和分组要求见安装文档。既有普通法器转接研究保留在 `docs/coe-focus-bridge-research.md`，不据此声称本扩展全流程已验收。

合成测试覆盖原文、分组、范围、未知行、缺阶级／范围、备注隔离、传奇、咒符、腐化和未验收类别。腰带、权杖、武器、防具、首饰以及复合／特殊来源词缀仍只对照，不放行自动回填。没有使用或提交用户私人装备样本。

扩展真实导入、设置持久化、语言切换、复制／导出和完整模拟链的最终结果在本页继续补录；未列为通过的项视为未验收，不能用单元测试数代替。

## 本轮实际扩展验收补录

- 安装 dist 中的 MV3 扩展运行，而非只用 eval 注入待测代码；真实 popup 操作关闭后现有制作页恢复 Crafting／Data／Import an item，扩展辅助节点为 0；本机 storage 记录 `enabled:false`。
- 自造稀有符文法器经“中文预览 → 填入英文 → 原站确认”导入成功：物等86、护盾属性81，护盾上限 `39(36-41)` 与闪电抗性 `17(16-20)%` 在装备卡中相符；对应中文 Shadow DOM 行实际可见。原站把自造名称显示为 New Item，不承诺保留稀有随机名称。
- 普通词缀表和装备卡的分段关键词均有中文叠加，不更改原词缀 textContent。原站同节点移动的回归已覆盖位置迁移、数值更新和关闭清理。
- 自动测试覆盖 malformed／重复普通属性、前后缀不符、明显异常阶级；该检查不是完整游戏合法性或数值推导引擎。
- 本轮仍未覆盖魔法装备、其他六词缀组合、真实 IME 操作、全部模拟流程、材料下拉框与 Data 词缀查询的完整实测。这些仍是后续验收任务。

- 六词缀自造稀有符文法器也完成同一导入流程：护盾39、冰霜伤害28%、魔力49、闪电抗性17%、魔力再生32%、混沌抗性14%，原站显示的范围和等阶与输入相符。
- 最终 ZIP 解压目录作为新扩展实际载入；Data 输入“符文法器”，选择后原站显示 Runed Focus 与 Runeforged Runed Focus 的对应简体基底卡。
- 词典共 6,559 条，SHA-256：`12cc14a6e46a76316b030487ec9ffba876c4a5cdd7a87b3dab1309e8e313d24c`。ZIP 约272 KiB，已通过压缩完整性检查。

- 原站语言从 English 切到 cn 后，扩展辅助节点为0；切回 English 后制作／数据导航恢复简体译文。扩展没有主动替用户修改原站语言。

后续返回制作页时出现 CDP 响应超时；无扩展对照会话随后亦出现导航超时，尚未归因，未将该次完整导航链标记通过。原站导出按钮后的剪贴板读取也超时，因此复制／导出的最终语义仍未验收。

## 自动验证与基线问题

扩展与术语核心：8 个测试文件、43 项通过；全仓类型检查、lint、构建、dict:check、craft:check 通过。dict:check 仍报告既有 zh-CN 13／zh-TW 17 项审计记录，不代表本轮新增或全部词条已人工复核。

默认 `pnpm verify` 的测试阶段出现旧大型制作界面超时和沙箱子进程 EPERM，因此不能报告全套 verify 通过。移出沙箱、将 CLI 默认超时提高到60秒后重跑全套；部分旧测试文件自行设定15秒等超时，仍存在失败。未修改的 main 分支亦复现 SerleCrafting.test.tsx 的两个15秒超时用例。扩展没有改动旧 UI、策略或制作规则；不为掩盖失败调高其文件内限时。

重跑全套在观察到 SerleCrafting 4项、AstridTargetRoutes 2项旧界面失败后停止（退出130），没有完整测试总数，不视为全套通过。开发预览仅提交独立分支，不合入 main；后续仍需处理基线测试与剩余浏览器验收。

## 发布分支与 CI 权限

GitHub 当前推送凭证缺少 workflow scope，含新增 `.github/workflows/extension.yml` 的推送被拒绝。完整提交 `f80341f` 保留在本地 `feat/coe-chrome-extension-ci-local`；可推送的 `feat/coe-chrome-extension` 仅排除该新增工作流，运行源码、测试、词典与已验证产物一致，未改写原提交。新增 CI 尚未在远端运行，不能报告 CI 通过。


## 0.1.2 最终包补验（2026-09-25）

- 将最终 ZIP 解压后作为真实扩展加载，PoE2 / English 下导航文字正常汉化。
- 首页输入“符文”，50 个候选中 ArrowUp 进入末项；Escape 后辅助面板为0，焦点回到原 INPUT，查询仍为“符文”。
- 再输入“符文法器”，将焦点移到“数据”链接，候选立即撤下且焦点留在该链接；进入 Data 正常。
- Data → 词缀，输入“闪电抗性”并选择 `#% to Lightning Resistance`。原站要求至少一个筛选项；选中 `lightning_resistance` 标签后显示68行。与直接英文查询比较，68条行标识和顺序一致。这里证明查询一致，不证明这些原站行全部属于当前游戏有效词缀。
- 发现 Data 结果行结构为 `.modifierTable .row > .label .text`，有 `.modValue`、`.range` 与 `.keyword` 子节点；不同于制作页 `.stat`，当前仍有分段英文。此为下一轮显示覆盖缺口，尚未接入，不能称 Data 全部中文化。
- 本轮扩展与核心9文件52项测试、扩展类型检查、Biome、构建及包检查通过。未重跑全仓旧制作 UI 测试。
