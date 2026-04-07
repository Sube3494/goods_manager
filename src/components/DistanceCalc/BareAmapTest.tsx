/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

declare global {
  interface Window {
    AMap?: any;
    _AMapSecurityConfig?: { securityJsCode: string };
    __picknoteBareAmapPromise?: Promise<any>;
  }
}

export function loadBareAmap(key: string, securityCode: string) {
  if (window.AMap) return Promise.resolve(window.AMap);
  if (window.__picknoteBareAmapPromise) return window.__picknoteBareAmapPromise;

  window._AMapSecurityConfig = { securityJsCode: securityCode || "" };

  window.__picknoteBareAmapPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-bare-amap="1"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(window.AMap));
      existing.addEventListener("error", () => reject(new Error("AMap script load failed")));
      return;
    }

    const script = document.createElement("script");
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key)}`;
    script.async = true;
    script.defer = true;
    script.dataset.bareAmap = "1";
    script.onload = () => resolve(window.AMap);
    script.onerror = () => reject(new Error("AMap script load failed"));
    document.head.appendChild(script);
  });

  return window.__picknoteBareAmapPromise;
}

export function BareAmapTest({
  className,
  showDebug = true,
  center = [106.5516, 29.563],
  zoom = 11,
  showDefaultMarker = true,
  onReady,
  onDestroy,
}: {
  className?: string;
  showDebug?: boolean;
  center?: [number, number];
  zoom?: number;
  showDefaultMarker?: boolean;
  onReady?: (payload: { map: any; AMap: any }) => void;
  onDestroy?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const onReadyRef = useRef(onReady);
  const onDestroyRef = useRef(onDestroy);
  const [status, setStatus] = useState("初始化中...");
  const [error, setError] = useState("");

  const key = process.env.NEXT_PUBLIC_AMAP_KEY;
  const securityCode = process.env.NEXT_PUBLIC_AMAP_SECURITY_CODE;

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    onDestroyRef.current = onDestroy;
  }, [onDestroy]);

  useEffect(() => {
    let disposed = false;

    async function boot() {

      if (!key) {
        setError("未读取到 NEXT_PUBLIC_AMAP_KEY");
        setStatus("失败");
        return;
      }

      try {
        setStatus("加载高德脚本...");
        const AMap = await loadBareAmap(key, securityCode || "");
        if (disposed || !containerRef.current) return;

        setStatus("创建地图实例...");
        const map = new AMap.Map(containerRef.current, {
          viewMode: "2D",
          zoom,
          center,
          mapStyle: "amap://styles/normal",
        });

        mapRef.current = map;

        if (showDefaultMarker) {
          const marker = new AMap.Marker({
            position: center,
          });
          map.add(marker);
        }

        setTimeout(() => {
          if (disposed) return;
          onReadyRef.current?.({ map, AMap });
          setStatus("地图实例已创建");
        }, 800);
      } catch (err: any) {
        console.error(err);
        if (disposed) return;
        setError(err?.message || String(err));
        setStatus("失败");
      }
    }

    void boot();

    return () => {
      disposed = true;
      onDestroyRef.current?.();
      if (mapRef.current) {
        mapRef.current.destroy();
        mapRef.current = null;
      }
    };
  }, [center, key, securityCode, showDefaultMarker, zoom]);

  return (
    <div className="space-y-4">
      {(showDebug || (!key && error)) && (
        <div className="rounded-2xl border border-border bg-card/50 p-4 text-sm backdrop-blur-md">
          {(!key && error) ? (
            <div className="flex flex-col gap-2">
              <div className="font-bold text-red-500">地图加载失败：缺少配置 (Environment Variable Missing)</div>
              <div className="text-muted-foreground leading-relaxed whitespace-pre-wrap">
                检测到 `NEXT_PUBLIC_AMAP_KEY` 为空。
                请检查 Docker 构建参数或是环境变量配置。
                线上版本需要通过 `--build-arg` 在镜像构建时注入。
              </div>
            </div>
          ) : (
            <>
              <div>Status: {status}</div>
              <div>Host: {typeof window !== "undefined" ? window.location.host : "--"}</div>
              <div>Key: {key ? "已读取" : "未读取"}</div>
              <div>Security: {process.env.NEXT_PUBLIC_AMAP_SECURITY_CODE ? "已读取" : "未读取"}</div>
              {error && <div className="text-red-500 font-bold mt-1">Error: {error}</div>}
            </>
          )}
        </div>
      )}
      <div
        ref={containerRef}
        className={cn(
          "h-[70vh] overflow-hidden rounded-3xl border border-border bg-white transition-opacity",
          className,
          (!key && error) ? "opacity-30 grayscale pointer-events-none" : "opacity-100"
        )}
      />
    </div>
  );
}
