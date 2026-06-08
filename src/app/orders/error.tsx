"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("OrdersPage Error captured by Next.js:", error);
  }, [error]);

  return (
    <div className="p-6 max-w-xl mx-auto my-12 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 rounded-3xl shadow-xl">
      <div className="flex items-start gap-4">
        <span className="text-3xl">🚨</span>
        <div className="flex-1">
          <h2 className="text-lg font-black text-rose-800 dark:text-rose-200">
            订单管理页面运行出错
          </h2>
          <p className="mt-2 text-xs font-mono text-rose-700 dark:text-rose-300 bg-white/50 dark:bg-black/20 p-4 rounded-xl break-all leading-relaxed whitespace-pre-wrap">
            {error.stack || error.message || "未知错误"}
          </p>
          <div className="mt-4 flex gap-3">
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-rose-800 text-white rounded-xl text-xs font-bold hover:bg-rose-900 transition-colors"
            >
              刷新页面
            </button>
            <button
              onClick={() => reset()}
              className="px-4 py-2 border border-rose-300 text-rose-800 rounded-xl text-xs font-bold hover:bg-rose-100 transition-colors dark:text-rose-200"
            >
              重试加载
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
