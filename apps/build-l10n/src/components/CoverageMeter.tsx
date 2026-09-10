// 覆盖率轨：一格 = 一条编号行，缺口的位置就是未命中行的位置，点一下跳过去。
// 不用进度环——环把 N 条行压成一个角度，丢掉了"哪几行"这个用户下一步真正要的信息。
//
// 非颜色冗余：命中是矮实心格，未命中是高空心格（形状差异），颜色只是辅助。
// 键盘与读屏：整条轨 role="group" + 一句完整说明；命中格 aria-hidden 的装饰 span，
// 未命中格是真按钮。66 条编号行（真实上限，报告 §3.4）全做成按钮会往 Tab 序里
// 塞 66 个停靠点，而用户唯一想去的地方就是那几条缺口。
//
// 不做聚合降级：真实数据最小 7、中位数 9、最大 66，格宽下限 6px + 超宽换行足够。

export interface MeterCell {
  /** 该行的 DOM id，点击后跳过去 */
  domId: string
  /** 「戒指 2 · 第 3 行」 */
  where: string
  hit: boolean
}

export interface CoverageMeterProps {
  cells: readonly MeterCell[]
  size?: 'sm' | 'lg'
  onJump(domId: string): void
}

export function CoverageMeter({ cells, size = 'lg', onJump }: CoverageMeterProps) {
  if (cells.length === 0) return null
  const hit = cells.filter((cell) => cell.hit).length
  const miss = cells.length - hit
  return (
    // fieldset 而非 span + role="group"：Biome 的 useSemanticElements 要求 role="group"
    // 落在原生就有该隐含角色的元素上；fieldset 天然是 group，aria-label 直接覆盖它的
    // accessible name 计算（不需要 legend）。.meter 里重置掉浏览器默认的边框 / 内边距。
    <fieldset
      className={size === 'sm' ? 'meter meter--sm' : 'meter'}
      aria-label={`共 ${cells.length} 条编号行，命中 ${hit} 条，未命中 ${miss} 条`}
    >
      {cells.map((cell) =>
        cell.hit ? (
          <span key={cell.domId} className="meter__cell meter__cell--hit" aria-hidden="true" />
        ) : (
          <button
            key={cell.domId}
            type="button"
            className="meter__cell meter__cell--miss"
            aria-label={`跳到未命中：${cell.where}`}
            onClick={() => onJump(cell.domId)}
          />
        ),
      )}
    </fieldset>
  )
}
