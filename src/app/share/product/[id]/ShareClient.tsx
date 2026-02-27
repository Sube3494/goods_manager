"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform } from "framer-motion";
import { ChevronRight, PlayCircle, Download, Info, X } from "lucide-react";
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

const ProductDetailsModal = ({ isOpen, onClose, name, sku, description }: { 
    isOpen: boolean; 
    onClose: () => void; 
    name: string; 
    sku: string; 
    description: string;
}) => {
    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="fixed inset-0 z-100 flex items-center justify-center p-6 bg-black/60 backdrop-blur-md"
                >
                    <motion.div 
                        initial={{ scale: 0.9, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.9, opacity: 0, y: 20 }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full max-w-md bg-zinc-900/90 border border-white/10 rounded-3xl p-8 shadow-2xl relative overflow-hidden"
                    >
                        <div className="absolute top-0 left-0 w-full h-1 bg-linear-to-r from-blue-500 via-purple-500 to-pink-500" />
                        
                        <button 
                            onClick={onClose}
                            className="absolute top-4 right-4 p-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors"
                        >
                            <X size={20} />
                        </button>

                        <div className="space-y-6">
                            <div>
                                <h3 className="text-xs font-bold text-white/30 uppercase tracking-widest mb-1">商品名称</h3>
                                <p className="text-xl font-bold text-white leading-tight">{name}</p>
                            </div>

                            {sku && (
                                <div>
                                    <h3 className="text-xs font-bold text-white/30 uppercase tracking-widest mb-1">SKU 编号</h3>
                                    <p className="text-lg font-mono text-blue-400">{sku}</p>
                                </div>
                            )}

                            {description && (
                                <div>
                                    <h3 className="text-xs font-bold text-white/30 uppercase tracking-widest mb-1">商品备注</h3>
                                    <p className="text-base text-white/70 leading-relaxed whitespace-pre-wrap">{description}</p>
                                </div>
                            )}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
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
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const selectedImage = items[currentIndex];
  
  const activeScale = useMotionValue(1);
  const uiOpacity = useTransform(activeScale, [1, 1.05], [1, 0]);
  const thumbnailContainerRef = useRef<HTMLDivElement>(null);

  const navigate = (dir: number) => {
    const nextIndex = currentIndex + dir;
    if (nextIndex < 0 || nextIndex >= items.length) return;
    setCurrentIndex(nextIndex);
  };

  const swipeConfidenceThreshold = 10000;
  const swipePower = (offset: number, velocity: number) => {
    return Math.abs(offset) * velocity;
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

      {/* Top Controls */}
      <motion.div 
        style={{ opacity: uiOpacity }}
        className="absolute top-6 right-6 z-50 pointer-events-auto flex items-center gap-3"
      >
        <button 
            onClick={() => setIsDetailsOpen(true)}
            className="flex h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-2xl bg-black/40 text-white hover:bg-white hover:text-black transition-all border border-white/10 backdrop-blur-xl group shadow-2xl"
            title="查看详情"
        >
            <Info size={20} className="group-hover:scale-110 transition-transform" />
        </button>
        <button 
            onClick={() => {
                const timestamp = new Date().getTime();
                const isVideo = selectedImage.type === 'video' || /\.(mp4|webm|ogg|mov)$/i.test(selectedImage.url);
                const ext = isVideo ? 'mp4' : 'jpg';
                const fileName = `${productName}_${timestamp}.${ext}`;
                handleDownload(selectedImage.url, fileName);
            }}
            className="flex h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-2xl bg-black/40 text-white hover:bg-white hover:text-black transition-all border border-white/10 backdrop-blur-xl group shadow-2xl"
            title="下载此文件"
        >
            <Download size={20} className="group-hover:translate-y-0.5 transition-transform" />
        </button>
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

            <motion.div 
                className="w-full h-full"
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                onDragEnd={(e, { offset, velocity }) => {
                    const swipe = swipePower(offset.x, velocity.x);
                    if (swipe < -swipeConfidenceThreshold) {
                        navigate(1);
                    } else if (swipe > swipeConfidenceThreshold) {
                        navigate(-1);
                    }
                }}
            >
                <LightboxMediaItem 
                    key={selectedImage.id}
                    item={selectedImage}
                    onScaleChange={(v) => activeScale.set(v)}
                />
            </motion.div>
      </div>

      {/* Pagination Indicator for Mobile */}
      <motion.div 
        style={{ opacity: uiOpacity }}
        className="absolute bottom-28 md:hidden left-0 right-0 flex justify-center z-50"
      >
        <div className="bg-black/60 backdrop-blur-lg px-4 py-1.5 rounded-full border border-white/10 text-sm font-medium tracking-tight">
            <span className="text-white">{currentIndex + 1}</span>
            <span className="text-white/40 mx-1.5">/</span>
            <span className="text-white/40">{items.length}</span>
        </div>
      </motion.div>

      {/* Bottom Thumbnails */}
      <motion.div 
        style={{ opacity: uiOpacity }}
        className="absolute bottom-6 left-0 right-0 flex justify-center z-50 px-4 pointer-events-none"
      >
        <div className="bg-black/40 backdrop-blur-xl px-2 py-3 rounded-2xl border border-white/10 shadow-2xl flex items-center gap-2 pointer-events-auto max-w-full">
            <div 
                ref={thumbnailContainerRef}
                className="flex gap-2.5 overflow-x-auto scrollbar-hide items-end justify-start max-w-[85vw] md:max-w-2xl py-1 px-1 scroll-smooth"
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
        </div>
      </motion.div>

      <ProductDetailsModal 
        isOpen={isDetailsOpen}
        onClose={() => setIsDetailsOpen(false)}
        name={productName}
        sku={sku}
        description={description}
      />
    </div>
  );
}
