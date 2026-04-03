"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform } from "framer-motion";
import { ChevronRight, PlayCircle, Download, Info, Volume2, VolumeX, Maximize } from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { GestureImage } from "@/components/ui/GestureImage";
import { useUser } from "@/hooks/useUser";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { useToast } from "@/components/ui/Toast";
import { copyToClipboard } from "@/lib/utils";
import { useMemo } from "react";
import { triggerBrowserDownload } from "@/lib/download";

// Moved handleDownload inside component to use hooks

interface ShareItem {
  id: string;
  url: string;
  thumbnailUrl?: string | null;
  type: string;
}

interface ProductShareClientProps {
  items: ShareItem[];
  productName: string;
  sku: string;
  description: string;
}

const LightboxMediaItem = ({ item, onScaleChange, isVisible = true }: { item: ShareItem, onScaleChange: (v: number) => void, isVisible?: boolean }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [isPlaying, setIsPlaying] = useState(true);
    const [progress, setProgress] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [isMuted, setIsMuted] = useState(true);

    useEffect(() => {
        if (item.type === 'video' && videoRef.current) {
            videoRef.current.currentTime = 0;
            videoRef.current.play().then(() => {
                setIsPlaying(true);
            }).catch(() => {
                setIsPlaying(false);
            });
        }
    }, [item.type, item.url]);

    const togglePlay = (e?: React.MouseEvent) => {
        e?.stopPropagation();
        if (videoRef.current) {
            if (videoRef.current.paused) {
                videoRef.current.play();
                setIsPlaying(true);
            } else {
                videoRef.current.pause();
                setIsPlaying(false);
            }
        }
    };

    const isVideo = item.type === 'video' || /\.(mp4|webm|ogg|mov)$/i.test(item.url);

    return (
        <motion.div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-full h-full flex flex-col items-center justify-center p-4 pb-[calc(7.5rem+env(safe-area-inset-bottom,0px))] md:p-8 md:pb-40 pointer-events-auto overflow-hidden">
                {isVideo ? (
                    <div className="flex flex-col items-center justify-center w-full h-full max-w-6xl mx-auto gap-2 relative">
                        {/* Video Container - Compact sizing */}
                        <div className="relative flex items-center justify-center w-full min-h-0 bg-transparent rounded-xl overflow-hidden shadow-2xl shrink-0">
                                <video 
                                    ref={videoRef}
                                    src={item.url} 
                                    className="max-w-full max-h-[calc(100dvh-220px-env(safe-area-inset-bottom,0px))] w-auto h-auto object-contain cursor-pointer"
                                disablePictureInPicture
                                disableRemotePlayback
                                autoPlay
                                muted={isMuted}
                                controlsList="nodownload noplaybackrate"
                                loop
                                onContextMenu={(e) => e.preventDefault()}
                                onClick={togglePlay}
                                onTimeUpdate={() => {
                                    if (videoRef.current) {
                                        const current = videoRef.current.currentTime;
                                        const p = (current / videoRef.current.duration) * 100;
                                        setProgress(isNaN(p) ? 0 : p);
                                        setCurrentTime(current);
                                    }
                                }}
                                onEnded={() => setIsPlaying(false)}
                                playsInline
                            />
                            
                            {/* Central Play Toggle Overlay */}
                            <AnimatePresence>
                                {!isPlaying && (
                                    <motion.div 
                                        initial={{ opacity: 0, scale: 0.8 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.8 }}
                                        className="absolute inset-0 flex items-center justify-center pointer-events-none z-10"
                                    >
                                        <div 
                                            className="flex items-center justify-center text-white cursor-pointer pointer-events-auto hover:scale-110 transition-transform active:scale-95 drop-shadow-[0_0_20px_rgba(0,0,0,0.6)]"
                                            onClick={togglePlay}
                                        >
                                            <PlayCircle size={80} fill="currentColor" strokeWidth={0} className="opacity-80" />
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* Unified Custom Controls - Always strictly below and near video */}
                        <div className={cn(
                            "w-full max-w-[600px] transition-all duration-500 pointer-events-auto z-1001 shrink-0",
                            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
                        )}>
                            <div className="bg-zinc-900/95 backdrop-blur-2xl px-4 md:px-5 py-3 rounded-2xl flex items-center gap-3 md:gap-4 pointer-events-auto border border-white/20 ring-1 ring-white/10 shadow-2xl mx-auto">
                                <div 
                                    className="flex-1 h-3 flex items-center cursor-pointer pointer-events-auto group/progress"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (videoRef.current && videoRef.current.duration) {
                                            const rect = e.currentTarget.getBoundingClientRect();
                                            const x = e.clientX - rect.left;
                                            const pct = Math.max(0, Math.min(1, x / rect.width));
                                            setProgress(pct * 100);
                                            videoRef.current.currentTime = pct * videoRef.current.duration;
                                        }
                                    }}
                                >
                                    <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden relative">
                                        <motion.div 
                                            className="absolute inset-y-0 left-0 bg-white shadow-[0_0_12px_rgba(255,255,255,0.6)]"
                                            style={{ width: `${progress}%` }}
                                            transition={{ duration: 0 }}
                                        />
                                    </div>
                                </div>

                                <div className="text-[11px] font-mono text-white/90 min-w-[45px] text-right font-bold tracking-tight">
                                    {`${Math.floor(currentTime / 60)}:${String(Math.floor(currentTime % 60)).padStart(2, '0')}`}
                                </div>
                                <div className="flex items-center gap-3 border-l border-white/10 pl-3">
                                    <button 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setIsMuted(!isMuted);
                                        }}
                                        className="text-white/70 hover:text-white transition-colors"
                                        title={isMuted ? "取消静音" : "静音"}
                                    >
                                        {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                                    </button>
                                    <button 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (videoRef.current) {
                                                if (document.fullscreenElement) {
                                                    document.exitFullscreen();
                                                } else {
                                                    videoRef.current.requestFullscreen();
                                                }
                                            }
                                        }}
                                        className="text-white/70 hover:text-white transition-colors"
                                        title="全屏"
                                    >
                                        <Maximize size={16} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center justify-center w-full h-full">
                        <GestureImage 
                            src={item.url} 
                            onScaleChange={onScaleChange}
                            className="max-w-full max-h-[calc(100dvh-220px-env(safe-area-inset-bottom,0px))] object-contain"
                        />
                    </div>
                )}
            </div>
        </motion.div>
    );
};

