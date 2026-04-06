/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useRef, useState } from "react";

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

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    onDestroyRef.current = onDestroy;
  }, [onDestroy]);

  useEffect(() => {
    let disposed = false;

    async function boot() {
      const key = process.env.NEXT_PUBLIC_AMAP_KEY;
      const securityCode = process.env.NEXT_PUBLIC_AMAP_SECURITY_CODE;

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
  }, [center, showDefaultMarker, zoom]);

  return (
    <div className="space-y-4">
      {showDebug && (
        <div className="rounded-2xl border border-border bg-card p-4 text-sm">
          <div>Status: {status}</div>
          <div>Host: {typeof window !== "undefined" ? window.location.host : "--"}</div>
          <div>Key: {process.env.NEXT_PUBLIC_AMAP_KEY ? "已读取" : "未读取"}</div>
          <div>Security: {process.env.NEXT_PUBLIC_AMAP_SECURITY_CODE ? "已读取" : "未读取"}</div>
          {error && <div className="text-red-500">Error: {error}</div>}
        </div>
      )}
      <div
        ref={containerRef}
        className={className || "h-[70vh] overflow-hidden rounded-3xl border border-border bg-white"}
      />
    </div>
  );
}
