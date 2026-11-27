# PoE2 Tools

面向《流放之路 2》玩家的中文辅助工具：用国服术语浏览 Craft of Exile、对照阅读英文攻略，汉化官方 Build Planner 的构筑文件，或在装备工坊比较本地演练。

[打开工具网站](https://poe2-tools.pine2d.com/) · [下载 Chrome 中文助手](https://poe2-tools.pine2d.com/extension/) · [反馈问题](https://github.com/pine2D/poe2-tools/issues)

## 你想做什么？

| 需求 | 使用哪个工具 |
| --- | --- |
| 在 Craft of Exile 看中文词缀、用中文搜索、导入中文装备文本 | [Chrome 中文助手](docs/chrome-extension/README.md) |
| 阅读英文 PoE2 攻略，查看中英对照或划词翻译 | [Chrome 中文助手](docs/chrome-extension/README.md)（整段翻译需自备 API Key） |
| 汉化攻略作者提供的 `.build` 构筑文件 | [构筑汉化网页](https://poe2-tools.pine2d.com/build/)，直接在浏览器使用 |
| 比较同一件装备的两次制作演练和材料用量 | [装备工坊](https://poe2-tools.pine2d.com/craft/) |

## 开始使用

### Chrome 中文助手

1. 在[下载页](https://poe2-tools.pine2d.com/extension/)取得 ZIP，解压到一个固定文件夹。
2. 打开 Chrome 的 `chrome://extensions/`，开启“开发者模式”。
3. 点击“加载已解压的扩展程序”，选择解压后包含 `manifest.json` 的文件夹。

安装后，打开 [CoE Beta](https://beta.craftofexile.com/?game=poe2&language=us)，选择 **PoE2、English**，即可使用已支持的中文显示、搜索和装备文本转换。这些功能不需要翻译服务 Key。

阅读攻略时，在攻略页点击扩展图标 → “预览此页翻译范围”，核对正文范围，在“设置”中配置自己的翻译服务后再点击“开始翻译”。也可以临时启用本页划词，或授权常用网站自动显示划词入口；选中文字后点击翻译才会发送。

扩展尚未上架 Chrome 应用商店，当前版本与更新日期以[网站下载页](https://poe2-tools.pine2d.com/extension/)为准，详细说明见[安装与使用](docs/chrome-extension/install.md)。

### 构筑文件汉化

打开[构筑汉化](https://poe2-tools.pine2d.com/build/)，拖入或粘贴 `.build` 文件 → 选择简体或繁体中文 → 查看处理结果并下载中文文件。需要时展开待核对内容或进入阶段比较；多个阶段可以一起导入，下载范围可选择当前文件、当前构筑或全部构筑。

文件在浏览器本地处理，不上传，也不需要 Key。具体操作见[构筑汉化使用说明](docs/build-l10n.md)。

### 装备工坊

在工坊展开「搜索基底、词缀与通货演练」。打开「演练收藏」，点击「比较收藏」，选择两份从同一起始装备开始的演练，查看各自保存步骤的装备、制作目标和材料。两份收藏可以有不同的目标。详见[工坊使用说明](docs/crafting-workbench-legacy.md#比较两份演练)。

## 使用前需要知道

- **攻略长句译文仍可能出错。** 动作、条件和数值关系请结合原文核对；术语命中不代表整句准确。
- **CoE 适配限新版 Beta 的 PoE2 英文界面。** 不覆盖旧版 CoE、PoE1 或全部装备格式；转换后的装备能否导入由原站判断，导入后请核对数值。详见[兼容性记录](docs/chrome-extension/compatibility.md)。
- **整段翻译使用你自己的服务。** 默认支持 DeepSeek，也可填写 OpenAI 兼容接口，费用由对应服务商收取。扩展不内置 Key，仅在你点击翻译时发送所选文字及必要语境（“测试连接”发送一条简短测试消息）；Key 保存在本机扩展存储中，未加密。详见[隐私与权限](docs/chrome-extension/privacy.md)。
- **构筑汉化支持官方 `.build` 格式。** 暂不支持 PoB 的 XML 或分享码。中文文件尚未在游戏里实测加载，放入前请备份原文件。

## 更多帮助

- [Chrome 中文助手：安装、更新和使用](docs/chrome-extension/install.md)
- [构筑汉化：阶段对照、下载和待核对内容](docs/build-l10n.md)
- [扩展更新日志](apps/poe2-extension/CHANGELOG.md)
- [问题反馈](https://github.com/pine2D/poe2-tools/issues)：请附页面地址、版本、复现步骤和必要截图，隐去 Key 与私人信息。
- [开发与维护](docs/development.md)：源码构建、验证、目录和发布说明。

## 许可与声明

这是非官方项目，与 Grinding Gear Games、腾讯及 Craft of Exile 无关联，也未获其认可。自有代码采用 [MIT 许可](LICENSE)；游戏文本及第三方素材的权利归各自权利人，见[数据来源](docs/data-sources.md)与[NOTICE](NOTICE)。