export function ProductShareClient({ items, productName, sku, description }: ProductShareClientProps) {
  const { showToast } = useToast();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showInfo, setShowInfo] = useState(false);
  const selectedImage = items[currentIndex];
  
  const activeScale = useMotionValue(1);
  const uiOpacity = useTransform(activeScale, [1, 1.05], [1, 0]);
  const uiYOffset = useTransform(activeScale, [1, 1.05], [0, -20]);
  const pointerEvents = useTransform(activeScale, (v) => v > 1.05 ? "none" as const : "auto" as const);
  
  const thumbnailContainerRef = useRef<HTMLDivElement>(null);
  const { user } = useUser();
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  // iOS 兼容性支持
  const isIOS = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window);
  }, []);

  const [copyModalConfig, setCopyModalConfig] = useState<{
    isOpen: boolean;
    url: string;
    title: string;
    mode: 'copy' | 'download';
  }>({
    isOpen: false,
    url: "",
    title: "",
    mode: 'copy'
  });

  const handleDownload = async (url: string, fileName: string) => {
    // iOS Safari does not support the `download` attribute on anchor tags,
    // nor Blob URLs for saving to the photo library.
    // The only reliable path is to open the resource directly and guide the user.
    if (isIOS) {
      window.open(url, '_blank');
      setCopyModalConfig({
        isOpen: true,
        url: url,
        title: "保存到相册",
        mode: 'download',
      });
      return;
    }

    try {
      triggerBrowserDownload(url, fileName);
    } catch (error) {
      console.warn("Download failed, falling back:", error);
      window.open(url, "_blank", "noopener,noreferrer");
      showToast("正在尝试直接打开资源进行下载", "info");
    }
  };

  const checkAction = useCallback((action: () => void) => {
    if (!user) {
      setConfirmConfig({
        isOpen: true,
        title: "登录后下载",
        message: "您当前为游客身份，登录后即可下载高清媒体素材。",
        onConfirm: () => {
          window.location.href = `/login?callbackUrl=${encodeURIComponent(window.location.pathname)}`;
        },
      });
      return;
    }
    action();
  }, [user]);

  const navigate = (dir: number) => {
    const nextIndex = currentIndex + dir;
    if (nextIndex < 0 || nextIndex >= items.length) return;
    setCurrentIndex(nextIndex);
  };

  // Auto-scroll thumbnails
  useEffect(() => {
    if (thumbnailContainerRef.current) {
        const container = thumbnailContainerRef.current;
        const selectedThumb = container.querySelector('[data-selected="true"]') as HTMLElement;
        if (selectedThumb) {
            const containerWidth = container.offsetWidth;
            const thumbOffset = selectedThumb.offsetLeft;
            const thumbWidth = selectedThumb.offsetWidth;
            container.scrollTo({
                left: thumbOffset - (containerWidth / 2) + (thumbWidth / 2),
                behavior: "smooth"
            });
        }
    }
  }, [currentIndex]);

  return (
    <div className="flex-1 h-dynamic-screen min-h-dynamic-screen w-full bg-black text-white flex flex-col relative overflow-hidden font-sans select-none touch-none">
      
      {/* Background Glow */}
      <AnimatePresence mode="wait">
        <motion.div 
            key={selectedImage.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="absolute inset-0 z-0 pointer-events-none overflow-hidden"
        >
            {selectedImage.type !== "video" && (
            <Image 
                src={selectedImage.url} 
                alt="ambient" 
                fill
                className="object-cover blur-[100px] opacity-30 scale-110"
            />
            )}
            <div className="absolute inset-0 bg-black/80" />
        </motion.div>
      </AnimatePresence>

      {/* Top Bar Overlay - Matching Gallery Lightbox */}
      <motion.div 
        style={{ 
            opacity: uiOpacity, 
            y: uiYOffset,
            pointerEvents: pointerEvents
        }}
        className="absolute top-0 left-0 right-0 p-4 md:p-6 pt-[env(safe-area-inset-top,0px)] flex items-start justify-between z-50 pointer-events-none"
      >
        <div className="flex items-center gap-2 pointer-events-auto">
            <button
                onClick={() => setShowInfo(!showInfo)}
                className={cn(
                    "h-10 w-10 flex items-center justify-center rounded-xl transition-all border backdrop-blur-2xl shadow-xl group",
                    showInfo 
                        ? "bg-white text-black border-white" 
                        : "bg-black/60 text-white border-white/10 hover:bg-white hover:text-black"
                )}
                title="显示详情"
            >
                <motion.div
                    animate={{ 
                        scale: showInfo ? 1.15 : 1,
                        opacity: showInfo ? 1 : 0.9,
                        rotate: showInfo ? 90 : 0
                    }}
                    transition={{ type: "spring", stiffness: 500, damping: 25 }}
                >
                    <Info size={20} />
                </motion.div>
            </button>
        </div>

        <AnimatePresence>
            {showInfo && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-40 bg-transparent pointer-events-auto"
                        onClick={() => setShowInfo(false)}
                    />
                    <motion.div
                        initial={{ opacity: 0, y: -10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -10, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                        className="absolute top-[calc(env(safe-area-inset-top,0px)+3.5rem)] md:top-[68px] left-4 right-4 md:left-6 md:right-auto z-50 bg-black/90 backdrop-blur-2xl px-5 py-4 rounded-2xl border border-white/20 shadow-2xl flex flex-col gap-3 max-w-full md:max-w-md pointer-events-auto"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] text-white/70 uppercase tracking-[0.2em] font-black shrink-0">商品信息</span>
                            </div>
                            <h3 className="text-white font-bold text-sm md:text-xl leading-snug tracking-tight">
                                {productName}
                            </h3>
                        </div>
                        
                        {description && (
                            <div className="space-y-4 mt-2">
                                <div>
                                    <h3 className="text-[10px] text-white/50 uppercase tracking-widest mb-1 font-bold">备注内容</h3>
                                    <p className="text-sm text-white/70 leading-relaxed whitespace-pre-wrap">{description}</p>
                                </div>
                            </div>
                        )}
                    </motion.div>
                </>
            )}
        </AnimatePresence>

        <div className="flex items-center gap-2 pointer-events-auto">
            <a 
                href="/gallery" 
                className="h-10 px-4 flex items-center gap-1.5 rounded-xl bg-black/60 text-white hover:bg-white hover:text-black transition-all border border-white/10 backdrop-blur-2xl shadow-xl text-[11px] font-bold group"
            >
                <ChevronRight size={16} className="rotate-180 group-hover:-translate-x-0.5 transition-transform" />
                返回实物相册
            </a>
            <button 
                onClick={() => {
                    checkAction(() => {
                        const timestamp = new Date().getTime();
                        const isVideo = selectedImage.type === 'video' || /\.(mp4|webm|ogg|mov)$/i.test(selectedImage.url);
                        const ext = isVideo ? 'mp4' : 'jpg';
                        const fileName = `${sku || 'MEDIA'}_${timestamp}.${ext}`;
                        handleDownload(selectedImage.url, fileName);
                    });
                }}
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-black/60 text-white hover:bg-white hover:text-black transition-all border border-white/10 backdrop-blur-2xl group shadow-xl"
                title="下载"
            >
                <Download size={18} className="group-hover:translate-y-0.5 transition-transform" />
            </button>
        </div>
      </motion.div>

      {/* Main Lightbox Area */}
      <div className="relative z-10 flex-1 w-full h-full flex items-center justify-center">
            {items.length > 1 && (
                <>
                    <button 
                        onClick={() => navigate(-1)}
                        disabled={currentIndex === 0}
                        className="hidden md:flex absolute left-8 z-50 rounded-full p-4 bg-white/5 text-white hover:bg-white hover:text-black transition-all border border-white/10 backdrop-blur-md disabled:opacity-0 shadow-xl active:scale-95"
                    >
                        <ChevronRight size={32} className="rotate-180" />
                    </button>
                    <button 
                        onClick={() => navigate(1)}
                        disabled={currentIndex === items.length - 1}
                        className="hidden md:flex absolute right-8 z-50 rounded-full p-4 bg-white/5 text-white hover:bg-white hover:text-black transition-all border border-white/10 backdrop-blur-md disabled:opacity-0 shadow-xl active:scale-95"
                    >
                        <ChevronRight size={32} />
                    </button>
                </>
            )}

            <motion.div className="w-full h-full relative flex items-center justify-center">
                <LightboxMediaItem 
                    key={selectedImage.id}
                    item={selectedImage}
                    onScaleChange={(v) => activeScale.set(v)}
                    isVisible={true} // In share page we currently don't have UI hide logic like gallery
                />
            </motion.div>
      </div>

      {/* Bottom Thumbnails & Mobile Controls */}
      <motion.div 
        style={{ opacity: uiOpacity }}
        className="absolute bottom-[calc(1.5rem+env(safe-area-inset-bottom,0px))] left-0 right-0 flex justify-center z-50 px-4 pointer-events-none"
      >
        <div className="bg-black/40 backdrop-blur-xl px-2 py-3 rounded-2xl border border-white/10 shadow-2xl flex items-center gap-2 pointer-events-auto max-w-full overflow-hidden mb-[env(safe-area-inset-bottom,0px)]">
            {items.length > 1 && (
                <button
                    onClick={() => navigate(-1)}
                    disabled={currentIndex === 0}
                    className="md:hidden flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/5 text-white disabled:opacity-20 transition-all border border-white/10 active:scale-95"
                >
                    <ChevronRight size={20} className="rotate-180" />
                </button>
            )}

            <div 
                ref={thumbnailContainerRef}
                className="flex gap-2.5 overflow-x-auto scrollbar-hide items-end justify-start max-w-[calc(85vw-88px)] md:max-w-2xl py-1 px-1 scroll-smooth"
            >
                {items.map((img, idx) => {
                    const isSelected = idx === currentIndex;
                    return (
                        <div 
                            key={img.id} 
                            data-selected={isSelected}
                            onClick={() => setCurrentIndex(idx)}
                            className={cn(
                                "relative h-12 w-12 rounded-lg overflow-hidden cursor-pointer transition-all duration-200 border shrink-0 group",
                                isSelected 
                                ? "border-white scale-110 z-10 ring-2 ring-white/40 shadow-lg shadow-white/20" 
                                : "border-white/5 brightness-50 opacity-40 hover:opacity-100 hover:brightness-100"
                            )}
                        >
                            {img.type === 'video' || /\.(mp4|webm|ogg|mov)$/i.test(img.url) ? (
                                <div className="w-full h-full bg-black flex items-center justify-center relative">
                                    <video 
                                        src={`${img.url}#t=0.1`} 
                                        className="w-full h-full object-cover opacity-60" 
                                        muted 
                                        playsInline 
                                        preload="metadata"
                                    />
                                    <PlayCircle size={20} className="text-white/90 absolute" />
                                </div>
                            ) : (
                                <Image src={img.thumbnailUrl || img.url} alt="" fill sizes="50px" className="object-cover" />
                            )}
                        </div>
                    );
                })}
            </div>

            {items.length > 1 && (
                <button
                    onClick={() => navigate(1)}
                    disabled={currentIndex === items.length - 1}
                    className="md:hidden flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/5 text-white disabled:opacity-20 transition-all border border-white/10 active:scale-95"
                >
                    <ChevronRight size={20} />
                </button>
            )}
        </div>
      </motion.div>

      {/* Modal removed in favor of popover */}
      <ConfirmModal
        isOpen={confirmConfig.isOpen}
        title={confirmConfig.title}
        message={confirmConfig.message}
        onConfirm={confirmConfig.onConfirm}
        onClose={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
        confirmLabel="立即登录"
        variant="primary"
        className="z-31000"
      />

      <ConfirmModal
        isOpen={copyModalConfig.isOpen}
        title={copyModalConfig.title}
        message={
            copyModalConfig.mode === 'download' ? (
              <div className="space-y-3">
                <p className="text-sm">图片/视频已在新页面打开，请按照以下步骤保存：</p>
                <ol className="text-sm space-y-1.5 list-decimal list-inside text-muted-foreground">
                  <li>切换到刚打开的页面</li>
                  <li><strong className="text-foreground">长按</strong>图片或视频</li>
                  <li>点击「存储图像」或「存储到「照片」」</li>
                </ol>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm">由于您的系统限制，请点击下方按钮复制，或手动长按选择以下链接：</p>
                <div className="p-3 bg-black/5 dark:bg-white/5 rounded-xl break-all text-xs font-mono select-all">
                    {copyModalConfig.url}
                </div>
              </div>
            )
        }
        variant="info"
        confirmLabel={copyModalConfig.mode === 'download' ? '我知道了' : '点击复制'}
        onConfirm={async () => {
            if (copyModalConfig.mode === 'download') {
              setCopyModalConfig(prev => ({ ...prev, isOpen: false }));
              return;
            }
            const success = await copyToClipboard(copyModalConfig.url);
            if (success) {
                showToast("复制成功", "success");
                setCopyModalConfig(prev => ({ ...prev, isOpen: false }));
            } else {
                showToast("复制失败，请尝试手动长按选择文字", "error");
            }
        }}
        onClose={() => setCopyModalConfig(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
