"use client";

import React, { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Camera,
  RefreshCw,
  X,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  PackageCheck,
  CheckCircle2,
  AlertCircle
} from "lucide-react";

export type PhotoItem = {
  url: string;
  type: "pickup" | "delivery";
  label: string;
};

export type CourierPhotosResponse = {
  supported: boolean;
  isSelfDelivery?: boolean;
  pickupPhotos: string[];
  deliveryPhotos: string[];
  deliveryId?: string;
  tag?: string;
  logisticName?: string;
  message?: string;
  error?: string;
};

/**
 * 全屏大图灯箱预览组件
 */
export function CourierPhotoLightbox({
  photos,
  initialIndex = 0,
  onClose,
}: {
  photos: PhotoItem[];
  initialIndex?: number;
  onClose: () => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        e.stopImmediatePropagation();
        onClose();
        return;
      }
      if (e.key === "ArrowLeft" && photos.length > 1) {
        setCurrentIndex((prev) => (prev > 0 ? prev - 1 : photos.length - 1));
      }
      if (e.key === "ArrowRight" && photos.length > 1) {
        setCurrentIndex((prev) => (prev < photos.length - 1 ? prev + 1 : 0));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, photos.length]);

  if (!mounted || typeof document === "undefined" || photos.length === 0) return null;

  const current = photos[currentIndex] || photos[0];

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="查看照片预览"
      className="fixed inset-0 z-[999999] flex flex-col items-center justify-center bg-black/90 backdrop-blur-md select-none transition-all animate-in fade-in duration-200"
      onClick={onClose}
    >
      {/* 顶部控制栏 */}
      <div
        className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/80 to-transparent text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              current.type === "pickup"
                ? "bg-emerald-500/25 text-emerald-300 border border-emerald-500/40"
                : "bg-blue-500/25 text-blue-300 border border-blue-500/40"
            }`}
          >
            {current.type === "pickup" ? <PackageCheck size={12} /> : <CheckCircle2 size={12} />}
            {current.label}
          </span>
          <span className="text-xs text-white/70">
            {currentIndex + 1} / {photos.length}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <a
            href={current.url}
            target="_blank"
            rel="noopener noreferrer"
            title="在新标签页中打开原图"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/80 hover:bg-white/20 hover:text-white transition-colors"
          >
            <ExternalLink size={15} />
          </a>
          <button
            type="button"
            onClick={onClose}
            title="关闭 (Esc)"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/80 hover:bg-white/20 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* 主视图区域 */}
      <div
        className="relative flex h-full w-full max-h-[88vh] max-w-[90vw] items-center justify-center p-2"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={current.url}
          alt={current.label}
          className="max-h-full max-w-full rounded-lg object-contain shadow-2xl transition-transform duration-200"
        />

        {/* 左右切换按钮 */}
        {photos.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => setCurrentIndex((prev) => (prev > 0 ? prev - 1 : photos.length - 1))}
              className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white/90 hover:bg-black/80 hover:text-white backdrop-blur transition-all"
              title="上一张 (←)"
            >
              <ChevronLeft size={22} />
            </button>
            <button
              type="button"
              onClick={() => setCurrentIndex((prev) => (prev < photos.length - 1 ? prev + 1 : 0))}
              className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white/90 hover:bg-black/80 hover:text-white backdrop-blur transition-all"
              title="下一张 (→)"
            >
              <ChevronRight size={22} />
            </button>
          </>
        )}
      </div>

      {/* 底部缩略图导航栏 */}
      {photos.length > 1 && (
        <div
          className="absolute bottom-3 left-0 right-0 z-20 flex justify-center gap-2 px-4 py-2"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex max-w-full items-center gap-2 overflow-x-auto rounded-xl bg-black/60 p-1.5 backdrop-blur-md">
            {photos.map((p, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setCurrentIndex(idx)}
                className={`relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border-2 transition-all ${
                  idx === currentIndex ? "border-primary scale-105 shadow-md" : "border-white/20 opacity-60 hover:opacity-100"
                }`}
              >
                <img src={p.url} alt={`缩略图 ${idx + 1}`} className="h-full w-full object-cover" />
                <span
                  className={`absolute bottom-0 inset-x-0 text-[9px] font-bold text-center leading-3 text-white ${
                    p.type === "pickup" ? "bg-emerald-600/90" : "bg-blue-600/90"
                  }`}
                >
                  {p.type === "pickup" ? "取" : "送"}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}

/**
 * 嵌入到订单卡片或弹窗的骑手照片面板
 */
export function CourierPhotosViewer({
  orderId,
  isSelfDelivery = false,
  autoLoad = true,
  className = "",
}: {
  orderId: string;
  isSelfDelivery?: boolean;
  autoLoad?: boolean;
  className?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<CourierPhotosResponse | null>(null);
  const [hasFetched, setHasFetched] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  const fetchPhotos = useCallback(async () => {
    if (isSelfDelivery) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/courier-photos`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setData({
          supported: false,
          pickupPhotos: [],
          deliveryPhotos: [],
          message: json.message || json.error || "获取照片失败",
        });
      } else {
        const json = (await res.json()) as CourierPhotosResponse;
        setData(json);
      }
    } catch {
      setData({
        supported: false,
        pickupPhotos: [],
        deliveryPhotos: [],
        message: "网络异常，获取骑手照片失败",
      });
    } finally {
      setLoading(false);
      setHasFetched(true);
    }
  }, [orderId, isSelfDelivery]);

  useEffect(() => {
    if (autoLoad && !hasFetched && !isSelfDelivery) {
      void fetchPhotos();
    }
  }, [autoLoad, hasFetched, isSelfDelivery, fetchPhotos]);

  if (isSelfDelivery) {
    return (
      <div className={`flex items-center gap-1.5 text-xs text-muted-foreground ${className}`}>
        <Camera size={13} className="opacity-50" />
        <span>商家自配订单无骑手拍照</span>
      </div>
    );
  }

  // 拼接照片数组
  const photoItems: PhotoItem[] = [];
  if (data) {
    data.pickupPhotos.forEach((url, i) => {
      photoItems.push({
        url,
        type: "pickup",
        label: `取货凭证 ${data.pickupPhotos.length > 1 ? `#${i + 1}` : ""}`.trim(),
      });
    });
    data.deliveryPhotos.forEach((url, i) => {
      photoItems.push({
        url,
        type: "delivery",
        label: `送达凭证 ${data.deliveryPhotos.length > 1 ? `#${i + 1}` : ""}`.trim(),
      });
    });
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {/* 标题与操作栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground/90">
          <Camera size={13} className="text-primary" />
          <span>骑手拍照存证</span>
          {photoItems.length > 0 && (
            <span className="inline-flex h-4 items-center justify-center rounded-full bg-primary/10 px-1.5 text-[10px] font-bold text-primary">
              {photoItems.length}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => void fetchPhotos()}
          disabled={loading}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
          title="刷新骑手照片"
        >
          <RefreshCw size={11} className={loading ? "animate-spin text-primary" : ""} />
          <span>{loading ? "获取中…" : "刷新"}</span>
        </button>
      </div>

      {/* 内容区域 */}
      {loading && !data ? (
        <div className="flex items-center gap-2 rounded-xl border border-dashed border-black/10 dark:border-white/10 p-3 text-xs text-muted-foreground">
          <RefreshCw size={13} className="animate-spin text-primary" />
          <span>正在拉取骑手取货与送达照片…</span>
        </div>
      ) : photoItems.length > 0 ? (
        <div className="flex flex-wrap gap-2.5 pt-0.5">
          {photoItems.map((item, idx) => (
            <div
              key={idx}
              onClick={() => setPreviewIndex(idx)}
              className="group relative h-16 w-16 sm:h-20 sm:w-20 cursor-pointer overflow-hidden rounded-xl border border-black/10 bg-black/5 shadow-xs transition-all hover:border-primary/50 hover:shadow-md dark:border-white/10 dark:bg-white/5"
              title={`点击放大查看 ${item.label}`}
            >
              <img
                src={item.url}
                alt={item.label}
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                loading="lazy"
              />

              {/* 标签 */}
              <div
                className={`absolute bottom-0 inset-x-0 py-0.5 text-center text-[10px] font-medium text-white shadow-xs backdrop-blur-xs ${
                  item.type === "pickup" ? "bg-emerald-600/85" : "bg-blue-600/85"
                }`}
              >
                {item.type === "pickup" ? "取货照" : "送达照"}
              </div>

              {/* 放大镜悬浮图标 */}
              <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition-opacity group-hover:opacity-100">
                <Maximize2 size={16} className="text-white drop-shadow-md" />
              </div>
            </div>
          ))}
        </div>
      ) : hasFetched ? (
        <div className="flex items-center gap-2 rounded-xl border border-dashed border-black/10 dark:border-white/10 px-3 py-2 text-xs text-muted-foreground">
          <AlertCircle size={13} className="text-muted-foreground/70 shrink-0" />
          <span>{data?.message || "骑手暂未上传取货或送达照片"}</span>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => void fetchPhotos()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-black/8 bg-black/2 px-2.5 py-1 text-xs text-muted-foreground hover:bg-black/5 hover:text-foreground dark:border-white/10 dark:bg-white/3"
        >
          <Camera size={12} />
          <span>点击获取骑手照片</span>
        </button>
      )}

      {/* 灯箱浮层 */}
      {previewIndex !== null && (
        <CourierPhotoLightbox
          photos={photoItems}
          initialIndex={previewIndex}
          onClose={() => setPreviewIndex(null)}
        />
      )}
    </div>
  );
}
