import type { PreviewName, PreviewSkill, PreviewSlot } from '@poe2-tools/build-core'
import { formatRate, type TranslatedFile } from '../translate/runTranslation'
import { additionalTextAt, fieldReport, missedLines } from './lines'
import { TextPair } from './TextPair'

export interface PreviewProps {
  file: TranslatedFile
}

function nameText(name: PreviewName): string {
  return name.text ?? name.en ?? name.id
}

function Overview({ file }: PreviewProps) {
  const { input, build, report, preview, unmatched, rate } = file
  const ascendancy = preview.ascendancy
  return (
    <section className="preview__section">
      <h2>概览</h2>
      <dl className="overview">
        <dt>文件</dt>
        <dd>{file.name}</dd>
        <dt>构筑名</dt>
        <dd>{typeof input.name === 'string' ? input.name : '—'}</dd>
        <dt>升华</dt>
        <dd>
          {ascendancy === null
            ? '—'
            : `${ascendancy.classText ?? ascendancy.classCode} · ${ascendancy.text ?? ascendancy.code}`}
        </dd>
        <dt>覆盖率</dt>
        <dd>{`命中 ${report.modTranslated} / ${report.modCandidates} 条编号行（${formatRate(rate)}）`}</dd>
      </dl>
      <TextPair
        original={typeof input.description === 'string' ? input.description : null}
        translated={typeof build.description === 'string' ? build.description : null}
        missed={missedLines(fieldReport(report, 'description'))}
      />
      <h3>{`未命中（${unmatched.length}）`}</h3>
      {unmatched.length === 0 ? (
        <p className="muted">全部命中</p>
      ) : (
        <ul className="unmatched">
          {unmatched.map((line, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: 同一 path+line 可能多条，位置是身份的一部分
            <li key={`${line.path}:${line.line}:${i}`}>
              <code>{line.text}</code>
              <small>{line.path}</small>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function SlotCard({ slot, file }: { slot: PreviewSlot; file: TranslatedFile }) {
  const path = `inventory_slots[${slot.rawIndex}].additional_text`
  const title = `${slot.label ?? slot.inventoryId}${slot.slotX > 0 ? ` #${slot.slotX + 1}` : ''}`
  return (
    <article className="card">
      <h3>{title}</h3>
      {slot.uniqueName !== null && (
        <p className="card__unique">
          <span className="en">{slot.uniqueName}</span>
          <span className="zh">{slot.uniqueText ?? '未命中'}</span>
        </p>
      )}
      <TextPair
        original={additionalTextAt(file.input.inventory_slots, slot.rawIndex)}
        translated={additionalTextAt(file.build.inventory_slots, slot.rawIndex)}
        missed={missedLines(fieldReport(file.report, path))}
      />
    </article>
  )
}

function SkillCard({ skill, i, file }: { skill: PreviewSkill; i: number; file: TranslatedFile }) {
  const skills = file.input.skills
  const supports = Array.isArray(skills)
    ? (skills[i] as { support_skills?: unknown } | undefined)?.support_skills
    : undefined
  const builtSkills = file.build.skills
  const builtSupports = Array.isArray(builtSkills)
    ? (builtSkills[i] as { support_skills?: unknown } | undefined)?.support_skills
    : undefined
  return (
    <article className="card">
      <h3>
        <span className="en">{skill.en ?? skill.id}</span>
        <span className="zh">{skill.text ?? '未命中'}</span>
      </h3>
      <TextPair
        original={additionalTextAt(skills, i)}
        translated={additionalTextAt(builtSkills, i)}
        missed={missedLines(fieldReport(file.report, `skills[${i}].additional_text`))}
      />
      {skill.supports.length > 0 && (
        <ul className="supports">
          {skill.supports.map((support, j) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: 同一宝石可重复出现，位置是身份的一部分
            <li key={`${support.id}:${j}`}>
              <span className="en">{support.en ?? support.id}</span>
              <span className="zh">{support.text ?? '未命中'}</span>
              <TextPair
                original={additionalTextAt(supports, j)}
                translated={additionalTextAt(builtSupports, j)}
                missed={missedLines(
                  fieldReport(file.report, `skills[${i}].support_skills[${j}].additional_text`),
                )}
              />
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}

export function Preview({ file }: PreviewProps) {
  const { preview } = file
  return (
    <div className="preview">
      <Overview file={file} />
      <section className="preview__section">
        <h2>槽位</h2>
        {preview.slots.length === 0 ? (
          <p className="muted">没有装备槽位</p>
        ) : (
          preview.slots.map((slot) => <SlotCard key={slot.rawIndex} slot={slot} file={file} />)
        )}
      </section>
      <section className="preview__section">
        <h2>宝石</h2>
        {preview.skills.length === 0 ? (
          <p className="muted">没有宝石</p>
        ) : (
          preview.skills.map((skill, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: 同一宝石可重复出现，位置是身份的一部分
            <SkillCard key={`${skill.id}:${i}`} skill={skill} i={i} file={file} />
          ))
        )}
      </section>
      <section className="preview__section">
        <h2>天赋</h2>
        {preview.passives.length === 0 ? (
          <p className="muted">没有天赋</p>
        ) : (
          <ul className="passives">
            {preview.passives.map((passive, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: 同一天赋 id 可重复，位置是身份的一部分
              <li key={`${passive.id}:${i}`}>
                <span className="en">{passive.en ?? passive.id}</span>
                <span className="zh">{nameText(passive)}</span>
                <TextPair
                  original={additionalTextAt(file.input.passives, i)}
                  translated={additionalTextAt(file.build.passives, i)}
                  missed={missedLines(fieldReport(file.report, `passives[${i}].additional_text`))}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
