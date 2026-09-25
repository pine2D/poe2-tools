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
