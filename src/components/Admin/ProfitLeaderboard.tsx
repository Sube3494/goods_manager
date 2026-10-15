"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import md5 from "blueimp-md5";
import { Crown, RefreshCw, Sparkles, Trophy, ChevronRight } from "lucide-react";
import { formatLocalDate } from "@/lib/dateUtils";
import { cn } from "@/lib/utils";
import { DateRangePicker } from "@/components/ui/DateRangePicker";
import { presetDashboardDateRange, type DashboardDateRange } from "@/lib/dashboardDateRange";
import { loadProfitLeaderboardCache, readProfitLeaderboardCache, type LeaderboardMember as Member, type LeaderboardResult } from "@/lib/profitLeaderboardCache";
import styles from "./ProfitLeaderboard.module.css";

const rangeLabels: Record<string, string> = { today: "今日", yesterday: "昨日", month: "本月", lastMonth: "上月", "30d": "近30天", all: "累计", custom: "区间" };
const currency = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" });
const updatedTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});
const clockTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

function LeaderboardAvatar({ member, compact = false }: { member: Member; compact?: boolean }) {
  const [failed, setFailed] = useState(false);
  const size = compact ? 32 : 64;
  return (
    <span className={compact ? styles.rowAvatar : styles.avatar}>
      <span aria-hidden="true">{Array.from(member.name)[0] || "成"}</span>
      {!failed && <Image
        src={`https://cravatar.cn/avatar/${md5(member.email.trim().toLowerCase())}?d=mp&s=${size * 2}`}
        alt={`${member.name} 的头像`}
        fill
        sizes={`${size}px`}
        className="object-cover"
        onError={() => setFailed(true)}
      />}
    </span>
  );
}

