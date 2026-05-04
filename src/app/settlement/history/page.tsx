"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Calendar,
  FileText,
  Percent,
  Trash2,
  TrendingUp,
  Wallet,
  Search,
  RotateCcw,
  Eye,
  Edit2,
  Loader2,
  Receipt,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { format, isWithinInterval, startOfDay, endOfDay, parseISO } from "date-fns";
import { zhCN } from "date-fns/locale";

import { useToast } from "@/components/ui/Toast";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { useUser } from "@/hooks/useUser";
import { hasPermission, SessionUser } from "@/lib/permissions";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { DatePicker } from "@/components/ui/DatePicker";
import { Pagination } from "@/components/ui/Pagination";
import { EmptyState } from "@/components/ui/EmptyState";
import { SettlementDetailModal } from "@/components/Settlement/SettlementDetailModal";
import { Settlement, AddressItem } from "@/lib/types";

const formatCurrency = (value: number) =>
  `¥${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const getSettlementShopNames = (settlement: Settlement, knownShopLabels: string[] = []) => {
  const itemNames = settlement.items
    .map((item) => item.shopName?.trim())
    .filter((name): name is string => Boolean(name));

  if (itemNames.length > 0) {
    return Array.from(new Set(itemNames));
  }

  const rootNames = (settlement.shopName || "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);

  if (rootNames.length > 0) {
    return Array.from(new Set(rootNames));
  }

  const note = settlement.note || "";
  const matchedFromNote = knownShopLabels.filter((shopLabel) => note.includes(shopLabel));
  return Array.from(new Set(matchedFromNote));
};

export default function SettlementHistoryPage() {
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  
  // Filters
  const [filterShop, setFilterShop] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const today = format(new Date(), "yyyy-MM-dd");
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Detail Modal
  const [selectedSettlement, setSelectedSettlement] = useState<Settlement | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // Delete Modal
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const { user, isLoading: userLoading } = useUser();
  const { showToast } = useToast();
  const canManage = hasPermission(user as SessionUser | null, "settlement:manage");
  
  const profileShopLabels = useMemo(
    () => ((user?.shippingAddresses as AddressItem[] | undefined) || []).map((shop) => shop.label).filter(Boolean),
    [user?.shippingAddresses]
  );

  useEffect(() => {
    fetchSettlements();
  }, []);

  const fetchSettlements = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/settlements");
      if (!res.ok) throw new Error("获取历史记录失败");
      const result = await res.json();
      setSettlements(result.data as Settlement[]);
    } catch (err) {
      showToast((err as Error).message, "error");
    } finally {
      setLoading(false);
    }
  };

  const filteredSettlements = useMemo(() => {
    return settlements.filter((settlement) => {
      // Shop filter
      const shopNames = getSettlementShopNames(settlement, profileShopLabels);
      const matchesShop = !filterShop || shopNames.includes(filterShop);
      
      // Search query filter (note or ID)
      const matchesSearch = !searchQuery || 
        settlement.note?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        settlement.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        shopNames.some(s => s.toLowerCase().includes(searchQuery.toLowerCase()));

      // Date range filter (based on settlement.date)
      let matchesDate = true;
      if (startDate || endDate) {
        const sDate = new Date(settlement.date);
        const start = startDate ? startOfDay(parseISO(startDate)) : new Date(0);
        const end = endDate ? endOfDay(parseISO(endDate)) : new Date(8640000000000000);
        matchesDate = isWithinInterval(sDate, { start, end });
      }

      return matchesShop && matchesSearch && matchesDate;
    });
  }, [settlements, filterShop, searchQuery, startDate, endDate, profileShopLabels]);

  const totalItems = filteredSettlements.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const paginatedSettlements = filteredSettlements.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [filterShop, searchQuery, startDate, endDate, pageSize]);

  const availableShopOptions = useMemo(() => {
    const knownFromHistory = settlements.flatMap((settlement) => getSettlementShopNames(settlement, profileShopLabels));
    return Array.from(new Set([...profileShopLabels, ...knownFromHistory])).filter(Boolean);
  }, [settlements, profileShopLabels]);

  const historyStats = useMemo(() => {
    const totalNet = filteredSettlements.reduce((sum, item) => sum + item.totalNet, 0);
    const totalServiceFee = filteredSettlements.reduce((sum, item) => sum + item.serviceFee, 0);
    return {
      count: filteredSettlements.length,
      totalNet,
      totalServiceFee,
      totalIncome: totalNet - totalServiceFee,
      totalFinalBalance: filteredSettlements.reduce((sum, item) => sum + item.finalBalance, 0),
      totalBrushing: filteredSettlements.reduce((sum, item) => {
        return sum + item.items.reduce((iSum, i) => iSum + i.brushing, 0);
      }, 0),
      totalItems: filteredSettlements.reduce((sum, item) => sum + item.items.length, 0),
    };
  }, [filteredSettlements]);

  const handleViewDetails = (settlement: Settlement) => {
    setSelectedSettlement(settlement);
    setIsDetailModalOpen(true);
  };

  const handleDeleteClick = (id: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setPendingDeleteId(id);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;

    setDeletingId(id);
    try {
      const res = await fetch(`/api/settlements/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("删除失败");

      setSettlements((prev) => prev.filter((item) => item.id !== id));
      showToast("记录已删除", "success");
    } catch (err) {
      showToast((err as Error).message, "error");
    } finally {
      setDeletingId(null);
      setPendingDeleteId(null);
      setIsDeleteModalOpen(false);
    }
  };


  if (loading) {
    return (
      <div className="flex min-h-[420px] flex-col items-center justify-center space-y-4">
        <Loader2 className="animate-spin text-primary" size={40} />
        <p className="animate-pulse text-muted-foreground">正在加载历史记录...</p>
      </div>
    );
  }

  if (userLoading) return null;
  if (!canManage) return null;

  return (
    <div className="space-y-8 pb-20 max-w-[1600px] mx-auto animate-in fade-in duration-500">
      {/* Header section with unified style */}
      <div className="flex flex-row items-center justify-between gap-4 mb-4 md:mb-8 transition-all">
        <div className="flex items-center gap-3 md:gap-4">
          <Link
            href="/settlement"
            className="flex h-9 w-9 sm:h-12 sm:w-12 items-center justify-center rounded-full border border-border bg-white dark:bg-white/5 shadow-sm transition-all hover:bg-muted dark:hover:bg-white/10"
          >
            <ArrowLeft size={18} className="md:w-5 md:h-5" />
          </Link>
          <div>
            <h1 className="text-xl sm:text-4xl font-bold tracking-tight text-foreground">结算历史</h1>
            <p className="hidden md:block text-muted-foreground mt-2 text-sm sm:text-lg">浏览已保存的结算档案，支持多维度检索与报表导出。</p>
          </div>
        </div>
      </div>

      {/* Filter Toolbar - Consolidated Row */}
      <div className="flex flex-col md:flex-row items-center gap-2.5 mb-6 md:mb-8">
        {/* Search Bar */}
        <div className="w-full md:flex-1 h-10 sm:h-11 px-4 sm:px-5 rounded-full bg-white/70 dark:bg-white/5 border border-border dark:border-white/10 backdrop-blur-md flex items-center gap-3 focus-within:ring-2 focus-within:ring-primary/20 transition-all dark:hover:bg-white/10 group">
          <Search size={18} className="text-muted-foreground group-focus-within:text-primary transition-colors shrink-0" />
          <input
            type="text"
            placeholder="搜索 ID、备注..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent border-none outline-none w-full text-foreground placeholder:text-muted-foreground text-sm h-full"
          />
        </div>

        {/* Filters Group */}
        <div className="flex items-center gap-2 h-10 sm:h-11 w-full md:w-auto">
          <div className="flex items-center gap-1.5 h-full flex-1 md:flex-none">
            <DatePicker
              value={startDate}
              onChange={setStartDate}
              placeholder="起始日期"
              maxDate={today}
              className="h-full flex-1 md:w-32 lg:w-36"
              triggerClassName="rounded-full shadow-sm bg-white/70 dark:bg-white/5 border-border dark:border-white/10 backdrop-blur-md dark:hover:bg-white/10 transition-all"
            />
            <DatePicker
              value={endDate}
              onChange={setEndDate}
              placeholder="截止日期"
              maxDate={today}
              className="h-full flex-1 md:w-32 lg:w-36"
              triggerClassName="rounded-full shadow-sm bg-white/70 dark:bg-white/5 border-border dark:border-white/10 backdrop-blur-md dark:hover:bg-white/10 transition-all"
            />
          </div>
          
          <div className="h-full min-w-[120px] sm:min-w-[140px] md:min-w-[160px]">
            <CustomSelect
              options={[
                { value: "", label: "全部店铺" },
                ...availableShopOptions.map((shopName) => ({
                  value: shopName,
                  label: shopName,
                })),
              ]}
              value={filterShop}
              onChange={setFilterShop}
              placeholder="筛选店铺"
              className="h-full"
              triggerClassName="h-full rounded-full border shadow-sm px-4 sm:px-5 text-sm font-medium bg-white/70 dark:bg-white/5 border-border dark:border-white/10 backdrop-blur-md dark:hover:bg-white/10 transition-all"
            />
          </div>

          {(searchQuery || filterShop || startDate || endDate) && (
            <button
              onClick={() => {
                setSearchQuery("");
                setFilterShop("");
                setStartDate("");
                setEndDate("");
              }}
              className="h-10 w-10 sm:h-11 sm:w-11 flex items-center justify-center rounded-full bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white transition-all shrink-0 shadow-sm"
              title="重置筛选"
            >
              <RotateCcw size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Stats Cards - 2x2 on Mobile */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="rounded-2xl border border-border bg-white p-3 sm:p-5 shadow-sm dark:bg-white/5 dark:hover:bg-white/10 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-muted-foreground">结算单数</span>
            <Receipt size={14} className="text-primary/40 sm:w-4 sm:h-4" />
          </div>
          <p className="mt-1 sm:mt-3 text-lg sm:text-2xl font-bold tracking-tight">{historyStats.count}</p>
        </div>
        <div className="rounded-2xl border border-border bg-white p-3 sm:p-5 shadow-sm dark:bg-white/5 dark:hover:bg-white/10 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-muted-foreground">累计真实业绩</span>
            <TrendingUp size={14} className="text-primary/40 sm:w-4 sm:h-4" />
          </div>
          <p className="mt-1 sm:mt-3 text-lg sm:text-2xl font-bold tracking-tight text-primary">{formatCurrency(historyStats.totalNet)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-white p-3 sm:p-5 shadow-sm dark:bg-white/5 dark:hover:bg-white/10 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-muted-foreground">累计收入</span>
            <Wallet size={14} className="text-primary/40 sm:w-4 sm:h-4" />
          </div>
          <p className="mt-1 sm:mt-3 text-lg sm:text-2xl font-bold tracking-tight text-foreground">{formatCurrency(historyStats.totalIncome)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-white p-3 sm:p-5 shadow-sm dark:bg-white/5 dark:hover:bg-white/10 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-muted-foreground">累计抽成</span>
            <Percent size={14} className="text-orange-500/40 sm:w-4 sm:h-4" />
          </div>
          <p className="mt-1 sm:mt-3 text-lg sm:text-2xl font-bold tracking-tight text-orange-500">{formatCurrency(historyStats.totalServiceFee)}</p>
        </div>
      </div>

      {/* Main Content - Table Container (Responsive) */}
      <div className="rounded-2xl sm:rounded-3xl border border-border bg-white dark:bg-white/5 overflow-hidden shadow-sm">
        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          {paginatedSettlements.length > 0 ? (
            <table className="w-full text-left border-collapse min-w-[1000px] table-auto">
              <thead>
                <tr className="border-b border-border bg-muted/30 dark:bg-white/5">
                  <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">业务月份 / ID</th>
                  <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">所属店铺</th>
                  <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">最终补差</th>
                  <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">真实业绩</th>
                  <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">明细</th>
                  <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">保存时间</th>
                  <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginatedSettlements.map((settlement) => {
                  const shopNames = getSettlementShopNames(settlement, profileShopLabels);
                  return (
                    <tr
                      key={settlement.id}
                      onClick={() => handleViewDetails(settlement)}
                      className="group cursor-pointer hover:bg-muted/40 dark:hover:bg-white/10 transition-all duration-300"
                    >
                      <td className="px-6 py-5 font-sans">
                        <div className="flex flex-col items-center gap-1">
                          <div className="flex items-center gap-2">
                            <Calendar size={14} className="text-primary" />
                            <span className="font-bold">{format(new Date(settlement.date), "yyyy-MM")}</span>
                          </div>
                          <div className="text-[10px] text-muted-foreground uppercase opacity-50 font-mono">
                            #{settlement.id.slice(-8)}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5 font-sans">
                        <div className="flex flex-wrap justify-center gap-1.5">
                          {shopNames.length > 0 ? (
                            shopNames.map((name, i) => (
                              <span key={i} className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold text-primary">
                                {name}
                              </span>
                            ))
                          ) : (
                            <span className="text-muted-foreground italic">未指定</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-5 text-center font-black text-foreground">
                        {formatCurrency(settlement.finalBalance)}
                      </td>
                      <td className="px-6 py-5 text-center font-bold text-primary/80">
                        {formatCurrency(settlement.totalNet)}
                      </td>
                      <td className="px-6 py-5 text-center font-sans">
                        <span className="rounded-full bg-muted dark:bg-white/5 px-2.5 py-1 text-[10px] font-black">
                          {settlement.items.length} 条
                        </span>
                      </td>
                      <td className="px-6 py-5 text-center text-muted-foreground tabular-nums text-xs">
                        {format(new Date(settlement.createdAt), "yyyy-MM-dd HH:mm")}
                      </td>
                      <td className="px-6 py-5" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-center items-center gap-2">
                          <button
                            onClick={() => handleViewDetails(settlement)}
                            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-all hover:bg-muted/80 dark:hover:bg-white/10 hover:text-primary"
                            title="查看详情"
                          >
                            <Eye size={18} />
                          </button>
                          <Link
                            href={`/settlement?editId=${settlement.id}`}
                            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-all hover:bg-muted/80 dark:hover:bg-white/10 hover:text-orange-500"
                            title="编辑记录"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Edit2 size={18} />
                          </Link>
                          <button
                            onClick={(e) => handleDeleteClick(settlement.id, e)}
                            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-all hover:bg-rose-500/10 dark:hover:bg-rose-500/20 hover:text-rose-500"
                            disabled={deletingId === settlement.id}
                            title="删除记录"
                          >
                            {deletingId === settlement.id ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <EmptyState
              icon={<Receipt size={40} className="text-muted-foreground/30" />}
              title="未找到匹配记录"
              description="尝试调整筛选条件或去创建新的结算单。"
              className="py-20"
            />
          )}
        </div>

        {/* Mobile Card View */}
        <div className="md:hidden divide-y divide-border">
          {paginatedSettlements.length > 0 ? (
            paginatedSettlements.map((settlement) => {
              const shopNames = getSettlementShopNames(settlement, profileShopLabels);
              return (
                <div 
                  key={settlement.id}
                  onClick={() => handleViewDetails(settlement)}
                  className="p-4 active:bg-muted/20 dark:active:bg-white/5 transition-colors"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Calendar size={14} className="text-primary" />
                      <span className="font-bold text-sm">{format(new Date(settlement.date), "yyyy-MM")}</span>
                      <span className="text-[10px] text-muted-foreground font-mono bg-muted/50 dark:bg-white/5 px-1.5 py-0.5 rounded">
                        #{settlement.id.slice(-6)}
                      </span>
                    </div>
                    <span className="text-[10px] font-bold text-muted-foreground">
                      {format(new Date(settlement.createdAt), "MM-dd HH:mm")}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {shopNames.length > 0 ? (
                      shopNames.map((name, i) => (
                        <span key={i} className="rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-bold text-primary">
                          {name}
                        </span>
                      ))
                    ) : (
                      <span className="text-[9px] text-muted-foreground italic">未指定店铺</span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="bg-muted/30 dark:bg-white/5 p-2 rounded-xl">
                      <div className="text-[9px] text-muted-foreground uppercase font-bold mb-0.5">最终补差</div>
                      <div className="text-sm font-black text-foreground">{formatCurrency(settlement.finalBalance)}</div>
                    </div>
                    <div className="bg-muted/30 dark:bg-white/5 p-2 rounded-xl">
                      <div className="text-[9px] text-muted-foreground uppercase font-bold mb-0.5">真实业绩</div>
                      <div className="text-sm font-bold text-primary/80">{formatCurrency(settlement.totalNet)}</div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="text-[10px] text-muted-foreground">
                      包含 <span className="font-bold text-foreground">{settlement.items.length}</span> 条明细记录
                    </div>
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <Link
                        href={`/settlement?editId=${settlement.id}`}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground bg-muted/40 dark:bg-white/5"
                      >
                        <Edit2 size={14} />
                      </Link>
                      <button
                        onClick={(e) => handleDeleteClick(settlement.id, e)}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground bg-muted/40 dark:bg-white/5"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <EmptyState
              icon={<Receipt size={40} className="text-muted-foreground/30" />}
              title="未找到匹配记录"
              description="尝试调整筛选条件。"
              className="py-12"
            />
          )}
        </div>
      </div>

      {/* Pagination */}
      {!loading && totalItems > 0 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={totalItems}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
        />
      )}

      {/* Modals */}
      <SettlementDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        settlement={selectedSettlement}
      />

      <ConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={confirmDelete}
        title="确认删除"
        message="确定要永久删除这条结算记录吗？此操作不可撤销。"
        confirmLabel="确定删除"
        cancelLabel="取消"
        variant="danger"
      />
    </div>
  );
}
