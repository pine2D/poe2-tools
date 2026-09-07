import type { DictIndex } from '../dict/index'
import type { BuildFile, BuildInventorySlot } from '../format/types'
import { type LineReport, translateText } from './text'

export interface BuildTranslateOptions {
  bilingual: boolean
  annotateUniques: boolean
}

export interface FieldReport {
  path: string
  lines: LineReport[]
}

export interface TranslateReport {
  fields: FieldReport[]
  candidates: number
  translated: number
  modCandidates: number
  modTranslated: number
}

export interface BuildTranslation {
  build: BuildFile
  report: TranslateReport
}

type Holder = Record<string, unknown>

function isHolder(value: unknown): value is Holder {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// 数据本身是 JSON，用 JSON 往返做深拷贝即可，且保留键序
function clone(build: BuildFile): BuildFile {
  return JSON.parse(JSON.stringify(build)) as BuildFile
}

export function translateBuild(
  input: BuildFile,
  index: DictIndex,
  options: BuildTranslateOptions = { bilingual: false, annotateUniques: true },
): BuildTranslation {
  const build = clone(input)
  const fields: FieldReport[] = []
  const textOptions = { bilingual: options.bilingual }

  const translateField = (holder: Holder, key: string, path: string): void => {
    const value = holder[key]
    if (typeof value !== 'string' || value === '') return
    const result = translateText(value, index, textOptions)
    holder[key] = result.text
    fields.push({ path, lines: result.lines })
  }

  translateField(build, 'description', 'description')

  if (Array.isArray(build.inventory_slots)) {
    for (const [i, slot] of build.inventory_slots.entries()) {
      if (!isHolder(slot)) continue
      translateField(slot, 'additional_text', `inventory_slots[${i}].additional_text`)
      if (options.annotateUniques) annotateUnique(slot as BuildInventorySlot, index)
    }
  }

  if (Array.isArray(build.skills)) {
    for (const [i, skill] of build.skills.entries()) {
      if (!isHolder(skill)) continue
      translateField(skill, 'additional_text', `skills[${i}].additional_text`)
      const supports = skill.support_skills
      if (!Array.isArray(supports)) continue
      for (const [j, support] of supports.entries()) {
        if (!isHolder(support)) continue
        translateField(
          support,
          'additional_text',
          `skills[${i}].support_skills[${j}].additional_text`,
        )
      }
    }
  }

  if (Array.isArray(build.passives)) {
    for (const [i, passive] of build.passives.entries()) {
      if (!isHolder(passive)) continue
      translateField(passive, 'additional_text', `passives[${i}].additional_text`)
    }
  }

  let candidates = 0
  let translated = 0
  let modCandidates = 0
  let modTranslated = 0
  for (const field of fields) {
    for (const line of field.lines) {
      if (line.status === 'kept') continue
      const hit = line.status === 'translated'
      candidates += 1
      if (hit) translated += 1
      if (line.kind === 'mod') {
        modCandidates += 1
        if (hit) modTranslated += 1
      }
    }
  }
  return { build, report: { fields, candidates, translated, modCandidates, modTranslated } }
}

function annotateUnique(slot: BuildInventorySlot, index: DictIndex): void {
  if (typeof slot.unique_name !== 'string') return
  const name = index.uniques.get(slot.unique_name)
  if (name === undefined) return
  const line = `<unique>{${name}}`
  const existing = slot.additional_text
  if (typeof existing !== 'string' || existing === '') {
    slot.additional_text = line
    return
  }
  // 幂等：已经注入过就不再重复
  if (existing === line || existing.startsWith(`${line}\n`)) return
  slot.additional_text = `${line}\n${existing}`
}
