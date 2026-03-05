"use client";

import { useState, useRef, useEffect } from "react";
import { motion, useMotionValue, useSpring, animate } from "framer-motion";
import { cn } from "@/lib/utils";

interface GestureImageProps {
  src: string;
  alt?: string;
  className?: string;
  onScaleChange?: (scale: number) => void;
}

export const GestureImage = ({ src, alt = "Preview", className, onScaleChange }: GestureImageProps) => {
  const scaleValue = useMotionValue(1);
  const xValue = useMotionValue(0);
  const yValue = useMotionValue(0);
  
  const [isDragging, setIsDragging] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);
  
  const lastPinchDistance = useRef<number | null>(null);
  const dragStart = useRef({ x: 0, y: 0 });
  const lastTapTime = useRef(0);

  const softSpringConfig = { stiffness: 180, damping: 25, mass: 0.5 };
  const hardSpringConfig = { stiffness: 5000, damping: 200, mass: 0.05 };

  const smoothScale = useSpring(scaleValue, softSpringConfig);
  const smoothX = useSpring(xValue, isDragging ? hardSpringConfig : softSpringConfig);
  const smoothY = useSpring(yValue, isDragging ? hardSpringConfig : softSpringConfig);

  useEffect(() => {
    return scaleValue.on("change", (v) => {
      onScaleChange?.(v);
      setIsZoomed(v > 1.05);
    });
  }, [scaleValue, onScaleChange]);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].pageX - e.touches[1].pageX,
        e.touches[0].pageY - e.touches[1].pageY
      );
      lastPinchDistance.current = dist;
      setIsDragging(false);
    } else if (e.touches.length === 1) {
      const now = Date.now();
      if (now - lastTapTime.current < 300) {
        if (scaleValue.get() > 1.1) {
          animate(scaleValue, 1, softSpringConfig);
          animate(xValue, 0, softSpringConfig);
          animate(yValue, 0, softSpringConfig);
        } else {
          animate(scaleValue, 2.5, softSpringConfig);
        }
        lastTapTime.current = 0;
        return;
      }
      lastTapTime.current = now;
      
      setIsDragging(true);
      dragStart.current = { 
        x: e.touches[0].pageX - xValue.get(), 
        y: e.touches[0].pageY - yValue.get() 
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && lastPinchDistance.current !== null) {
      const dist = Math.hypot(
        e.touches[0].pageX - e.touches[1].pageX,
        e.touches[0].pageY - e.touches[1].pageY
      );
      const delta = dist / lastPinchDistance.current;
      const newScale = Math.min(Math.max(scaleValue.get() * delta, 1), 5);
      scaleValue.set(newScale);
      lastPinchDistance.current = dist;
    } else if (e.touches.length === 1 && isDragging) {
      const currentScale = scaleValue.get();
      if (currentScale > 1.05) {
        xValue.set(e.touches[0].pageX - dragStart.current.x);
        yValue.set(e.touches[0].pageY - dragStart.current.y);
      }
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    lastPinchDistance.current = null;
    
    if (scaleValue.get() <= 1.05) {
      animate(xValue, 0, softSpringConfig);
      animate(yValue, 0, softSpringConfig);
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = -e.deltaY;
    const currentScale = scaleValue.get();
    const newScale = Math.min(Math.max(currentScale + (delta > 0 ? 0.3 : -0.3), 1), 5);
    
    if (newScale === 1) {
      animate(scaleValue, 1, softSpringConfig);
      animate(xValue, 0, softSpringConfig);
      animate(yValue, 0, softSpringConfig);
    } else {
      scaleValue.set(newScale);
    }
  };

  return (
    <motion.div
      className={cn(
        "relative flex items-center justify-center select-none touch-none w-full h-full",
        isZoomed ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in",
        className
      )}
      style={{
        x: smoothX,
        y: smoothY,
        scale: smoothScale,
        willChange: "transform"
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onWheel={handleWheel}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className="max-w-full max-h-full object-contain rounded-lg shadow-2xl pointer-events-none block"
        style={{ maxHeight: '75dvh' }}
        draggable={false}
      />
    </motion.div>
  );
};
