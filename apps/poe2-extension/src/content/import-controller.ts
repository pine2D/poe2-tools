import type { Term } from '@poe2-tools/l10n-core'
import { type PreparedImport, prepareImport } from '../adapters/coe-beta/import'
import { FULL_DISCLAIMER, SHORT_PROVENANCE } from '../provenance'
import { adoptL1, createGem } from './l1'

// 原站对话框的布局放宽（spec §6.9 宿主全局样式例外 3）：只改布局，不改颜色与字体；第一条规则是 0.2.0 原文加 overflow-y: auto（spec B.12 第 11 条），另两条逐字沿用 0.2.0
const DIALOG_CSS = `
      #noticeDialog:has([data-poe2-l10n="import"]) {
        box-sizing: border-box;
        width: 760px;
        max-width: calc(100vw - 24px) !important;
        overflow-y: auto;
      }
      #noticeDialog:has([data-poe2-l10n="import"]) .message > .text { min-width: 0; flex: 1; }
      #noticeDialog:has([data-poe2-l10n="import"]) #importerInput {
        box-sizing: border-box;
        width: 100%;
        min-width: 0;
        max-width: 100%;
      }
    `

const SVG_NS = 'http://www.w3.org/2000/svg'
type IconKind = 'done' | 'alert' | 'stale' | 'fill'
type Tone = 'ok' | 'miss' | 'dim'
type Shape = readonly [tag: 'circle' | 'path', attributes: Readonly<Record<string, string>>]
// 核对清单图标（样稿 phase3/import/gen.py）：16×16 线框，currentColor 取色；形状区分状态，不只靠颜色
const ICONS: Readonly<Record<IconKind, readonly Shape[]>> = {
  done: [
    ['circle', { cx: '8', cy: '8', r: '6.6' }],
    ['path', { d: 'M5 8.2 7.1 10.3 11 6.1' }],
  ],
  alert: [
    ['circle', { cx: '8', cy: '8', r: '6.6' }],
    ['path', { d: 'M8 4.6V8.8' }],
    ['circle', { cx: '8', cy: '11.3', r: '.5', fill: 'currentColor' }],
  ],
  stale: [
    ['path', { d: 'M13 8A5 5 0 1 1 11.5 4.5' }],
    ['path', { d: 'M11.9 2.2V4.9H9.2' }],
  ],
  fill: [
    ['path', { d: 'M8 2.6V9.4M5.3 6.8 8 9.5 10.7 6.8' }],
    ['path', { d: 'M3 10.6V13H13V10.6' }],
  ],
}

/** 装饰图标：读屏不读，含义由旁边的文字给出 */
function icon(doc: Document, kind: IconKind, tone: Tone): SVGSVGElement {
  const svg = doc.createElementNS(SVG_NS, 'svg')
  for (const [name, value] of Object.entries({
    class: `ico ${tone}`,
    viewBox: '0 0 16 16',
    width: '16',
    height: '16',
    'aria-hidden': 'true',
    focusable: 'false',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '1.6',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  }))
    svg.setAttribute(name, value)
  for (const [tag, attributes] of ICONS[kind]) {
    const shape = doc.createElementNS(SVG_NS, tag)
    for (const [name, value] of Object.entries(attributes)) shape.setAttribute(name, value)
    svg.append(shape)
  }
  return svg
}

/** 同一行合并多条消息时补句号，避免“已保留 该行……”直接相连（B3-05）；单条消息原样保留。
    句末标点写转义（。！？），免得正则字面量把新字符带进 L1 收字 */
const sentence = (text: string) => (/[\u3002\uff01\uff1f]$/.test(text) ? text : `${text}。`)

/** 待核对条目（裁定 25）：无行号问题各占一条、排在前；同一行号的问题合并为一条，行号升序 */
function checklist(issues: PreparedImport['issues']): { line: number | null; text: string }[] {
  const byLine = new Map<number, string[]>()
  for (const { line, message } of issues)
    if (line !== null) byLine.set(line, [...(byLine.get(line) ?? []), message])
  return [
    ...issues
      .filter((issue) => issue.line === null)
      .map(({ message }) => ({ line: null, text: message })),
    ...[...byLine]
      .sort(([a], [b]) => a - b)
      .map(([line, messages]) => ({
        line,
        text: messages.length > 1 ? messages.map(sentence).join('') : (messages[0] ?? ''),
      })),
  ]
}

