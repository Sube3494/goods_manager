"use client";

import { Download } from "lucide-react";
import { useToast } from "./Toast";
import { useMemo } from "react";

interface DownloadButtonProps {
  url: string;
  filename: string;
}

export function DownloadButton({ url, filename }: DownloadButtonProps) {
  const { showToast } = useToast();
  
  const isIOS = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window);
  }, []);

  const handleClick = () => {
    if (isIOS) {
      setTimeout(() => {
        showToast("由于系统限制，请在打开的页面长按图片保存", "warning");
      }, 500);
    }
  };

  return (
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
  );
}
