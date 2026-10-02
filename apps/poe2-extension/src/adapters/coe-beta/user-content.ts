// 来自实际保存列表与流程步骤 DOM；标题下的描述 tooltip 与结果表步骤名称同属用户文本。
const userContent =
  '#inventoryZone .tabs, .simulationsList > .row[simulationid] > .title, .simulatorStep > .header .title, .simulatorResultsTable > .row > .title, #simulatorStepEditor .routeOrder .row[target]:not([target="end"]) .title'

// 实测保存目标弹窗的仓库页使用 UUID；id=0 是公共“新建页”动作。
const tabId = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
export function isUserContent(element: Element): boolean {
  if (element.closest(userContent)) return true
  const target = element.closest('#noticeDialog .message .text button[id]')
  return !!target && tabId.test(target.id)
}
