import { cn } from "@/lib/utils";

/**
 * 仪表盘概览全场景微光骨架屏 (Zero Layout Shift)
 * 尺寸与 DataOverview 各卡片 1:1 像素级对齐
 */
export function DataOverviewSkeleton() {
  return (
    <div className="space-y-5 sm:space-y-8 animate-pulse">
      {/* 1. 顶部经营概况核心卡片区 */}
      <div className="grid items-stretch gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
        {/* 左侧：经营概况核心大卡片 */}
        <section className="relative overflow-hidden flex h-full min-w-0 flex-col justify-between rounded-[28px] border border-black/8 bg-white/75 p-4.5 shadow-xs backdrop-blur-md dark:border-white/10 dark:bg-white/4 sm:p-5 lg:p-6">
          <div>
            {/* 顶栏标题与状态胶囊 */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="h-5 w-5 rounded-md bg-black/6 dark:bg-white/8" />
                <div className="h-4 w-16 rounded-md bg-black/6 dark:bg-white/8" />
                <div className="h-4 w-20 rounded-full bg-black/5 dark:bg-white/6" />
              </div>
              <div className="h-6 w-20 rounded-full bg-black/6 dark:bg-white/8" />
            </div>

            {/* 净利润巨大数字骨架 */}
            <div className="mt-3 sm:mt-4 space-y-2">
              <div className="h-10 sm:h-12 w-48 sm:w-64 rounded-xl bg-black/8 dark:bg-white/10" />
              <div className="h-4 w-32 rounded-md bg-black/5 dark:bg-white/6" />
            </div>
          </div>

          {/* 中间收支流水三要素骨架 */}
          <div className="my-3 grid grid-cols-3 gap-1.5 rounded-2xl border border-black/5 bg-black/[0.02] p-2.5 dark:border-white/6 dark:bg-white/[0.025] sm:my-3 sm:gap-3 sm:p-3.5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="min-w-0 space-y-2">
                <div className="h-3 w-12 sm:w-16 rounded-md bg-black/6 dark:bg-white/8" />
                <div className="h-5 sm:h-6 w-20 sm:w-28 rounded-lg bg-black/8 dark:bg-white/10" />
                <div className="h-2.5 w-14 sm:w-20 rounded-md bg-black/4 dark:bg-white/6" />
              </div>
            ))}
          </div>

          {/* 底部利润构成 4 拆解项骨架 */}
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 sm:gap-2.5">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="rounded-[18px] border border-black/6 bg-white/70 p-3 dark:border-white/8 dark:bg-white/4 space-y-2">
                <div className="h-3 w-12 rounded-md bg-black/6 dark:bg-white/8" />
                <div className="h-5 w-16 sm:w-20 rounded-lg bg-black/8 dark:bg-white/10" />
                <div className="h-2.5 w-10 rounded-md bg-black/4 dark:bg-white/6" />
              </div>
            ))}
          </div>
        </section>

        {/* 右侧：核心指标卡组骨架 */}
        <section className="flex h-full min-w-0 flex-col justify-between rounded-[28px] border border-black/8 bg-white/75 p-4 shadow-xs backdrop-blur-sm dark:border-white/10 dark:bg-white/4 sm:p-5 lg:p-6 space-y-3">
          <div className="flex items-center justify-between">
            <div className="h-4 w-20 rounded-md bg-black/6 dark:bg-white/8" />
            <div className="h-4 w-12 rounded-md bg-black/5 dark:bg-white/6" />
          </div>

          {/* 3 个指标块骨架 */}
          <div className="grid grid-cols-3 gap-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-[18px] border border-black/6 bg-white/70 p-3 dark:border-white/8 dark:bg-white/4 space-y-2">
                <div className="h-3 w-10 rounded-md bg-black/6 dark:bg-white/8" />
                <div className="h-5 w-14 rounded-lg bg-black/8 dark:bg-white/10" />
                <div className="h-2.5 w-12 rounded-md bg-black/4 dark:bg-white/6" />
              </div>
            ))}
          </div>

          {/* 费用流转拆解骨架 */}
          <div className="flex-1 rounded-2xl border border-black/5 bg-black/[0.02] p-3 dark:border-white/6 dark:bg-white/[0.025] space-y-2.5 min-h-[140px] flex flex-col justify-around">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-black/8 dark:bg-white/10" />
                  <div className="h-3 w-16 rounded-md bg-black/6 dark:bg-white/8" />
                </div>
                <div className="h-3 w-12 rounded-md bg-black/8 dark:bg-white/10" />
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* 2. 客户分析双列卡片骨架 */}
      <section className="rounded-[28px] border border-black/8 bg-white/75 p-4 shadow-xs backdrop-blur-sm dark:border-white/10 dark:bg-white/4 sm:p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="space-y-1.5">
            <div className="h-5 w-24 rounded-lg bg-black/8 dark:bg-white/10" />
            <div className="h-3 w-40 rounded-md bg-black/5 dark:bg-white/6" />
          </div>
          <div className="h-7 w-20 rounded-full bg-black/6 dark:bg-white/8" />
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          {/* 左侧：客户画像结构骨架 */}
          <div className="flex min-w-0 flex-col justify-between rounded-[22px] border border-black/6 bg-black/[0.015] p-3.5 dark:border-white/8 dark:bg-white/[0.025] sm:p-4 space-y-3.5">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="h-4 w-24 rounded-md bg-black/7 dark:bg-white/9" />
                <div className="h-3 w-28 rounded-md bg-black/5 dark:bg-white/6" />
              </div>
              <div className="h-3 w-full rounded-full bg-black/6 dark:bg-white/8" />
              <div className="grid grid-cols-2 gap-2">
                <div className="h-16 rounded-xl bg-black/4 dark:bg-white/5" />
                <div className="h-16 rounded-xl bg-black/4 dark:bg-white/5" />
              </div>
            </div>

            {/* 3 个 Pod 骨架 */}
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 rounded-2xl border border-black/5 bg-white/60 dark:border-white/6 dark:bg-white/[0.02] p-2.5 space-y-2">
                  <div className="h-2.5 w-12 rounded-md bg-black/6 dark:bg-white/8" />
                  <div className="h-5 w-16 rounded-lg bg-black/8 dark:bg-white/10" />
                  <div className="h-2 w-10 rounded-md bg-black/4 dark:bg-white/6" />
                </div>
              ))}
            </div>

            <div className="h-8 w-full rounded-xl bg-black/3 dark:bg-white/4" />
          </div>

          {/* 右侧：老客常买商品 Top 5 骨架 */}
          <div className="min-w-0 rounded-[22px] border border-black/6 bg-black/[0.015] p-3.5 dark:border-white/8 dark:bg-white/[0.025] sm:p-5 space-y-2">
            <div className="mb-3 flex items-center justify-between">
              <div className="h-4 w-28 rounded-md bg-black/7 dark:bg-white/9" />
              <div className="h-5 w-16 rounded-full bg-black/5 dark:bg-white/6" />
            </div>

            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-2.5 rounded-2xl border border-black/5 bg-white/70 p-2 dark:border-white/6 dark:bg-white/[0.02] sm:gap-3 sm:p-2.5">
                <div className="h-6 w-6 shrink-0 rounded-full bg-black/6 dark:bg-white/8" />
                <div className="h-11 w-11 shrink-0 rounded-xl bg-black/5 dark:bg-white/7" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="h-3.5 w-3/4 rounded-md bg-black/7 dark:bg-white/9" />
                  <div className="h-2.5 w-1/3 rounded-md bg-black/4 dark:bg-white/6" />
                </div>
                <div className="h-4 w-12 rounded-md bg-black/6 dark:bg-white/8" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3. 平台结构卡片骨架 */}
      <section className="rounded-[28px] border border-black/8 bg-white/75 p-4 shadow-xs backdrop-blur-sm dark:border-white/10 dark:bg-white/4 sm:p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="space-y-1.5">
            <div className="h-5 w-24 rounded-lg bg-black/8 dark:bg-white/10" />
            <div className="h-3 w-36 rounded-md bg-black/5 dark:bg-white/6" />
          </div>
          <div className="h-7 w-28 rounded-full bg-black/6 dark:bg-white/8" />
        </div>

        {/* 流体条骨架 */}
        <div className="mb-3 h-10 w-full rounded-2xl border border-black/6 bg-white/60 p-2.5 dark:border-white/8 dark:bg-white/[0.02] flex items-center">
          <div className="h-2.5 w-full rounded-full bg-black/6 dark:bg-white/8" />
        </div>

        {/* 6 个平台卡片骨架（移动端横滑轨 / 桌面端6列） */}
        <div className="flex gap-2.5 overflow-x-auto pb-2 pt-0.5 -mx-1 px-1 sm:mx-0 sm:px-0 sm:pb-0 sm:pt-0 sm:grid sm:grid-cols-3 xl:grid-cols-6 sm:gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="flex w-[152px] shrink-0 flex-col justify-between rounded-2xl border border-black/8 bg-white/80 p-3.5 dark:border-white/8 dark:bg-white/[0.03] sm:w-auto sm:p-4 space-y-3 h-[138px]"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div className="h-4.5 w-4.5 rounded-xs bg-black/8 dark:bg-white/10" />
                  <div className="h-3.5 w-12 rounded-md bg-black/7 dark:bg-white/9" />
                </div>
                <div className="h-4 w-8 rounded-md bg-black/5 dark:bg-white/6" />
              </div>

              <div className="space-y-2">
                <div className="h-7 w-16 rounded-lg bg-black/9 dark:bg-white/12" />
                <div className="h-1 w-full rounded-full bg-black/6 dark:bg-white/8" />
              </div>

              <div className="flex items-center justify-between pt-1">
                <div className="h-2.5 w-10 rounded-md bg-black/5 dark:bg-white/6" />
                <div className="h-2.5 w-12 rounded-md bg-black/6 dark:bg-white/8" />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 4. 每日盈亏与订单波动图表骨架 */}
      <div className="grid gap-6 grid-cols-1 xl:grid-cols-2">
        {[1, 2].map((i) => (
          <section key={i} className="rounded-[28px] border border-black/8 bg-white/75 p-4 shadow-xs backdrop-blur-sm dark:border-white/10 dark:bg-white/4 sm:p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="space-y-1.5">
                <div className="h-5 w-20 rounded-lg bg-black/8 dark:bg-white/10" />
                <div className="h-3 w-28 rounded-md bg-black/5 dark:bg-white/6" />
              </div>
              <div className="h-8 w-24 rounded-full bg-black/6 dark:bg-white/8" />
            </div>
            <div className="h-65 sm:h-72.5 w-full rounded-2xl bg-black/[0.02] dark:bg-white/[0.015] border border-black/4 dark:border-white/6 flex items-end p-4 gap-2">
              {/* 模拟图表条形网格微波 */}
              {[40, 65, 30, 80, 55, 90, 45, 70, 85, 60, 75, 50].map((h, idx) => (
                <div
                  key={idx}
                  style={{ height: `${h}%` }}
                  className="flex-1 rounded-t-md bg-black/4 dark:bg-white/5"
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
