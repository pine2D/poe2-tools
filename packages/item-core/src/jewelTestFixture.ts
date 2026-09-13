import { boneCatalog, boneState } from './boneTestFixture'
import { JEWEL_SOURCE } from './jewels'

/** 珠宝容量测试只用合成词缀，不复制实际目录记录。 */
export function jewelFixture() {
  const catalog = boneCatalog('Jewel')
  catalog._meta.sources.push(JEWEL_SOURCE)
  const base = catalog.bases[0]
  if (!base) throw Error('缺少测试基底')
  base.id = 'Sapphire'
  base.name = 'Sapphire'
  base.tags = ['default', 'jewel', 'intjewel']
  base.socketLimit = null
  catalog.modifiers = catalog.modifiers
    .filter((m) => !m.desecratedOnly)
    .map((m) => ({
      ...m,
      jewelOnly: true,
      eligibility: [
        { tag: 'intjewel', value: 1 },
        { tag: 'jewel', value: 0 },
        { tag: 'default', value: 0 },
      ],
    }))
  const state = { ...boneState(), baseId: 'Sapphire' }
  delete state.sockets
  return { catalog, state, base }
}
