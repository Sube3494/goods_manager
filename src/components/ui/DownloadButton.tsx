"use client";

import { Download, X } from "lucide-react";
import { useMemo, useState } from "react";
import { detectClientPlatform, triggerBrowserDownload, triggerFetchedBlobDownload } from "@/lib/download";

interface DownloadButtonProps {
  url: string;
  filename: string;
}

export function DownloadButton({ url, filename }: DownloadButtonProps) {
  const [showGuide, setShowGuide] = useState(false);

  const platform = useMemo(() => detectClientPlatform(), []);

  const handleClick = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (platform === "ios") {
      e.preventDefault();
      window.open(url, '_blank');
      setShowGuide(true);
      return;
    }

    e.preventDefault();
    try {
      if (platform === "android") {
        await triggerFetchedBlobDownload(url, filename);
        return;
      }

      triggerBrowserDownload(url, filename);
    } catch {
      triggerBrowserDownload(url, filename);
    }
  };

  return (
    <>
      <a
        href={url}
        download={filename}
        onClick={handleClick}
        target="_blank"
        rel="noopener noreferrer"
        className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-black hover:scale-110 active:scale-95 transition-all shadow-lg"
        title="下载原始文件"
      >
        <Download size={20} />
      </a>

      {/* iOS 长按保存引导弹窗 */}
      {showGuide && (
        <div className="fixed inset-0 z-[99999] flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowGuide(false)}>
          <div className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-3xl p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-base text-foreground">保存到相册</h3>
              <button onClick={() => setShowGuide(false)} className="w-7 h-7 flex items-center justify-center rounded-full bg-black/5 dark:bg-white/10 text-muted-foreground">
                <X size={14} />
              </button>
            </div>
            <p className="text-sm text-muted-foreground mb-4">图片/视频已在新页面打开，请按照以下步骤保存：</p>
            <ol className="text-sm space-y-2 list-decimal list-inside text-muted-foreground">
              <li>切换到刚打开的页面</li>
              <li><strong className="text-foreground">长按</strong>图片或视频</li>
              <li>点击「存储图像」或「存储到「照片」」</li>
            </ol>
            <button onClick={() => setShowGuide(false)} className="mt-5 w-full h-11 rounded-2xl bg-black dark:bg-white text-white dark:text-black text-sm font-bold">
              我知道了
            </button>
          </div>
        </div>
      )}
    </>
  );
}
