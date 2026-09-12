import { beltCatalog, beltState, required } from './beltTestFixture'

/** 目录槽行在第二行，便于暴露行身份与扁平数值索引混淆。 */
export function implicitTargetFixture() {
  const catalog = beltCatalog()
  const base = required(catalog.bases[0])
  base.implicit = '(10-20)% increased Flask Charges gained\nHas (1-3) Charm Slot'
  const state = {
    ...beltState(),
    implicitLines: ['15(10-20)% increased Flask Charges gained', 'Has 1(1-2) Charm Slot'],
  }
  return { catalog, base, state }
}
