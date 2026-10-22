import { FULL_DISCLAIMER } from '@poe2-tools/ui-theme/compliance'

export const NOTICE_EN =
  "This product isn't affiliated with or endorsed by Grinding Gear Games, Tencent or Craft of Exile in any way."
export const FONT_NOTICE =
  '界面字体 Noto Serif SC 以 SIL OFL 1.1 授权，见 NotoSerifSC-OFL.txt；MIT 不覆盖字体文件。'

// 扩展包内 NOTICE.txt 的正文（扩展发布 spec §8、设计语言 spec §7.6）：首行是版本号；随后是完整声明（与网站一字不差）、
// 英文声明与字体许可；其余各行沿用 0.2.0。
export function noticeText(version) {
  return `PoE2 中文助手 ${version}
${FULL_DISCLAIMER}
${NOTICE_EN}
${FONT_NOTICE}
通用交互图标 Lucide（ISC）及 Feather 衍生部分（MIT），完整许可见 Lucide-LICENSE.txt。
MIT 仅覆盖自有代码；游戏文本权利归相应权利人。
术语来源、快照版本与哈希见 assets/dictionary.json 的 sources。
数据来源登记：https://github.com/pine2D/poe2-tools/blob/main/docs/data-sources.md
安装与更新：https://poe2-tools.pine2d.com/extension/
CoE 不保存装备全文或搜索记录，不读取剪贴板、不向第三方请求词典。
攻略设置、Key、译文缓存及划词站点规则保存在本机；自动划词须获得所选站点权限，点击翻译才发送选中文字。
Chrome 管理页禁用/卸载后，请刷新已有 CoE 标签页。
`
}
