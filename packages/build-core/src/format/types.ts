// .build 文件类型。规范：GGG 开发者文档 Build Planner 一节（docs/build-format.md）。
// 所有对象都带索引签名：未知字段必须原样保留。

export type LevelInterval = number | readonly number[]

export interface BuildPassive {
  id: string
  level_interval?: LevelInterval
  weapon_set?: number
  additional_text?: string
  [key: string]: unknown
}

export interface BuildSupport {
  id: string
  level_interval?: LevelInterval
  additional_text?: string
  [key: string]: unknown
}

export interface BuildSkill extends BuildSupport {
  support_skills?: Array<string | BuildSupport>
}

export interface BuildInventorySlot {
  inventory_id: string
  slot_x?: number
  slot_y?: number
  level_interval?: LevelInterval
  unique_name?: string
  additional_text?: string
  [key: string]: unknown
}

export interface BuildFile {
  name?: string
  author?: string
  link?: string
  description?: string
  ascendancy?: string
  passives?: Array<string | BuildPassive>
  skills?: Array<string | BuildSkill>
  inventory_slots?: BuildInventorySlot[]
  [key: string]: unknown
}
