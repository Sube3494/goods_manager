import { RefreshCw } from "lucide-react";
import { StatsGrid } from "@/components/Dashboard/StatsGrid";
import { RecentInbound } from "@/components/Dashboard/RecentInbound";
import { QuickActions } from "@/components/Dashboard/QuickActions";

export default function Home() {
  return (
    <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-foreground bg-clip-text text-transparent bg-linear-to-r from-foreground to-foreground/60">
            库存概览
          </h1>
          <p className="text-muted-foreground mt-2 text-lg">
            实时监控仓库状态与资产总值。
          </p>
        </div>
        <div className="text-xs font-medium text-muted-foreground bg-white/5 px-4 py-2 rounded-full border border-white/10 backdrop-blur-sm flex items-center gap-2 hover:bg-white/10 transition-colors cursor-pointer">
           <RefreshCw size={12} className="animate-spin-slow" />
           数据同步中...
        </div>
      </div>

      {/* Stats Area */}
      <StatsGrid />

      {/* Main Content Grid */}
      <div className="grid gap-6 md:grid-cols-3 lg:grid-cols-3 h-full items-stretch">
        <div className="md:col-span-2 h-full">
            <RecentInbound />
        </div>
        <div className="h-full">
           <QuickActions />
        </div>
      </div>
    </div>
  );
}
