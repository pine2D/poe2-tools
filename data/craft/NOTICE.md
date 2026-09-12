# 制作目录数据来源

`catalog.json` 为自动生成数据，运行 `pnpm craft:build` 可重建；`--offline` 使用已有缓存。每个来源文件的固定提交、URL 和 SHA-256 写入 `_meta.sources`。

来源：[Path of Building Community — PoE2](https://github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2)，固定提交 `ce566eac45ea8a86477f513c7ee65a1ebe60014e`。源数据标注 **Item data (c) Grinding Gear Games**；游戏文本和内容版权仍归 GGG。MIT 许可不能处分游戏内容的权利。目录不含真实出现概率，`eligibility` 中的 0/1 只代表源数据的生成适用性。

`augments` 来自同一固定提交的 `src/Data/ModRunes.lua`，保留 305 个名称、627 个类别效果及全部声明限制；来源 SHA-256 为 `d3dac48143209d7d9a02a8c03bd86f21604a0961a8ced49290d6a1d243f8223a`。ID 是本项目的名称与类别复合身份，不是游戏 metadata ID。`levelReq` 是镶嵌物声明的穿戴等级需求；Bonded 文本单独保存，不代表已经生效。目录收录不代表所有镶嵌物均已开放模拟，布尔限制缺省不推断为允许。游戏版本仍未完整核验，`gameVersion` 保留 null。

`localizedNames` 由已登记的官方 trade2 静态通货表按 `(分组 ID, 条目 ID)` 精确关联，分别生成国服 zh-CN 与台服 zh-TW 的英文规范名 → 中文名称；两服独立取值，不做繁简转换。来源为 [国际服](https://www.pathofexile.com/api/trade2/data/static)、[国服](https://poe.game.qq.com/api/trade2/data/static)、[台服](https://pathofexile.tw/api/trade2/data/static)。仅构建期通过现有按日缓存模块获取，浏览器不请求第三方站点。2026-09-12 快照两服各 771 个名称，包含 12 个基础抗性符文与巧匠石；缺项不猜填，重复英文名若译名不同则构建失败。

三服静态表的 locale、URL、SHA-256、抓取时间分别写入 `_meta.nameSources`，不混入固定 PoB 提交的 `_meta.sources`。官方静态响应没有声明游戏版本，名称来源的 `gameVersion` 与制作目录的 `gameVersion` 均保持 null；抓取日期不是游戏版本。此名称源等级为 primary，游戏文本版权仍归 GGG 与对应地区权利人，不受本项目或 PoB MIT 许可授权再许可。

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