export function attachImport(doc: Document, terms: readonly Term[]) {
  let target: HTMLTextAreaElement | null = null
  let host: HTMLElement | null = null
  let dialogStyle: HTMLStyleElement | null = null
  let closed = false
  let revision = 0
  let invalidate: (() => void) | null = null
  const scan = () => {
    if (closed) return
    const input = doc.querySelector<HTMLTextAreaElement>('dialog[open] #importerInput')
    if (input === target && host?.isConnected) return
    revision++
    invalidate = null
    host?.remove()
    dialogStyle?.remove()
    target = input
    if (!input) return
    const isActive = () =>
      !closed && target === input && input.isConnected && input.closest('dialog')?.open === true
    host = doc.createElement('section')
    host.dataset.poe2L10n = 'import'
    host.style.cssText = 'display:block;box-sizing:border-box;min-width:0;margin:12px 0'
    const shadow = host.attachShadow({ mode: 'open' })
    adoptL1(shadow)
    const panel = doc.createElement('div')
    panel.className = 'panel'
    const head = doc.createElement('div')
    head.className = 'head'
    const heading = doc.createElement('strong')
    heading.className = 'title'
    heading.textContent = '装备文本转换'
    const by = doc.createElement('span')
    by.className = 'by'
    by.textContent = SHORT_PROVENANCE
    head.append(createGem(doc, 16), heading, by)
    const steps = doc.createElement('ol')
    steps.className = 'steps'
    steps.setAttribute('aria-label', '装备转换步骤')
    for (const [index, text] of ['预览核对', '填入英文', '原站确认'].entries()) {
      const step = doc.createElement('li')
      const who = doc.createElement('span')
      who.className = 'who'
      who.textContent = index === 2 ? '原站' : '你'
      const title = doc.createElement('b')
      title.textContent = text
      const state = doc.createElement('small')
      step.append(who, title, state)
      steps.append(step)
    }
    // 只投影扩展实际完成的步骤；第三步永不标为已完成，导入结果留给原站。
    const setStep = (current: 0 | 1 | 2) => {
      for (const [index, step] of [...steps.children].entries()) {
        step.setAttribute('data-state', index < current ? 'done' : 'pending')
        if (index === current) step.setAttribute('aria-current', 'step')
        else step.removeAttribute('aria-current')
        const state = step.querySelector('small')
        if (state)
          state.textContent = index < current ? '已完成' : index === current ? '下一步' : '待完成'
      }
    }
    setStep(0)
    const body = doc.createElement('div')
    body.className = 'body'
    const disclaimer = doc.createElement('p')
    disclaimer.className = 'disclaimer'
    disclaimer.textContent = FULL_DISCLAIMER
    dialogStyle = doc.createElement('style')
    dialogStyle.dataset.poe2L10n = 'import-dialog'
    dialogStyle.textContent = DIALOG_CSS
    const returnInputFocus = (button: HTMLButtonElement, hadFocus: boolean) => {
      if (
        hadFocus &&
        isActive() &&
        (shadow.activeElement === button || doc.activeElement === doc.body)
      )
        input.focus()
    }
    const preview = doc.createElement('button')
    preview.type = 'button'
    preview.textContent = '预览中文转换'
    // 结论行在首次转换前挂载、跨重试是同一节点：只播报结论与副句，不播报清单与两栏全文
    const message = doc.createElement('p')
    message.className = 'verdict'
    message.setAttribute('role', 'status')
    message.setAttribute('aria-live', 'polite')
    message.setAttribute('aria-atomic', 'true')
    const result = doc.createElement('div')
    result.className = 'result'
    /** 结论行：图标 + 结论 + 可选副句；整体替换，空状态用 replaceChildren() 让 :empty 生效 */
    const say = (kind: IconKind, tone: Tone, text: string, note: string | null = null) => {
      const conclusion = doc.createElement('span')
      conclusion.textContent = text
      message.replaceChildren(icon(doc, kind, tone), conclusion)
      if (note === null) return
      const small = doc.createElement('small')
      small.textContent = note
      message.append(small)
    }
    /** 每个状态至多一个主按钮，放在“下一步［你］”对应的按钮上（裁定 24） */
    const setPrimary = (el: HTMLButtonElement | null) => {
      for (const button of panel.querySelectorAll<HTMLButtonElement>('button[data-primary]'))
        if (button !== el) button.removeAttribute('data-primary')
      if (el) el.dataset.primary = ''
    }
    const entry = (lead: Node, text: string, kind: 'issue' | 'warning' | 'clear' | null = null) => {
      const row = doc.createElement('li')
      if (kind) row.dataset.kind = kind
      const span = doc.createElement('span')
      span.textContent = text
      row.append(lead, span)
      return row
    }
    const actor = (who: '你' | '原站') => {
      const tag = doc.createElement('span')
      tag.className = 'who'
      tag.textContent = who
      return tag
    }
    const group = (title: '已完成' | '待核对' | '下一步', key: 'done' | 'pending' | 'next') => {
      const box = doc.createElement('div')
      box.className = 'group'
      box.dataset.group = key
      const caption = doc.createElement('h3')
      caption.textContent = title
      const list = doc.createElement('ul')
      box.append(caption, list)
      return { box, list }
    }
    /** 生成预览；restored 为真表示刚恢复粘贴原文，回到“可以填入”并在副句说明（B3-03） */
    const runPreview = (restored = false) => {
      if (!isActive() || !preview.isConnected) return
      const current = ++revision
      invalidate = null
      result.replaceChildren()
      // 导入框为空：没有可对照的两栏，只提示粘贴；之后输入回到未预览状态，不显示失效（B3-04）
      if (input.value.trim() === '') {
        setStep(0)
        say('alert', 'miss', '导入框为空', '粘贴游戏里按 Ctrl+Alt+C 复制的完整装备文本')
        setPrimary(preview)
        invalidate = () => {
          revision++
          invalidate = null
          message.replaceChildren()
        }
        return
      }
      const converted = prepareImport(input.value, terms)
      setStep(converted.ready ? 1 : 0)
      const { lines, warnings, comparisonOnly } = converted
      // 仅供对照：issues[0] 是对照原因，已作结论副句，不在待核对里重复
      const items = checklist(comparisonOnly ? converted.issues.slice(1) : converted.issues)
      const located = items.filter((item) => item.line !== null).length
      const whole = items.length - located
      const check = doc.createElement('div')
      check.className = 'check'
      const done = group('已完成', 'done')
      const pending = group('待核对', 'pending')
      const next = group('下一步', 'next')
      // 解析失败没有完成任何事：不出“已完成”组（失效态再补回）
      check.append(...(lines === null ? [] : [done.box]), pending.box, next.box)
      const warningRows = () =>
        warnings.map((text) => entry(icon(doc, 'alert', 'miss'), text, 'warning'))
      // 已完成：有无行号问题时不显示分数（裁定 21）
      if (lines !== null)
        done.list.append(
          entry(
            icon(doc, 'done', 'ok'),
            whole > 0
              ? `已生成英文预览（${whole} 条问题涉及整件装备，无法定位到行）`
              : `已识别 ${lines.recognized} / ${lines.total} 行，生成英文预览`,
          ),
        )
      // 待核对：问题（同一行合并，带“第 N 行”定位）＋ 原站兼容性提示（不影响能否填入）
      if (items.length === 0 && (!comparisonOnly || warnings.length === 0))
        pending.list.append(
          entry(
            icon(doc, 'done', 'ok'),
            comparisonOnly ? '没有其他待核对项' : '没有需要先核对的行',
            'clear',
          ),
        )
      for (const { line, text } of items) {
        const row = entry(icon(doc, 'alert', 'miss'), text, 'issue')
        if (line !== null) {
          const locate = doc.createElement('button')
          locate.type = 'button'
          locate.textContent = `第 ${line} 行`
          locate.setAttribute('aria-label', `定位第 ${line} 行`)
          locate.dataset.tertiary = ''
          locate.addEventListener('click', () => {
            if (!isActive() || current !== revision || input.value !== converted.original) return
            const rows = input.value.split('\n')
            const start = rows.slice(0, line - 1).reduce((total, row) => total + row.length + 1, 0)
            const length = (rows[line - 1] ?? '').replace(/\r$/, '').length
            input.focus()
            input.setSelectionRange(start, start + length)
          })
          row.insertBefore(locate, row.lastChild)
        }
        pending.list.append(row)
      }
      pending.list.append(...warningRows())
      const columns = doc.createElement('div')
      columns.className = 'columns'
      for (const [index, [title, value]] of [
        ['粘贴原文（含备注）', converted.original],
        ['英文预览（不提交交易备注／描述）', converted.english],
      ].entries()) {
        const label = doc.createElement('label')
        const caption = doc.createElement('span')
        caption.className = 'column-label'
        caption.textContent = title ?? ''
        label.append(caption)
        const area = doc.createElement('textarea')
        area.readOnly = true
        area.value = value ?? ''
        if (index === 1) area.dataset.preview = ''
        label.append(area)
        if (index === 1) {
          const note = doc.createElement('small')
          note.textContent =
            '稀有装备名称、词缀名称及标签可保留中文；原站使用英文基底、属性正文和数值。已识别不等于能导入。'
          label.append(note)
        }
        columns.append(label)
      }
      const fill = doc.createElement('button')
      fill.type = 'button'
      fill.textContent = '填入英文到原站导入框'
      fill.disabled = !converted.ready
      const copy = doc.createElement('button')
      copy.type = 'button'
      copy.dataset.copyEnglish = ''
      copy.textContent = '复制英文装备文本'
      copy.disabled = !converted.complete
      // 复制结果并入已有 live region，避免新增反复播报的区域。
      const copyStatus = doc.createElement('small')
      copyStatus.className = 'copy-status'
      result.append(check, columns, fill, copy)
      // 结论行与下一步（裁定 23）
      if (lines === null) {
        say('alert', 'miss', '无法识别装备文本', '两栏仅供对照')
        next.list.append(
          entry(actor('你'), '粘贴游戏里按 Ctrl+Alt+C 复制的完整装备文本，再点“预览中文转换”'),
        )
        setPrimary(preview)
      } else if (comparisonOnly) {
        say('alert', 'miss', '仅供对照', converted.issues[0]?.message ?? null)
        next.list.append(
          entry(
            actor('你'),
            converted.complete
              ? '可复制英文装备文本供对照；此类装备暂不能填入'
              : '对照两栏阅读；此类装备暂不能填入',
          ),
        )
        setPrimary(null)
      } else if (converted.ready) {
        const notes = [
          ...(restored ? ['已恢复粘贴原文'] : []),
          ...(warnings.length ? [`${warnings.length} 条原站兼容性提示需在导入后核对`] : []),
        ]
        say('done', 'ok', '可以填入', notes.length ? notes.join('；') : null)
        next.list.append(
          entry(actor('你'), '核对两栏后，点“填入英文到原站导入框”'),
          entry(actor('原站'), '填入后点“继续”（Proceed），能否导入由原站判断'),
        )
        setPrimary(fill)
      } else {
        say(
          'alert',
          'miss',
          whole > 0 ? `需先核对 ${items.length} 处` : `需先核对 ${located} 行`,
          '两栏仅供对照，暂不能填入',
        )
        next.list.append(
          entry(
            actor('你'),
            '按提示核对来源文本。未识别不代表原文有错，请保留完整原文，不要删行绕过。',
          ),
        )
        setPrimary(preview)
      }
      /** ④ 原文已改变：旧结果降级保留，定位与填入停用，预览成为主按钮。
          afterFill：填入后用户在原站框里改动，仍可直接交原站“继续”，不退回预览步骤（B3-13） */
      const markStale = (note: string, afterFill = false) => {
        setStep(afterFill ? 2 : 0)
        // 已失效且副句不变：不重写结论行（live region）与清单，避免重复播报
        if (
          check.classList.contains('stale') &&
          message.querySelector('small')?.textContent === note
        )
          return
        fill.disabled = true
        copy.disabled = true
        copyStatus.remove()
        for (const button of check.querySelectorAll<HTMLButtonElement>('li button'))
          button.disabled = true
        check.classList.add('stale')
        if (done.box.parentNode !== check) check.prepend(done.box)
        done.list.replaceChildren(
          entry(icon(doc, 'stale', 'dim'), '上次预览已失效，两栏为改动前内容'),
        )
        if (afterFill) {
          next.list.replaceChildren(
            entry(actor('原站'), '可直接点原站的“继续”（Proceed），由原站判断导入框当前内容'),
            entry(actor('你'), '需要核对时，点“预览中文转换”重新生成'),
          )
          say('stale', 'miss', '导入框内容已改变', note)
          setPrimary(null)
          return
        }
        next.list.replaceChildren(entry(actor('你'), '点“预览中文转换”重新生成'))
        say('stale', 'miss', '原文已改变，请重新预览', note)
        setPrimary(preview)
      }
      invalidate = () => {
        revision++
        markStale('以下为改动前的结果')
      }
      copy.addEventListener('click', async () => {
        if (!converted.complete || !isActive() || current !== revision || !copy.isConnected) return
        if (input.value !== converted.original) {
          markStale('以下为改动前的结果')
          return
        }
        // 等待期间按钮禁用会让焦点落到 body；结束后归还给复制按钮，失效则交给预览（B3-02）
        const hadFocus = shadow.activeElement === copy
        const giveFocus = (button: HTMLButtonElement) => {
          if (
            hadFocus &&
            isActive() &&
            button.isConnected &&
            !button.disabled &&
            (doc.activeElement === doc.body || shadow.activeElement === copy)
          )
            button.focus()
        }
        copy.disabled = true
        copyStatus.remove()
        let text: string
        try {
          if (!doc.defaultView?.navigator.clipboard) throw new Error('clipboard unavailable')
          await doc.defaultView.navigator.clipboard.writeText(converted.english)
          text = '已复制英文装备文本；名称与标签可能保留原文，交易备注和描述不包含在内。'
        } catch {
          text = '复制失败，请从英文预览框手动复制。'
        }
        if (!isActive() || current !== revision || !copy.isConnected) {
          giveFocus(preview)
          return
        }
        if (input.value !== converted.original) {
          markStale('以下为改动前的结果')
          giveFocus(preview)
          return
        }
        copy.disabled = false
        copyStatus.textContent = text
        message.append(copyStatus)
        giveFocus(copy)
      })
      fill.addEventListener('click', () => {
        if (!isActive() || current !== revision || !fill.isConnected) return
        if (!input.isConnected || input.value !== converted.original) {
          markStale('以下为改动前的结果')
          return
        }
        const hadFocus = shadow.activeElement === fill
        revision++
        invalidate = null
        input.value = converted.english
        input.dispatchEvent(new Event('input', { bubbles: true }))
        fill.disabled = true
        copy.disabled = true
        // ③ 已填入：导入仍由原站完成，扩展不提交
        say('fill', 'ok', '已填入英文', '尚未导入，导入结果由原站确认')
        setStep(2)
        done.list.replaceChildren(
          entry(icon(doc, 'fill', 'ok'), `英文已写入原站导入框（${lines?.total ?? 0} 行）`),
        )
        pending.list.replaceChildren(
          ...(warnings.length
            ? warningRows()
            : [entry(icon(doc, 'done', 'ok'), '没有待核对项', 'clear')]),
        )
        next.list.replaceChildren(
          entry(actor('原站'), '点原站的“继续”（Proceed）后由原站完成导入；扩展不会替你提交'),
        )
        setPrimary(null)
        const filledRevision = revision
        const restore = doc.createElement('button')
        restore.type = 'button'
        restore.textContent = '恢复粘贴原文'
        restore.dataset.tertiary = ''
        const invalidateRestore = () => {
          revision++
          restore.disabled = true
          markStale('以下为填入前的结果', true)
        }
        invalidate = invalidateRestore
        restore.addEventListener('click', () => {
          if (!isActive() || filledRevision !== revision || !restore.isConnected) return
          if (input.value !== converted.english) {
            invalidateRestore()
            return
          }
          const hadRestoreFocus = shadow.activeElement === restore
          revision++
          invalidate = null
          input.value = converted.original
          input.dispatchEvent(new Event('input', { bubbles: true }))
          // 导入框与本次预览的原文一致：直接回到“可以填入”，重新挂上失效监听，之后编辑照常标失效
          if (input.value === converted.original) runPreview(true)
          else markStale('以下为改动前的结果')
          returnInputFocus(restore, hadRestoreFocus)
        })
        result.append(restore)
        returnInputFocus(fill, hadFocus)
      })
    }
    preview.addEventListener('click', () => runPreview())
    body.append(preview, message, result)
    panel.append(head, steps, body, disclaimer)
    shadow.append(panel)
    setPrimary(preview)
    input.after(dialogStyle, host)
  }
  const onInput = (event: Event) => {
    if (event.target === target) invalidate?.()
  }
  doc.addEventListener('input', onInput, true)
  scan()
  const observer = new MutationObserver(scan)
  observer.observe(doc.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['open'],
  })
  return () => {
    closed = true
    revision++
    invalidate = null
    doc.removeEventListener('input', onInput, true)
    observer.disconnect()
    host?.remove()
    dialogStyle?.remove()
    target = null
  }
}
