"use client";

import { useState, useRef, useEffect } from "react";
import { motion, useMotionValue, useSpring, animate } from "framer-motion";
import { cn } from "@/lib/utils";

const SOFT_SPRING_CONFIG = { stiffness: 180, damping: 25, mass: 0.5 };
const HARD_SPRING_CONFIG = { stiffness: 5000, damping: 200, mass: 0.05 };

interface GestureImageProps {
  src: string;
  alt?: string;
  className?: string;
  onScaleChange?: (scale: number) => void;
}

export const GestureImage = ({ src, alt = "预览", className, onScaleChange }: GestureImageProps) => {
  const scaleValue = useMotionValue(1);
  const xValue = useMotionValue(0);
  const yValue = useMotionValue(0);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [isDragging, setIsDragging] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);
  
  const lastPinchDistance = useRef<number | null>(null);
  const dragStart = useRef({ x: 0, y: 0 });
  const lastTapTime = useRef(0);

  const smoothScale = useSpring(scaleValue, SOFT_SPRING_CONFIG);
  const smoothX = useSpring(xValue, isDragging ? HARD_SPRING_CONFIG : SOFT_SPRING_CONFIG);
  const smoothY = useSpring(yValue, isDragging ? HARD_SPRING_CONFIG : SOFT_SPRING_CONFIG);

  useEffect(() => {
    return scaleValue.on("change", (v) => {
      onScaleChange?.(v);
      setIsZoomed(v > 1.05);
    });
  }, [scaleValue, onScaleChange]);

  useEffect(() => {
    animate(scaleValue, 1, SOFT_SPRING_CONFIG);
    animate(xValue, 0, SOFT_SPRING_CONFIG);
    animate(yValue, 0, SOFT_SPRING_CONFIG);
  }, [src, scaleValue, xValue, yValue]);

  const zoomToPoint = (clientX: number, clientY: number, nextScale: number) => {
    const container = containerRef.current;
    const currentScale = scaleValue.get();
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const pointerX = clientX - rect.left - centerX;
    const pointerY = clientY - rect.top - centerY;
    const ratio = nextScale / currentScale;

    xValue.set(pointerX - (pointerX - xValue.get()) * ratio);
    yValue.set(pointerY - (pointerY - yValue.get()) * ratio);
    scaleValue.set(nextScale);
  };

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
          animate(scaleValue, 1, SOFT_SPRING_CONFIG);
          animate(xValue, 0, SOFT_SPRING_CONFIG);
          animate(yValue, 0, SOFT_SPRING_CONFIG);
        } else {
          animate(scaleValue, 2.5, SOFT_SPRING_CONFIG);
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
      animate(xValue, 0, SOFT_SPRING_CONFIG);
      animate(yValue, 0, SOFT_SPRING_CONFIG);
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = -e.deltaY;
    const currentScale = scaleValue.get();
    const newScale = Math.min(Math.max(currentScale + (delta > 0 ? 0.3 : -0.3), 1), 5);
    
    if (newScale === 1) {
      animate(scaleValue, 1, SOFT_SPRING_CONFIG);
      animate(xValue, 0, SOFT_SPRING_CONFIG);
      animate(yValue, 0, SOFT_SPRING_CONFIG);
    } else {
      zoomToPoint(e.clientX, e.clientY, newScale);
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "touch" || scaleValue.get() <= 1.05) return;
    setIsDragging(true);
    dragStart.current = {
      x: e.clientX - xValue.get(),
      y: e.clientY - yValue.get(),
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || e.pointerType === "touch") return;
    xValue.set(e.clientX - dragStart.current.x);
    yValue.set(e.clientY - dragStart.current.y);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (e.pointerType !== "touch" && e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setIsDragging(false);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (scaleValue.get() > 1.1) {
      animate(scaleValue, 1, SOFT_SPRING_CONFIG);
      animate(xValue, 0, SOFT_SPRING_CONFIG);
      animate(yValue, 0, SOFT_SPRING_CONFIG);
      return;
    }

    zoomToPoint(e.clientX, e.clientY, 2.5);
  };

  return (
    <motion.div
      ref={containerRef}
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
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDoubleClick={handleDoubleClick}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className="max-w-full max-h-full object-contain rounded-lg shadow-2xl pointer-events-none block"
        draggable={false}
      />
    </motion.div>
  );
};
