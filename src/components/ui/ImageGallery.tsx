"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight, Play, Volume2, VolumeX, Maximize } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";

interface ImageGalleryProps {
    isOpen: boolean;
    images: string[];
    initialIndex?: number;
    onClose: () => void;
}

// Integrated Logic inside ImageGallery
export function ImageGallery({ isOpen, images, initialIndex = 0, onClose }: ImageGalleryProps) {
    const [currentIndex, setCurrentIndex] = useState(initialIndex);
    const [direction, setDirection] = useState(0);
    const [mounted, setMounted] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [isMuted, setIsMuted] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);
    
    // Transform state
    const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

    // Sync props when opening - handled above for index/direction. 
    // But we still need side effects like body scroll.
    useEffect(() => {
        if (isOpen) {
            const handle = requestAnimationFrame(() => {
                setCurrentIndex(initialIndex);
                setDirection(0);
                setTransform({ scale: 1, x: 0, y: 0 });
                setIsPlaying(false);
                setProgress(0);
                setCurrentTime(0);
            });
            document.body.style.overflow = 'hidden';
            return () => cancelAnimationFrame(handle);
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [isOpen, initialIndex]);

    // Reset transform on image change
    useEffect(() => {
        const handle = requestAnimationFrame(() => setTransform({ scale: 1, x: 0, y: 0 }));
        return () => cancelAnimationFrame(handle);
    }, [currentIndex]);

    // Handle Keyboard
    const navigate = useCallback((dir: number) => {
        setDirection(dir);
        setIsPlaying(false);
        setProgress(0);
        setCurrentTime(0);
        setCurrentIndex(prev => (prev + dir + images.length) % images.length);
    }, [images.length]);

    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
            if (e.key === "ArrowLeft") navigate(-1);
            if (e.key === "ArrowRight") navigate(1);
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isOpen, onClose, navigate]); // Dependencies

    // Wheel Zoom Logic (Mouse Centered)
    const handleWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        e.stopPropagation();

        const delta = -e.deltaY;
        const scaleStep = 0.3;
        const newScale = Math.min(Math.max(transform.scale + (delta > 0 ? scaleStep : -scaleStep), 1), 5); // Max scale 5x

        if (newScale === transform.scale) return;

        // Calculate mouse position relative to window center (which is image center initially)
        // We assume image is centered in viewport
        const rect = e.currentTarget.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        
        const mouseX = e.clientX - rect.left - centerX;
        const mouseY = e.clientY - rect.top - centerY;

        // Formula: NewTrans = Mouse - (Mouse - OldTrans) * (NewScale / OldScale)
        // Keeps the point under mouse stationary relative to viewport
        const scaleRatio = newScale / transform.scale;
        
        let newX = mouseX - (mouseX - transform.x) * scaleRatio;
        let newY = mouseY - (mouseY - transform.y) * scaleRatio;

        // If zooming out to 1, snap to center
        if (newScale === 1) {
            newX = 0;
            newY = 0;
        }

        setTransform({
            scale: newScale,
            x: newX,
            y: newY
        });
    };

    // Drag Logic
    const handlePointerDown = (e: React.PointerEvent) => {
        if (transform.scale <= 1) return;
        e.preventDefault();
        setIsDragging(true);
        setDragStart({ 
            x: e.clientX - transform.x, 
            y: e.clientY - transform.y 
        });
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!isDragging) return;
        e.preventDefault();
        setTransform(prev => ({
            ...prev,
            x: e.clientX - dragStart.x,
            y: e.clientY - dragStart.y
        }));
    };

    const handlePointerUp = () => {
        setIsDragging(false);
    };

    useEffect(() => {
        const handle = requestAnimationFrame(() => setMounted(true));
        return () => cancelAnimationFrame(handle);
    }, []);

    if (!mounted || typeof document === 'undefined') return null;

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-100000 flex items-center justify-center overflow-hidden bg-black/95 transition-colors duration-500"
                    onPointerUp={handlePointerUp}
                    onPointerLeave={handlePointerUp}
                >
                    {/* Dynamic Blurred Background Layer (Optional, kept for aesthetics) */}
                    <div 
                        className="absolute inset-0 z-0 overflow-hidden pointer-events-none opacity-40 transition-opacity duration-700"
                    >
                        <div 
                            className="absolute inset-0 bg-cover bg-center blur-[100px] saturate-150 transform scale-110"
                            style={{ backgroundImage: `url(${images[currentIndex]})` }}
                        />
                    </div>

                    {/* Top Control Bar */}
                    <div className="absolute top-0 left-0 right-0 p-4 sm:p-8 flex items-center justify-end z-50 bg-linear-to-b from-black/60 to-transparent pointer-events-none">
                        <button 
                            onClick={onClose}
                            className="h-12 w-12 rounded-2xl bg-white/10 backdrop-blur-xl border border-white/10 flex items-center justify-center text-white hover:bg-white/20 hover:scale-105 transition-all active:scale-90 pointer-events-auto"
                            title="关闭 (Esc)"
                        >
                            <X size={24} />
                        </button>
                    </div>

                    {/* Bottom Indicator */}
                    {images.length > 1 && (
                        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
                            <div className="backdrop-blur-md bg-black/40 px-4 py-2 rounded-full border border-white/10 shadow-lg pointer-events-auto flex items-center gap-2">
                                <span className="text-sm font-bold text-white">{currentIndex + 1}</span>
                                <span className="text-xs font-medium text-white/40">/</span>
                                <span className="text-xs font-bold text-white/60">{images.length}</span>
                            </div>
                        </div>
                    )}

                    {/* Navigation Arrows */}
                    {images.length > 1 && (
                        <>
                            <button
                                onClick={(e) => { e.stopPropagation(); navigate(-1); }}
                                className="absolute left-4 sm:left-8 top-1/2 -translate-y-1/2 h-16 w-16 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 rounded-full transition-all z-50 pointer-events-auto"
                            >
                                <ChevronLeft size={48} strokeWidth={1} />
                            </button>
                            <button
                                onClick={(e) => { e.stopPropagation(); navigate(1); }}
                                className="absolute right-4 sm:right-8 top-1/2 -translate-y-1/2 h-16 w-16 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 rounded-full transition-all z-50 pointer-events-auto"
                            >
                                <ChevronRight size={48} strokeWidth={1} />
                            </button>
                        </>
                    )}

                    {/* Main Content Area - This captures Wheel events */}
                    <div 
                        className="relative z-10 w-full h-full flex items-center justify-center overflow-hidden touch-none"
                        onWheel={handleWheel}
                    >
                        {/* Wrapper for Slide Animation */}
                        <AnimatePresence initial={false} custom={direction} mode="popLayout">
                            <motion.div
                                key={currentIndex}
                                custom={direction}
                                variants={{
                                    enter: (dir: number) => ({ 
                                        x: dir === 0 ? 0 : (dir > 0 ? 500 : -500), 
                                        opacity: 0,
                                        scale: dir === 0 ? 0.8 : 1 // Zoom in if opening (dir=0)
                                    }),
                                    center: { x: 0, opacity: 1, scale: 1 },
                                    exit: (dir: number) => ({ 
                                        x: dir === 0 ? 0 : (dir < 0 ? 500 : -500), 
                                        opacity: 0,
                                        scale: dir === 0 ? 0.8 : 1 // Zoom out if closing (conceptually not used here as we unmount parent, but good to have)
                                    })
                                }}
                                initial="enter"
                                animate="center"
                                exit="exit"
                                transition={{ x: { type: "spring", stiffness: 300, damping: 30 }, opacity: { duration: 0.2 } }}
                                className="flex items-center justify-center w-full h-full pointer-events-none" // Inner pointer events handled by img
                            >
                                {/* The Image Itself - Handles Drag and Zoom Transform */}
                                <div 
                                    className={`relative max-w-full max-h-full drop-shadow-2xl pointer-events-auto ${transform.scale > 1 ? 'cursor-grab active:cursor-grabbing' : ''}`}
                                    style={{
                                        width: '100%',
                                        height: '100%',
                                        transform: `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.scale})`,
                                        transition: isDragging ? 'none' : 'transform 0.1s ease-out'
                                    }}
                                    onPointerDown={handlePointerDown}
                                    onPointerMove={handlePointerMove}
                                >
                                    {images[currentIndex] && (/\.(mp4|webm|ogg|mov|m4v)$/i.test((images[currentIndex] || "").split('?')[0])) ? (
                                        <div className="relative w-full h-full flex items-center justify-center group pointer-events-auto">
                                            <video
                                                ref={videoRef}
                                                src={images[currentIndex]}
                                                disablePictureInPicture
                                                disableRemotePlayback
                                                muted={isMuted}
                                                controlsList="nodownload noplaybackrate"
                                                className="w-full h-full object-contain cursor-pointer"
                                                onContextMenu={(e) => e.preventDefault()}
                                                onClick={() => {
                                                    if (videoRef.current?.paused) {
                                                        videoRef.current.play();
                                                        setIsPlaying(true);
                                                    } else {
                                                        videoRef.current?.pause();
                                                        setIsPlaying(false);
                                                    }
                                                }}
                                                onTimeUpdate={() => {
                                                    if (videoRef.current) {
                                                        const current = videoRef.current.currentTime;
                                                        const duration = videoRef.current.duration;
                                                        const p = (current / duration) * 100;
                                                        setProgress(isNaN(p) ? 0 : p);
                                                        setCurrentTime(current);
                                                    }
                                                }}
                                                onEnded={() => setIsPlaying(false)}
                                                playsInline
                                            />
                                            
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
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                videoRef.current?.play();
                                                                setIsPlaying(true);
                                                            }}
                                                        >
                                                            <Play size={80} fill="currentColor" strokeWidth={0} />
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>

                                            <div className="absolute bottom-12 left-0 right-0 px-8 py-4 opacity-100 transition-opacity duration-300 pointer-events-none z-50">
                                                <div className="max-w-4xl mx-auto backdrop-blur-2xl bg-black/70 px-5 py-4 rounded-2xl border border-white/20 flex items-center gap-4 pointer-events-auto shadow-2xl">
                                                    <div 
                                                        className="flex-1 h-3 flex items-center cursor-pointer pointer-events-auto group/progress"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            if (videoRef.current && videoRef.current.duration) {
                                                                const rect = e.currentTarget.getBoundingClientRect();
                                                                const x = e.clientX - rect.left;
                                                                const pct = Math.max(0, Math.min(1, x / rect.width));
                                                                
                                                                const newTime = pct * videoRef.current.duration;
                                                                setProgress(pct * 100);
                                                                setCurrentTime(newTime);
                                                                videoRef.current.currentTime = newTime;
                                                            }
                                                        }}
                                                    >
                                                        <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden relative">
                                                            <motion.div 
                                                                className="absolute inset-y-0 left-0 bg-white shadow-[0_0_12px_rgba(255,255,255,0.8)] group-hover/progress:bg-primary transition-colors"
                                                                style={{ width: `${progress}%` }}
                                                                transition={{ duration: 0 }}
                                                            />
                                                        </div>
                                                    </div>

                                                    <div className="text-xs font-mono text-white/90 min-w-[60px] text-right font-bold tracking-tighter">
                                                        {`${Math.floor(currentTime / 60)}:${String(Math.floor(currentTime % 60)).padStart(2, '0')}`}
                                                    </div>
                                                    <div className="flex items-center gap-3 ml-2 border-l border-white/20 pl-4">
                                                        <button 
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setIsMuted(!isMuted);
                                                            }}
                                                            className="text-white/80 hover:text-white transition-colors"
                                                            title={isMuted ? "取消静音" : "静音"}
                                                        >
                                                            {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
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
                                                            className="text-white/80 hover:text-white transition-colors"
                                                            title="全屏"
                                                        >
                                                            <Maximize size={18} />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ) : images[currentIndex] ? (
                                        <Image
                                            src={images[currentIndex]}
                                            alt={`图片 ${currentIndex + 1}`}
                                            fill
                                            className="object-contain"
                                            draggable={false}
                                            onContextMenu={(e) => e.preventDefault()}
                                            unoptimized
                                        />
                                    ) : null}
                                </div>
                            </motion.div>
                        </AnimatePresence>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
}
