# 测试样本

- `synthetic/`：本仓库自造的最小 `.build` 样本，覆盖：rare 槽位、unique 槽位、带标记语法与空行的备注、
  魔符网格坐标、小数 / 负号 / 区间数字、混合形态的 passives、两种宝石 id 前缀、带 `additional_text`
  的辅助宝石与天赋、未知字段。入库。
- `local/`：从 Mobalytics、maxroll、poe.ninja 等站点导出的真实样本，属于第三方内容，
  只在本地使用，`.gitignore` 已排除。测试在该目录为空时必须仍能通过（真实样本只用于
  匹配率回归，缺失时跳过并打印原因）。
