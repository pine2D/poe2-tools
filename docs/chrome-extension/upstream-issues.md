# 原站问题复现记录

此文件保存本项目实测的上游问题，尚未向CoE作者发送。记录只证明指定环境、日期与操作下的现象；上游更新后应重新核对，不将旧问题永久写成限制。

## 复制模拟器步骤：读取 advancedRouter 时异常

状态：2026-09-25，全新无扩展浏览器可复现。

环境：Linux HeadlessChrome 151.0.0.0；Chrome扩展管理页的extensions-item数量为0；新版Beta，English／PoE2。原站异常指向 `packages/files/package_poe2.js?v=1790166276` 第1行（打包文件）。

复现步骤：

1. 打开 `https://beta.craftofexile.com/?game=poe2`。
2. 点击 Simulator，再点击 Add a step。
3. 点击新建的 Step 1 标题打开编辑页，无需配置动作或条件。
4. 点击 Copy，在 Copy a step 对话框中点击 Proceed。

预期：复制步骤并退出确认对话框。

实际：对话框仍打开，步骤数量仍为1；页面error事件报告：

```text
Uncaught TypeError: Cannot read properties of undefined (reading 'advancedRouter')
```

诊断仅安装临时error／unhandledrejection事件监听，没有调用CoE内部接口或修改复制方法。异常发生在原站打包脚本；未知对象为何缺失仍需上游排查。无扩展复现说明本扩展不是该现象的必要原因，不代表其他环境或所有复制场景都失败。

现有替代操作：使用 Add a step，手动选择动作与条件；0.1.24两步骤重试已按这种方式完成，详见compatibility.md。扩展不覆盖原站复制函数，不绕过确认，也不把这个动作标为已验收。


## 标准赛区硬核的自定义价格保存为 null

状态：2026-09-26，独立无扩展英文浏览器与0.1.82最终扩展包均复现。未向CoE作者发送，未覆盖原站实现。

环境：Linux Chrome 151（英文基线为HeadlessChrome），`https://beta.craftofexile.com/settings?game=poe2`，可见补丁Latest (Forbidden Rites - 0.5.5.3)，PoE2／us；使用新建测试配置，未改变默认计价设置。

复现步骤：

1. 找到崇高石（Exalted Orb，`Metadata/Items/Currency/CurrencyAddModToRare`）价格行。
2. 依次为leagueSoftcore、leagueHardcore、standardSoftcore、standardHardcore四列输入12.3456、23.4567、34.5678、45.6789，触发键盘事件并失焦。
3. 用原生Export Settings复制导出，等待异步复制完成后读取。
4. 清空leagueHardcore这一项，再次导出，然后重载页面。

预期：四项自定义输入分别保存，清空一项只撤销对应覆盖。

实际：前三列初次导出为各自内部换算数值，standardHardcore为null。清空leagueHardcore只移除其物品键，另外三列导出不变；重载后leagueSoftcore和standardSoftcore分别显示12.3456和34.5678，已清空列为空，standardHardcore也为空。英文与中文三个阶段（四项、清空、重载）原始JSON逐字一致。

对照样本见fixtures/custom-price-leagues-four.json及custom-price-leagues-cleared.json。它们包含上游异常值，是调查样本，不是保证四赛区价格可完整恢复的设置模板。没有核实为何该列生成null，不据此推断所有材料、计价单位或赛区都失败；后续应在原站价格数据／补丁变化后重新验证。
