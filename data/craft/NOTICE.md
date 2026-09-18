# 制作目录数据来源

`fluxes.json` 是独立 **gray** 手工转换关系表：15 行、60 个成员，引用既有 primary 目录中的 57 种词缀身份。来源为 PoE2DB 公开 Mod Equivalencies 表及逐项详情，详见 `_meta.source`、成员 `source` 与 `docs/data-sources.md`。仅保存身份、域和关系；文本、数值继续读取固定 MIT 目录，不包含外站权重、价格、网页或实现。此表绑定 ModItem、ModJewel、ModVeiled 三份来源，可整体移除或用 `DICT_ENABLE_POE2DB=0` 禁止发布；不以本项目 MIT 许可声明第三方数据库的再分发权利。

`alloys.json` 是独立 **gray** 手工关系表：13 种材料、132 个类别对应，只引用现有 primary 词缀 ID，保留适性合金权杖一项未对应。材料说明来源逐项记在 `source`，登记见 `docs/data-sources.md`。不含外站词缀数值、权重、价格或代码；不以本项目 MIT 许可声明第三方数据库的再分发权利。可删除此表或用 `DICT_ENABLE_POE2DB=0` 禁止发布，既有 primary 目录不依赖它。

`catalog.json` 为自动生成数据，运行 `pnpm craft:build` 可重建；`--offline` 使用已有缓存。每个来源文件的固定提交、URL 和 SHA-256 写入 `_meta.sources`。

来源：[Path of Building Community — PoE2](https://github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2)，固定提交 `ce566eac45ea8a86477f513c7ee65a1ebe60014e`。源数据标注 **Item data (c) Grinding Gear Games**；游戏文本和内容版权仍归 GGG。MIT 许可不能处分游戏内容的权利。目录不含真实出现概率，`eligibility` 中的 0/1 只代表源数据的生成适用性。

`augments` 来自同一固定提交的 `src/Data/ModRunes.lua`，保留 305 个名称、627 个类别效果及全部声明限制；来源 SHA-256 为 `d3dac48143209d7d9a02a8c03bd86f21604a0961a8ced49290d6a1d243f8223a`。ID 是本项目的名称与类别复合身份，不是游戏 metadata ID。`levelReq` 是镶嵌物声明的穿戴等级需求；Bonded 文本单独保存，不代表已经生效。目录收录不代表所有镶嵌物均已开放模拟，布尔限制缺省不推断为允许。数据快照版本为0.5.5：上游导出提交 `49e93925dcb79024175c58d25befadab67b4dd44` 明确标注该版本，本目录引用的37个源文件在该提交到固定快照间无变化。这不是当前客户端或国服版本声明。

`localizedNames` 由已登记的官方 trade2 静态通货表按 `(分组 ID, 条目 ID)` 精确关联，分别生成国服 zh-CN 与台服 zh-TW 的英文规范名 → 中文名称；两服独立取值，不做繁简转换。来源为 [国际服](https://www.pathofexile.com/api/trade2/data/static)、[国服](https://poe.game.qq.com/api/trade2/data/static)、[台服](https://pathofexile.tw/api/trade2/data/static)。仅构建期通过现有按日缓存模块获取，浏览器不请求第三方站点。2026-09-12 快照两服各 771 个名称，包含 12 个基础抗性符文与巧匠石；缺项不猜填，重复英文名若译名不同则构建失败。

三服静态表的 locale、URL、SHA-256、抓取时间分别写入 `_meta.nameSources`，不混入固定 PoB 提交的 `_meta.sources`。官方静态响应没有声明游戏版本，名称来源的 `gameVersion` 保持 null，与制作目录已核对的0.5.5数据快照版本分别记录；抓取日期不是游戏版本。此名称源等级为 primary，游戏文本版权仍归 GGG 与对应地区权利人，不受本项目或 PoB MIT 许可授权再许可。

制作目录另接入同一固定提交的 src/Data/ModVeiled.lua（SHA-256：95234097bcb70946ad451fbdb80b93cff3bd4a57abfdf29052305905fd32a632）：388 条来源记录中，199 条有明确前后缀及三族亵渎标签，以 desecratedOnly 标记；189 条其他记录逐项列入 _meta.excludedDesecratedMods。原 2550 条词缀保持不变，专属记录不进入普通通货候选池。两条专属记录没有任何当前目录基底的正资格，保留源记录但不强行开放。文件仍由 GGG 标注游戏数据版权，不含真实揭示概率。

源仓库许可（Path of Building Community 部分）：

Copyright (c) 2016 David Gowor

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

`runeforging.json` 是独立 gray 配方关系表，由已登记公开 HTML 的普通配方区核对生成，不复制其他工具的数据文件或代码。只保存376条固定基底身份对应、Verisium数量和固有模板变化，33条未解析行保留序号及原因；来源提交、六类基底哈希与页面哈希见 `_meta`。游戏版本未完整核验，记为 null。关闭 `DICT_ENABLE_POE2DB` 或移除此表可下线，不影响 primary 目录；此表不等于所有状态都能执行转换。网页数据库没有明确再分发许可，MIT仅覆盖本仓库自有代码。
