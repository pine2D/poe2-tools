/** 说明未解析映射的能力边界，不据展示占位推断游戏制作资格。 */
export function essenceUnavailableMessage(modId: string): string {
  if (/^EssenceDisplayAttributes[1235]$/.test(modId))
    return '当前目录无法为这件装备确定完整的属性候选，暂不能演练。材料说明中的“三属性之一”不代表该基底均可获得。'
  if (/^EssenceDisplayDefences[123]$/.test(modId))
    return '当前目录无法为这件装备确定已核实的防御结果，暂不能演练。不能按当前护甲、闪避或护盾面板自行选择结果。'
  if (modId === 'EssenceGrantedPassive')
    return '当前目录尚未接入此精华授予的随机核心天赋，暂不能演练。此限制不代表游戏禁止对该装备使用精华。'
  return '此效果尚未解析，不能据此模拟。'
}
