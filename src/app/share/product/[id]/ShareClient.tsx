"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform } from "framer-motion";
import { ChevronRight, PlayCircle, Download, Info } from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { GestureImage } from "@/components/ui/GestureImage";

const handleDownload = async (url: string, fileName: string) => {
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        const link = document.createElement('a');
        link.href = window.URL.createObjectURL(blob);
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch (error) {
        console.error('Download failed:', error);
    }
};

interface ShareItem {
  id: string;
  url: string;
  type: string;
}

interface ProductShareClientProps {
  items: ShareItem[];
  productName: string;
  sku: string;
  description: string;
}

const LightboxMediaItem = ({ item, onScaleChange }: { item: ShareItem, onScaleChange: (v: number) => void }) => {
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        if (item.type === 'video' && videoRef.current) {
            videoRef.current.currentTime = 0;
            videoRef.current.play().catch(() => {});
        }
    }, [item.type, item.url]);

    return (
        <motion.div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-full h-full flex items-center justify-center pointer-events-auto overflow-hidden">
                <div className="w-full h-full flex items-center justify-center">
                    {item.type === 'video' || /\.(mp4|webm|ogg|mov)$/i.test(item.url) ? (
                        <video 
                            ref={videoRef}
                            src={item.url} 
                            className="max-w-[90%] max-h-[75%] object-contain rounded-lg shadow-2xl mx-auto"
                            controls
                            muted
                            playsInline
                        />
                    ) : (
                        <GestureImage 
                            src={item.url} 
                            onScaleChange={onScaleChange}
                            className="w-full h-full"
                        />
                    )}
                </div>
            </div>
        </motion.div>
    );
};

export function ProductShareClient({ items, productName, sku, description }: ProductShareClientProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showInfo, setShowInfo] = useState(false);
  const selectedImage = items[currentIndex];
  
  const activeScale = useMotionValue(1);
  const uiOpacity = useTransform(activeScale, [1, 1.05], [1, 0]);
  const uiYOffset = useTransform(activeScale, [1, 1.05], [0, -20]);
  const pointerEvents = useTransform(activeScale, (v) => v > 1.05 ? "none" as const : "auto" as const);
  
  const thumbnailContainerRef = useRef<HTMLDivElement>(null);

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
    <div className="min-h-screen h-screen w-full bg-black text-white flex flex-col relative overflow-hidden font-sans select-none touch-none">
      
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
        className="absolute top-0 left-0 right-0 p-4 md:p-6 flex items-start justify-between z-55 pointer-events-none"
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
                        opacity: showInfo ? 1 : 0.9
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
                        className="absolute top-16 md:top-[68px] left-4 right-4 md:left-6 md:right-auto z-50 bg-black/90 backdrop-blur-2xl px-5 py-4 rounded-2xl border border-white/20 shadow-2xl flex flex-col gap-3 max-w-full md:max-w-md pointer-events-auto"
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
                        
                        {(sku || description) && (
                            <div className="space-y-4 mt-2">
                                {sku && (
                                    <div>
                                        <h3 className="text-[10px] text-white/50 uppercase tracking-widest mb-1 font-bold">货号 (SKU)</h3>
                                        <p className="text-lg font-mono text-blue-400">{sku}</p>
                                    </div>
                                )}
                                {description && (
                                    <div>
                                        <h3 className="text-[10px] text-white/50 uppercase tracking-widest mb-1 font-bold">备注内容</h3>
                                        <p className="text-sm text-white/70 leading-relaxed whitespace-pre-wrap">{description}</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </motion.div>
                </>
            )}
        </AnimatePresence>

        <div className="flex items-center gap-2 pointer-events-auto">
            <button 
                onClick={() => {
                    const timestamp = new Date().getTime();
                    const isVideo = selectedImage.type === 'video' || /\.(mp4|webm|ogg|mov)$/i.test(selectedImage.url);
                    const ext = isVideo ? 'mp4' : 'jpg';
                    const fileName = `${sku || 'MEDIA'}_${timestamp}.${ext}`;
                    handleDownload(selectedImage.url, fileName);
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

            <motion.div className="w-full h-full">
                <LightboxMediaItem 
                    key={selectedImage.id}
                    item={selectedImage}
                    onScaleChange={(v) => activeScale.set(v)}
                />
            </motion.div>
      </div>

      {/* Bottom Thumbnails & Mobile Controls */}
      <motion.div 
        style={{ opacity: uiOpacity }}
        className="absolute bottom-6 left-0 right-0 flex justify-center z-50 px-4 pointer-events-none"
      >
        <div className="bg-black/40 backdrop-blur-xl px-2 py-3 rounded-2xl border border-white/10 shadow-2xl flex items-center gap-2 pointer-events-auto max-w-full overflow-hidden">
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
                                <Image src={img.url} alt="" fill sizes="50px" className="object-cover" />
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
    </div>
  );
}
