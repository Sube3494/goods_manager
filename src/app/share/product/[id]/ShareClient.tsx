"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform } from "framer-motion";
import { ChevronRight, PlayCircle, Download } from "lucide-react";
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

export function ProductShareClient({ items }: ProductShareClientProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const selectedImage = items[currentIndex];
  
  const activeScale = useMotionValue(1);
  const uiOpacity = useTransform(activeScale, [1, 1.05], [1, 0]);
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
    <div className="min-h-screen h-screen w-full bg-black text-white flex flex-col relative overflow-hidden font-sans select-none">
      
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
        className="absolute top-6 right-6 z-50 flex items-center gap-3 pointer-events-auto"
      >
        <button 
            onClick={() => {
                const timestamp = new Date().getTime();
                const isVideo = selectedImage.type === 'video' || /\.(mp4|webm|ogg|mov)$/i.test(selectedImage.url);
                const ext = isVideo ? 'mp4' : 'jpg';
                const fileName = `PHOTO_${timestamp}.${ext}`;
                handleDownload(selectedImage.url, fileName);
            }}
            className="flex h-12 w-12 items-center justify-center rounded-2xl bg-black/40 text-white hover:bg-white hover:text-black transition-all border border-white/10 backdrop-blur-xl group shadow-2xl"
            title="下载此文件"
        >
            <Download size={22} className="group-hover:translate-y-0.5 transition-transform" />
        </button>
      </motion.div>

      {/* Main Lightbox Area */}
      <div className="relative z-10 flex-1 w-full h-full flex items-center justify-center">
            {items.length > 1 && (
                <>
                    <button 
                        onClick={() => navigate(-1)}
                        disabled={currentIndex === 0}
                        className="absolute left-4 md:left-8 z-50 rounded-full p-4 bg-white/5 text-white hover:bg-white/10 transition-all border border-white/10 backdrop-blur-md disabled:opacity-0"
                    >
                        <ChevronRight size={32} className="rotate-180" />
                    </button>
                    <button 
                        onClick={() => navigate(1)}
                        disabled={currentIndex === items.length - 1}
                        className="absolute right-4 md:right-8 z-50 rounded-full p-4 bg-white/5 text-white hover:bg-white/10 transition-all border border-white/10 backdrop-blur-md disabled:opacity-0"
                    >
                        <ChevronRight size={32} />
                    </button>
                </>
            )}

            <LightboxMediaItem 
                key={selectedImage.id}
                item={selectedImage}
                onScaleChange={(v) => activeScale.set(v)}
            />
      </div>

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
                                <div className="w-full h-full bg-black flex items-center justify-center">
                                    <PlayCircle size={20} className="text-white/90" />
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
    </div>
  );
}
