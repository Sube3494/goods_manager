"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Plus, ChevronLeft, ChevronRight, Minimize2, Maximize2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

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
    const [prevIsOpen, setPrevIsOpen] = useState(isOpen);

    // State derived from props pattern: Reset state immediately when opening
    if (isOpen && !prevIsOpen) {
        setPrevIsOpen(true);
        setCurrentIndex(initialIndex);
        setDirection(0);
        // Reset transform too?
        // setTransform({ scale: 1, x: 0, y: 0 }); // Can't update transform here as it's state, will trigger infinite loop if not careful?
        // Actually, we can if we manage it correctly. But let's rely on useEffect for transform reset on index change.
    } else if (!isOpen && prevIsOpen) {
        setPrevIsOpen(false);
    }
    
    // Transform state
    const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

    // Sync props when opening - handled above for index/direction. 
    // But we still need side effects like body scroll.
    useEffect(() => {
        if (isOpen) {
             // Ensure transform is reset on open too
            setTransform({ scale: 1, x: 0, y: 0 });
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [isOpen]); // dependency on isOpen only is fine as index/transform handled elsewhere/above

    // Reset transform on image change
    useEffect(() => {
        setTransform({ scale: 1, x: 0, y: 0 });
    }, [currentIndex]);

    // Handle Keyboard
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
            if (e.key === "ArrowLeft") navigate(-1);
            if (e.key === "ArrowRight") navigate(1);
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isOpen, onClose]); // Dependencies

    const navigate = (dir: number) => {
        setDirection(dir);
        setCurrentIndex(prev => (prev + dir + images.length) % images.length);
    };

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

    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted || typeof document === 'undefined') return null;

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-10001 flex items-center justify-center overflow-hidden bg-black/95 transition-colors duration-500"
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
                    <div className="absolute top-0 left-0 right-0 p-4 sm:p-8 flex items-center justify-between z-50 bg-linear-to-b from-black/60 to-transparent pointer-events-none">
                        <div className="flex flex-col gap-0.5 backdrop-blur-md bg-black/20 px-4 py-2 rounded-2xl border border-white/5 pointer-events-auto">
                            <span className="text-[10px] font-bold text-white/50 uppercase tracking-[0.2em]">Preview</span>
                            <div className="flex items-center gap-3">
                                <span className="text-xl font-black text-white">{currentIndex + 1}</span>
                                <div className="h-4 w-px bg-white/20" />
                                <span className="text-sm font-bold text-white/40">{images.length}</span>
                            </div>
                        </div>
                        <button 
                            onClick={onClose}
                            className="h-12 w-12 rounded-2xl bg-white/10 backdrop-blur-xl border border-white/10 flex items-center justify-center text-white hover:bg-white/20 hover:scale-105 transition-all active:scale-90 pointer-events-auto"
                            title="关闭 (Esc)"
                        >
                            <X size={24} />
                        </button>
                    </div>

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
                                <img
                                    src={images[currentIndex]}
                                    alt={`Gallery Image ${currentIndex + 1}`}
                                    onPointerDown={handlePointerDown}
                                    onPointerMove={handlePointerMove}
                                    // pointer-events-auto is crucial here because parent has pointer-events-none
                                    className={`max-w-full max-h-full object-contain drop-shadow-2xl pointer-events-auto ${transform.scale > 1 ? 'cursor-grab active:cursor-grabbing' : ''}`}
                                    style={{
                                        transform: `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.scale})`,
                                        transition: isDragging ? 'none' : 'transform 0.1s ease-out' // Smooth zoom, instant drag
                                    }}
                                    draggable={false} // Prevent native drag
                                />
                            </motion.div>
                        </AnimatePresence>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
}
