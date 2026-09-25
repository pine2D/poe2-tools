# 扩展迭代验证

扩展的局部测试不能替代全仓门禁。每轮记录本次实际执行的命令与结果；最终包实装和源码测试是两类证据，不能互相替代。

## 常规门禁

依赖按锁文件安装后，在仓库根目录执行：

```bash
pnpm verify
pnpm extension:package
```

`verify`按顺序执行全仓类型、格式、测试、构建、词典检查与制作目录检查。中途失败时，后续步骤尚未执行，不能从命令已启动推断全部通过。旧制作网站仍搁置，但保留其回归；不要为使门禁变绿而删除旧测试、跳过失败或扩大超时。

## 扩展局部检查

使用现有安装完成迭代检查时，可直接调用与脚本相同的本地工具，避免包管理器自动安装：

```bash
node node_modules/@biomejs/biome/bin/biome check .
node node_modules/vitest/vitest.mjs run packages/l10n-core apps/poe2-extension
node_modules/.bin/tsc --noEmit -p packages/l10n-core/tsconfig.json
node_modules/.bin/tsc --noEmit -p apps/poe2-extension/tsconfig.json
node apps/poe2-extension/scripts/build.mjs
node apps/poe2-extension/scripts/package.mjs
```

涉及`item-core`时另跑实际改动模块的测试与类型检查。上面的测试只涵盖核心与扩展，不是全仓测试。

格式检查保留全仓范围，包括`docs/chrome-extension/fixtures/*.json`。这些原生导出样本可以按Biome排版，但应在修改前后分别解析，再比较序列化结果，确认数值、数组顺序及对象键序未变；不要为通过格式检查排除样本目录。原生剪贴板逐字相等的证据应记录在兼容性文档，入库文件的空白不承担这项证明。

## 本机包管理器问题

本机pnpm 11可能在运行脚本前检测到工作区结构变化并自动尝试安装，随后因缓存SQLite数据库不可访问而退出。这种退出发生在项目检查之前，不是TypeScript或测试失败。

只有确认要使用已有依赖进行诊断时，可临时执行：

```bash
pnpm_config_verify_deps_before_run=warn pnpm verify
```

这条命令保留依赖不同步警告而不自动安装，不修改持久配置。其结果必须注明“现有依赖下验证”，不能宣称已通过全新锁文件安装／CI验证，也不能据此忽略缺失依赖。需要严格重现CI时仍须完成`pnpm install --frozen-lockfile`。

## 最终安装包

从本轮ZIP解压到独立目录加载Chrome，再验证本轮改变的用户链路。导入相关改动至少核对原站导入后的身份、数值及完整原生导出；显示相关改动核对停用后恢复；搜索相关改动核对提交英文和原站结果。仍未验收的页面、输入法及来源结构继续在兼容性记录中列明。


## 浏览器点击证据

`getClientRects().length > 0`只说明元素有布局框，不保证位于视口内。点击下拉选项前检查边界与视口尺寸，必要时滚动页面或下拉列表，使目标完整可见；部分露出的选项，其中心仍可能在视口外。工具返回Done不能替代实际结果断言。

条件选择完成后核对原站`.dropdown.chosen li.selected`的身份，区分已选条件与原站自动添加的空白条件。调查失效时记录鼠标坐标、实际事件目标及失焦顺序；先排除点击落空，再判断输入法、扩展或原站行为。停用扩展对照与全新未安装扩展环境应分别标注。


模拟器操作还需核对当前视图：运行后的“返回流程”可以只是查看结果流程，编辑入口可能没有布局框；先通过原生“清除模拟结果”恢复编辑态。新增／移除条件组后，立即检查组数，再保存并比较原生导出，不能只依据点击返回Done。导入弹窗使用已验证的可见控件ID，避免宽泛textarea选择器命中隐藏表单。


词缀中文叠加使用Shadow DOM：宿主的outerHTML／textContent为空，不代表渲染内容为空。应读取shadowRoot.textContent，并结合截图或实际可见性核对；同时检查原站英文文本与业务属性未变。悬停失败时屏幕可能保留上一个提示，不能把旧提示内容当成新目标的结果。
