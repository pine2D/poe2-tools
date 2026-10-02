// 扩展包内 NOTICE.txt 的正文（扩展发布 spec §8）：首行是版本号；非官方声明、许可与数据说明保持不变。
export function noticeText(version) {
  return `PoE2 中文助手 ${version}
这是非官方扩展，与 Craft of Exile、Grinding Gear Games、腾讯无隶属关系。
MIT 仅覆盖自有代码；游戏文本权利归相应权利人。
术语来源、快照版本与哈希见 assets/dictionary.json 的 sources。
数据来源登记：https://github.com/pine2D/poe2-tools/blob/main/docs/data-sources.md
安装与更新：https://poe2-tools.pine2d.com/extension/
仅保存本机开关，不保存装备全文或搜索记录；不读取剪贴板、不向第三方请求词典。
Chrome 管理页禁用/卸载后，请刷新已有 CoE 标签页。
`
}