export function ProfitLeaderboard({ members, cacheScope, onSelect }: {
  members: Member[];
  cacheScope: string;
  onSelect: (id: string) => void;
}) {
  const [dateRange, setDateRange] = useState<DashboardDateRange>(() => presetDashboardDateRange("month", formatLocalDate(new Date())));
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState<(LeaderboardResult & { key: string }) | null>(null);
  const refreshRef = useRef(refresh);
  // A stable primitive keeps unrelated member status updates from refetching the entire board.
  const memberKey = JSON.stringify(members);
  const today = formatLocalDate(new Date());
  const resolvedRange = dateRange.rangePreset === "custom" ? dateRange : presetDashboardDateRange(dateRange.rangePreset, today);
  const { rangePreset, startDate, endDate } = resolvedRange;
  const cacheKey = JSON.stringify(["order-pure-profit-v1", cacheScope, today, rangePreset, startDate, endDate, memberKey]);
  const requestKey = `${cacheKey}:${refresh}`;
  const cached = readProfitLeaderboardCache(cacheKey);
  const displayedResult = result?.key === requestKey ? result : cached;
  const pending = result?.key !== requestKey;
  const loading = !displayedResult;

  useEffect(() => {
    let cancelled = false;
    const force = refreshRef.current !== refresh;
    refreshRef.current = refresh;
    async function load(): Promise<LeaderboardResult> {
      const targets: Member[] = JSON.parse(memberKey);
      const rows: Array<Member & { profit: number }> = [];
      let cursor = 0;
      let failed = false;
      async function worker() {
        while (cursor < targets.length) {
          const member = targets[cursor++];
          const query = new URLSearchParams({ userId: member.id, _leaderboard: "1", pageSize: "1", endDate });
          if (rangePreset !== "all") query.set("startDate", startDate);
          try {
            const response = await fetch(`/api/orders?${query}`, { cache: "no-store" });
            if (!response.ok) throw new Error("Stats unavailable");
            const data = await response.json();
            if (data.eligible === false) continue;
            if (data.eligible !== true) throw new Error("Eligibility unavailable");
            if (typeof data.pureProfit !== "number" || !Number.isFinite(data.pureProfit)) throw new Error("Invalid pure profit");
            rows.push({ ...member, profit: data.pureProfit });
          } catch {
            failed = true;
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(3, targets.length) }, worker));
      rows.sort((a, b) => b.profit - a.profit || a.id.localeCompare(b.id));
      let rank = 1;
      const ranked = rows.map((row, index) => {
        if (index > 0 && row.profit !== rows[index - 1].profit) rank = index + 1;
        return { ...row, rank };
      });
      return { rows: ranked, failed };
    }
    void loadProfitLeaderboardCache(cacheKey, load, force).then(data => {
      if (!cancelled) setResult({ ...data, key: requestKey });
    });
    return () => { cancelled = true; };
  }, [cacheKey, memberKey, rangePreset, startDate, endDate, refresh, requestKey]);

  const rows = displayedResult?.rows || [];
  const podium = rows.slice(0, 3);
  const remainingMembers = rows.slice(3);
  const periodLabel = rangeLabels[rangePreset] || "区间";
  const statisticsTime = rangePreset === "all"
    ? `全部历史数据 · 截至 ${endDate}`
    : startDate === endDate ? startDate : `${startDate} 至 ${endDate}`;
  return (
    <section className={styles.board} aria-label="成员利润排行榜" aria-busy={pending}>
      <header className={styles.header}>
        <h2 className={styles.title}><Trophy size={22} aria-hidden="true" />利润排行榜</h2>
      </header>
      <div className={styles.toolbar}>
        <DateRangePicker
          startDate={rangePreset === "all" ? "" : startDate}
          endDate={rangePreset === "all" ? "" : endDate}
          onPresetChange={preset => setDateRange(presetDashboardDateRange(preset, today))}
          onChange={range => setDateRange(range.startDate && range.endDate
            ? { rangePreset: "custom", ...range }
            : presetDashboardDateRange("all", today))}
          maxDate={today}
          includeToday
          hasAllPreset
          className="h-10 min-w-0 max-w-full"
          triggerClassName="h-10 w-full [&>div>span]:truncate rounded-full border border-black/8 bg-white/80 px-4 text-xs font-bold shadow-2xs dark:border-white/10 dark:bg-white/5"
        />
        <div className={styles.refreshControls}>
          <span className={styles.updatedTime}>
            <span><span className={styles.desktopOnly}>数据</span>更新于</span>
            {displayedResult?.updatedAt && !displayedResult.failed
              ? <time dateTime={new Date(displayedResult.updatedAt).toISOString()} title={`北京时间 ${formatLocalDate(new Date(displayedResult.updatedAt))} ${clockTimeFormatter.format(displayedResult.updatedAt)}`}><span className={styles.desktopOnly}>{updatedTimeFormatter.format(displayedResult.updatedAt).replaceAll("/", "-")}</span><span className={styles.mobileOnly}>{clockTimeFormatter.format(displayedResult.updatedAt)}</span></time>
              : <span>{pending ? "正在获取…" : "暂无数据"}</span>}
          </span>
          <button type="button" onClick={() => setRefresh(value => value + 1)} disabled={pending} aria-label="刷新利润排行榜" className={styles.refresh}><RefreshCw size={17} className={pending ? "motion-safe:animate-spin" : ""} /></button>
        </div>
      </div>
      <div key={cacheKey} aria-live="polite" className={cn(styles.content, pending && !loading && styles.updating)}>
        {loading ? <div className={styles.loadingPanel} role="status">
            <div className={styles.skeletonPodium} aria-hidden="true">{[0, 1, 2].map(index => <div key={index} className={styles.skeletonMember}><span /><i /><i /></div>)}</div>
            <p>正在校验麦芽田凭证并汇总订单纯利润…</p>
          </div>
          : displayedResult?.failed ? <div className={styles.message}>部分成员数据加载失败，暂无法生成完整排名。<button type="button" onClick={() => setRefresh(value => value + 1)} className="ml-2 underline underline-offset-4">重新加载</button></div>
          : !rows.length ? <div className={styles.message}>暂无麦芽田凭证校验有效的成员</div>
          : <div className={styles.reveal}>
            <div className={styles.spotlight}>
              <div className={styles.spotlightHeading}><span><Sparkles size={13} aria-hidden="true" />{periodLabel}荣誉榜</span><span>TOP {podium.length}</span></div>
              <p className={styles.statisticsTime}>统计时间：{statisticsTime}<span>（北京时间）</span></p>
              <div className={styles.podium} data-count={podium.length}>
                {podium.map((member, index) => (
                  <button type="button" key={member.id} onClick={() => onSelect(member.id)} className={cn(styles.winner, [styles.gold, styles.silver, styles.bronze][Math.min(member.rank - 1, 2)])} data-position={index + 1} aria-label={`第 ${member.rank} 名 ${member.name}，订单纯利润 ${currency.format(member.profit)}，查看订单`}>
                    <span className={styles.medallion}>
                      {member.rank === 1 && <Crown size={25} className={styles.crown} aria-hidden="true" />}
                      <LeaderboardAvatar key={member.email} member={member} />
                      <span className={styles.rankEmblem} aria-hidden="true">{member.rank}</span>
                    </span>
                    <span title={member.name} className={styles.winnerName}>{member.name}</span>
                    <span className={cn(styles.profit, member.profit < 0 && styles.negative)}>{currency.format(member.profit)}</span>
                    <span className={styles.place}>订单纯利润 · 第 {member.rank} 名</span>
                    <span className={styles.pedestal} aria-hidden="true"><span>{String(member.rank).padStart(2, "0")}</span></span>
                  </button>
                ))}
              </div>
            </div>
            {remainingMembers.length > 0 && <div className={styles.standings}>
              <div className={styles.listHeading}><h3>后续排名 <span>{remainingMembers.length}</span></h3><span>{periodLabel}纯利润</span></div>
              <div className={styles.columnHeading}><span>排名 / 成员</span><span>订单纯利润（元）</span></div>
              <ol start={4} aria-label="后续成员利润排名" className={styles.list}>
                {remainingMembers.map(member => (
                  <li key={member.id}>
                    <button type="button" onClick={() => onSelect(member.id)} aria-label={`第 ${member.rank} 名 ${member.name}，订单纯利润 ${currency.format(member.profit)}，查看订单`} className={styles.row}>
                      <span className={cn(styles.rowRank, member.rank <= 3 && styles.topRank)}>{String(member.rank).padStart(2, "0")}</span>
                      <LeaderboardAvatar key={member.email} member={member} compact />
                      <span title={member.name} className={styles.rowName}>{member.name}</span>
                      <span className={cn(styles.rowProfit, member.profit < 0 && styles.negative)}>{currency.format(member.profit)}</span>
                      <ChevronRight size={14} className={styles.chevron} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ol>
              <p className={styles.footnote}>仅麦芽田凭证校验有效的成员参与 · 同额并列</p>
            </div>}
          </div>}
      </div>
    </section>
  );
}
