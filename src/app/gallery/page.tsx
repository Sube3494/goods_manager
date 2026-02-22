"use client";

import { useState, useEffect, Suspense, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform, animate } from "framer-motion";
import { Camera, ChevronRight, X, Download, Plus, CheckCircle, Package, Search, PlayCircle, Info, ArrowUp, Trash2, RefreshCcw, Link2 } from "lucide-react";

import { ProductSelectionModal } from "@/components/Purchases/ProductSelectionModal";

import { ActionBar } from "@/components/ui/ActionBar";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { useToast } from "@/components/ui/Toast";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { cn } from "@/lib/utils";
import Image from "next/image";

import { useUser } from "@/hooks/useUser";
import { hasPermission } from "@/lib/permissions";
import { Product, GalleryItem, Category } from "@/lib/types";
import { SessionUser } from "@/lib/permissions";
import { useCallback } from "react";


interface LightboxMediaItemProps {
    item: GalleryItem;
    direction: number;
    onNavigate: (dir: number) => void;
    onScaleChange: (v: number) => void;
    totalItems: number;
}

const LightboxMediaItem = ({ item, direction, onNavigate, onScaleChange, totalItems }: LightboxMediaItemProps) => {
    const scaleValue = useMotionValue(1);
    const xValue = useMotionValue(0);
    const yValue = useMotionValue(0);
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [isZoomed, setIsZoomed] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);

    // 当切换到视频时强制播放
    useEffect(() => {
        if (item.type === 'video' && videoRef.current) {
            videoRef.current.currentTime = 0;
            videoRef.current.play().catch(() => {});
        }
    }, [item.type, item.url]);

    const softSpringConfig = { stiffness: 180, damping: 20, mass: 0.4 };
    const hardSpringConfig = { stiffness: 5000, damping: 200, mass: 0.05 };

    const smoothScale = useSpring(scaleValue, softSpringConfig);
    const smoothX = useSpring(xValue, isDragging ? hardSpringConfig : softSpringConfig);
    const smoothY = useSpring(yValue, isDragging ? hardSpringConfig : softSpringConfig);

    useEffect(() => {
        const unsub = scaleValue.on("change", (v) => {
            onScaleChange(v);
            if (v > 1.05 && !isZoomed) setIsZoomed(true);
            if (v <= 1.05 && isZoomed) setIsZoomed(false);
        });
        return unsub;
    }, [isZoomed, scaleValue, onScaleChange]);

    const handleWheel = (e: React.WheelEvent) => {
        if (item.type === 'video') return;
        e.preventDefault();
        const delta = -e.deltaY;
        const scaleStep = 0.3;
        const currentScale = scaleValue.get();
        const newScale = Math.min(Math.max(currentScale + (delta > 0 ? scaleStep : -scaleStep), 1), 5);
        if (newScale === currentScale) return;

        const rect = e.currentTarget.getBoundingClientRect();
        const mouseX = e.clientX - rect.left - rect.width / 2;
        const mouseY = e.clientY - rect.top - rect.height / 2;
        const scaleRatio = newScale / currentScale;
        
        const newX = mouseX - (mouseX - xValue.get()) * scaleRatio;
        const newY = mouseY - (mouseY - yValue.get()) * scaleRatio;

        if (newScale === 1) {
            animate(scaleValue, 1, { type: "spring", ...softSpringConfig });
            animate(xValue, 0, { type: "spring", ...softSpringConfig });
            animate(yValue, 0, { type: "spring", ...softSpringConfig });
        } else {
            scaleValue.set(newScale);
            xValue.set(newX);
            yValue.set(newY);
        }
    };

    const handlePointerDown = (e: React.PointerEvent) => {
        // 视频可以滑动导航，但不拖动内容
        if (item.type !== 'video') {
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }
        setIsDragging(true);
        setDragStart({ x: e.clientX - (item.type === 'video' ? 0 : xValue.get()), y: e.clientY - (item.type === 'video' ? 0 : yValue.get()) });
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!isDragging || item.type === 'video') return;
        const newX = e.clientX - dragStart.x;
        if (scaleValue.get() <= 1) {
            xValue.set(newX);
        } else {
            xValue.set(newX);
            yValue.set(e.clientY - dragStart.y);
        }
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        if (!isDragging) return;
        if (item.type !== 'video') {
            (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        }
        setIsDragging(false);

        if (item.type === 'video') {
            // 视频：只模拟滑动导航，不移动内容
            const swipeX = e.clientX - dragStart.x;
            const threshold = 50;
            if (totalItems > 1 && swipeX > threshold) {
                onNavigate(-1);
            } else if (totalItems > 1 && swipeX < -threshold) {
                onNavigate(1);
            }
            return;
        }

        if (scaleValue.get() < 1.05) {
            const currentX = xValue.get();
            const threshold = 50;
            if (totalItems > 1 && currentX > threshold) {
                onNavigate(-1);
            } else if (totalItems > 1 && currentX < -threshold) {
                onNavigate(1);
            } else {
                animate(xValue, 0, { type: "spring", ...softSpringConfig });
                animate(yValue, 0, { type: "spring", ...softSpringConfig });
            }
        }
    };

    return (
        <motion.div
            custom={direction}
            variants={{
                enter: (dir: number) => ({
                    x: dir === 0 ? 0 : (dir > 0 ? 500 : -500),
                    opacity: 0,
                    scale: 0.95,
                    zIndex: 1
                }),
                center: { 
                    x: 0, 
                    opacity: 1, 
                    scale: 1, 
                    zIndex: 10 
                },
                exit: (dir: number) => ({
                    x: dir === 0 ? 0 : (dir < 0 ? 500 : -500),
                    opacity: 0,
                    scale: 0.95,
                    zIndex: 1
                })
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ 
                x: { type: "spring", stiffness: 350, damping: 35 },
                opacity: { duration: 0.2 },
                scale: { duration: 0.2 }
            }}
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
        >
            <motion.div 
                className={cn(
                    "relative drop-shadow-2xl pointer-events-auto flex items-center justify-center",
                    isZoomed && !(item.type === 'video') ? "cursor-grab active:cursor-grabbing" : ""
                )}
                style={{
                    x: smoothX,
                    y: smoothY,
                    scale: smoothScale,
                    width: '100%',
                    height: '100%',
                    willChange: "transform",
                    touchAction: 'none'
                }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
                onWheel={handleWheel}
            >
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
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img 
                        src={item.url} 
                        alt="Gallery View" 
                        className="max-w-[95%] sm:max-w-[90%] max-h-[70%] sm:max-h-[75%] object-contain rounded-2xl shadow-2xl mx-auto border border-white/5"
                        draggable={false}
                    />
                )}
            </motion.div>
        </motion.div>
    );
};

function GalleryContent() {
  const { user } = useUser();
  const isAdmin = !!user;
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedImage, setSelectedImage] = useState<GalleryItem | null>(null);
  const [mounted, setMounted] = useState(false);
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Pagination State
  const [hasMore, setHasMore] = useState(true);
  const [isNextPageLoading, setIsNextPageLoading] = useState(false);
  const itemsRef = useRef<GalleryItem[]>([]);
  const currentPageRef = useRef(1);

  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isUploadAllowed, setIsUploadAllowed] = useState(false);

  // Debouncing search
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Sync ref with items
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showBackToTop, setShowBackToTop] = useState(false);

  // Scroll listener for Back to Top button
  useEffect(() => {
    const handleScroll = (e: Event) => {
      const target = e.target;
      let st = 0;
      
      if (target === document || target === window) {
        st = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
      } else if (target instanceof HTMLElement) {
        st = target.scrollTop;
      }
        
      setShowBackToTop(st > 10);
    };
    
    window.addEventListener("scroll", handleScroll, true);
    return () => window.removeEventListener("scroll", handleScroll, true);
  }, []);
  const { showToast } = useToast();
  const canUpload = isAdmin ? hasPermission(user as SessionUser | null, "gallery:upload") : isUploadAllowed;
  const canDelete = hasPermission(user as SessionUser | null, "gallery:delete");
  
  // Lightbox Enhancements
  const [previewDirection, setPreviewDirection] = useState(0);
  const activeScale = useMotionValue(1);
  const uiOpacity = useTransform(activeScale, [1, 1.05], [1, 0]);
  const uiYOffset = useTransform(activeScale, [1, 1.05], [0, -20]);
  const bottomUiYOffset = useTransform(activeScale, [1, 1.05], [0, 20]);

  const [isZoomed, setIsZoomed] = useState(false);
  useEffect(() => {
    return activeScale.on("change", (v) => {
        if (v > 1.05 && !isZoomed) setIsZoomed(true);
        if (v <= 1.05 && isZoomed) setIsZoomed(false);
    });
  }, [isZoomed, activeScale]);

  const [showInfo, setShowInfo] = useState(false);

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

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch("/api/system/info");
        if (res.ok) {
          const data = await res.json();
          setIsUploadAllowed(data.allowGalleryUpload ?? true);
        }
      } catch (error) {
        console.error("Failed to fetch settings:", error);
      }
    };
    
    fetchSettings();
  }, []);
  
  // Upload States
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isProductSelectOpen, setIsProductSelectOpen] = useState(false);
  // 修改 isUploading 为 string | boolean 以便呈现进度
  const [isUploading, setIsUploading] = useState<boolean | string>(false);
  const [uploadForm, setUploadForm] = useState<{
    productId: string;
    urls: { url: string; type: 'image' | 'video' }[],
    tags: string
  }>({
    productId: "",
    urls: [],
    tags: ""
  });
  const [selectedDeleteIndices, setSelectedDeleteIndices] = useState<number[]>([]);

  const fetchData = useCallback(async (isFirstPage = true) => {
    try {
      const targetPage = isFirstPage ? 1 : currentPageRef.current + 1;
      
      if (isFirstPage && itemsRef.current.length === 0) {
        setIsLoading(true);
      }
      if (!isFirstPage) {
        setIsNextPageLoading(true);
      }

      const params = new URLSearchParams({
        page: String(targetPage),
        pageSize: "20",
        ...(debouncedSearchQuery ? { query: debouncedSearchQuery } : {}),
        ...(selectedCategory !== "All" ? { category: selectedCategory } : {})
      });

      const galleryUrl = `/api/gallery?${params.toString()}`;
      
      const [galleryRes, categoriesRes] = await Promise.all([
        fetch(galleryUrl),
        fetch("/api/categories") 
      ]);

      if (galleryRes.ok && categoriesRes.ok) {
        const galleryResponse = await galleryRes.json();
        const galleryData = galleryResponse.items || [];
        const categoriesData = await categoriesRes.json();
        
        // Extract products directly from gallery items (they are populated by Prisma include)
        const uniqueProductsMap = new Map<string, Product>();
        galleryData.forEach((item: GalleryItem) => {
          if (item.product && item.productId && !uniqueProductsMap.has(item.productId)) {
            uniqueProductsMap.set(item.productId, item.product);
          }
        });
        const productsArray = Array.from(uniqueProductsMap.values());
        
        if (isFirstPage) {
            setItems(galleryData);
        } else {
            setItems(prev => {
                const existingIds = new Set(prev.map(i => i.id));
                const newItems = galleryData.filter((i: GalleryItem) => !existingIds.has(i.id));
                return [...prev, ...newItems];
            });
        }
        
        currentPageRef.current = targetPage;
        setHasMore(galleryResponse.hasMore ?? false);
        
        // Update auxiliary state
        setCategories(categoriesData);
        
        // Append unique products to the unified store
        setProducts(prev => {
            const existingProductIds = new Set(prev.map(p => p.id));
            const newProducts = productsArray.filter(p => !existingProductIds.has(p.id));
            return [...prev, ...newProducts];
        });
      }
    } catch (error) {
      console.error("Gallery fetch failed:", error);
    } finally {
      setIsLoading(false);
      setIsNextPageLoading(false);
    }
  }, [debouncedSearchQuery, selectedCategory]);

  useEffect(() => {
    setMounted(true);
    fetchData(true);
  }, [debouncedSearchQuery, selectedCategory, fetchData]);

  // Infinite Scroll Observer
  useEffect(() => {
    if (!hasMore || isLoading || isNextPageLoading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          fetchData(false);
        }
      },
      { rootMargin: "200px" } // Load a bit before reaching bottom
    );

    const target = document.querySelector("#gallery-scroll-anchor");
    if (target) {
      observer.observe(target);
    }

    return () => observer.disconnect();
  }, [fetchData, hasMore, isLoading, isNextPageLoading]);

  useEffect(() => {
    if (selectedImage || isUploadModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [selectedImage, isUploadModalOpen]);


  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // 1. Check current count
    const currentCount = uploadForm.urls.length;
    const remainingSlots = 9 - currentCount;

    if (remainingSlots <= 0) {
      showToast("最多只能上传 9 个文件", "error");
      e.target.value = ''; // Reset input
      return;
    }

    // 2. Slice files to fit limit
    const filesArray = Array.from(files);
    let filesToUpload = filesArray;
    
    if (filesArray.length > remainingSlots) {
      showToast(`最多只能上传 9 个文件，已为您保留前 ${remainingSlots} 个`, "error");
      filesToUpload = filesArray.slice(0, remainingSlots);
    }

    setIsUploading(`准备上传 0/${filesToUpload.length}...`);

    try {
      // -- 并发控制逻辑 (Concurrency Control) --
      const CONCURRENCY_LIMIT = 3;
      const results: PromiseSettledResult<{ url: string; type: 'image' | 'video' }>[] = [];
      let completedCount = 0;
      let activePromises: Promise<void>[] = [];

      for (const file of filesToUpload) {
        const uploadTask = async () => {
          try {
            const arrayBuffer = await file.arrayBuffer();
            const res = await fetch("/api/upload", {
                method: "POST",
                headers: {
                  "Content-Type": file.type,
                  "X-File-Name": encodeURIComponent(file.name),
                  "X-File-Type": file.type,
                  "x-folder": "gallery"
                },
                body: arrayBuffer,
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || "服务器上传失败");
            }
            const data = await res.json();
            results.push({ status: 'fulfilled', value: data });
          } catch (err) {
            results.push({ status: 'rejected', reason: err });
          } finally {
            completedCount++;
            setIsUploading(`正在上传 ${completedCount}/${filesToUpload.length}...`);
          }
        };

        const p = uploadTask();
        activePromises.push(p);

        // Remove from active block when done
        p.then(() => {
          activePromises = activePromises.filter(curr => curr !== p);
        });

        // Block if we hit the limit
        if (activePromises.length >= CONCURRENCY_LIMIT) {
          await Promise.race(activePromises);
        }
      }

      // Wait for all remaining
      await Promise.all(activePromises);
      // -- 并发控制结束 --

      const successfulFiles = results
        .filter((r): r is PromiseFulfilledResult<{ url: string; type: 'image' | 'video' }> => r.status === 'fulfilled')
        .map(r => r.value);
      
      const failedCount = results.filter(r => r.status === 'rejected').length;
      
      setUploadForm(prev => {
        const existingUrls = new Set(prev.urls.map(u => u.url));
        const uniqueNewFiles = successfulFiles.filter(f => !existingUrls.has(f.url));
        
        if (uniqueNewFiles.length > 0) {
          showToast(`成功上传 ${uniqueNewFiles.length} 个文件${failedCount > 0 ? `，${failedCount} 个失败` : ''}`, "success");
        } else if (failedCount > 0) {
          showToast(`${failedCount} 个文件上传失败`, "error");
        } else if (successfulFiles.length > 0) {
          showToast("所选文件已全部存在于列表中", "info");
        }
        
        return { 
          ...prev, 
          urls: [...prev.urls, ...uniqueNewFiles] 
        };
      });
      
    } catch (error) {
      console.error("Critical upload error:", error);
      showToast("操作失败，请重试", "error");
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (uploadForm.urls.length === 0) return;

    // Admin direct upload logic
    if (isAdmin && uploadForm.productId) {
      try {
        const res = await fetch("/api/gallery", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...uploadForm,
            tags: uploadForm.tags.split(",").map(t => t.trim()).filter(Boolean)
          })
        });

        if (res.ok) {
          setIsUploadModalOpen(false);
          setUploadForm({ productId: "", urls: [], tags: "" });
          showToast("发布成功", "success");
          fetchData();
        }
      } catch (error) {
        console.error("Gallery submit failed:", error);
        showToast("发布失败", "error");
      }
      return;
    }

    // Non-admin or missing product ID (Submission logic)
    if (!uploadForm.productId && !uploadForm.tags && !isAdmin) { // Using tags field as a temporary storage or just relying on SKU/Name
        // Validation check for SKU or Product Name is handled by the API and UI
    }

    try {
      const res = await fetch("/api/gallery/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          urls: uploadForm.urls,
          sku: uploadForm.tags.split(",")[0]?.trim() || "", // Temporary use of tags field or new state
          productName: uploadForm.tags.split(",")[1]?.trim() || "",
          productId: uploadForm.productId // Send productId if available
        })
      });

      if (res.ok) {
        setIsUploadModalOpen(false);
        setUploadForm({ productId: "", urls: [], tags: "" });
        showToast("已提交审核，请耐心等待管理员处理", "success");
      } else {
        const data = await res.json();
        showToast(data.error || "提交失败", "error");
      }
    } catch (error) {
      console.error("Submission failed:", error);
      showToast("提交失败", "error");
    }
  };


  // Server-side filtered items
  const filteredItems = items;

  // Grouped logic: unique products with items
  const groupedProducts = useMemo(() => {
    const groups: Map<string, { product: Product, items: GalleryItem[] }> = new Map();
    const productOrder: string[] = [];
    
    filteredItems.forEach(item => {
      const pid = item.productId;
      if (!pid) return; // Safety
      
      if (!groups.has(pid)) {
        // Prepare a robust product object for display
        const productData = item.product || { id: pid, name: '未知商品', sku: 'N/A' };
        // Ensure id is present in the object used for grouping
        if (!productData.id) productData.id = pid;
        
        groups.set(pid, { product: productData as Product, items: [] });
        productOrder.push(pid);
      }
      groups.get(pid)?.items.push(item);
    });
    
    return productOrder.map(pid => groups.get(pid)!);
  }, [filteredItems]);

  const handleOpenProductPreview = (group: { product: Product; items: GalleryItem[] }) => {
    // Prefer the product's main image item; fall back to first non-video, then first item
    const mainImageItem = group.product.image
      ? group.items.find(item => item.url === group.product.image)
      : null;
    const firstItem = mainImageItem ||
      group.items.find(item => item.type !== 'video' && !/\.(mp4|mov|webm)$/i.test(item.url)) ||
      group.items[0];
    if (firstItem) {
      setSelectedImage(firstItem);
    }
  };

  const handleBatchDelete = () => {
    const count = selectedIds.length;
    setConfirmConfig({
      isOpen: true,
      title: "批量删除媒体",
      message: `确定要删除选中的 ${count} 个实拍项吗？此操作不可恢复。`,
      onConfirm: async () => {
        try {
          const res = await fetch("/api/gallery/batch", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids: selectedIds }),
          });
          if (res.ok) {
            showToast(`成功删除 ${count} 个项目`, "success");
            setSelectedIds([]);
            fetchData();
            setConfirmConfig(prev => ({ ...prev, isOpen: false }));
          } else {
            showToast("删除失败", "error");
          }
        } catch {
          showToast("请求失败", "error");
        }
      },
    });
  };


  // Navigation logic: match the same order as ProductFormModal gallery
  // (main cover image first, then by createdAt ascending)
  const relatedImages = selectedImage ? items.filter(img => {
      const isCorrectProduct = img.productId === selectedImage.productId;
      const isVisible = isAdmin || img.isPublic;
      return isCorrectProduct && isVisible;
  }).sort((a, b) => {
      const mainUrl = selectedImage.product?.image;
      if (mainUrl) {
          if (a.url === mainUrl) return -1;
          if (b.url === mainUrl) return 1;
      }
      return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
  }) : [];
  const currentIndex = relatedImages.findIndex(img => img.id === selectedImage?.id);

  const navigate = (dir: number) => {
    if (!selectedImage) return;
    const nextIndex = (currentIndex + dir + relatedImages.length) % relatedImages.length;
    setPreviewDirection(dir);
    setSelectedImage(relatedImages[nextIndex]);
  };

  // Navigation logic

  const handleDownload = async (url: string, filename: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error("Download failed:", error);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.target = "_blank";
      link.click();
    }
  };

  return (
    <div className="w-full pb-12 animate-in fade-in slide-in-from-top-4 duration-700">
        {/* Header */}
        {/* Header section with unified style */}
        <div className={cn(
          "flex items-center justify-between transition-all relative z-10 gap-4",
          canUpload ? "mb-6 sm:mb-8" : "mb-2 sm:mb-4"
        )}>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-foreground flex items-center gap-2">
                <span>实物<span className="text-primary">相册</span></span>
            </h1>
            <p className="text-muted-foreground mt-0.5 sm:mt-1.5 text-[10px] sm:text-lg truncate opacity-80 font-medium">
                {isAdmin ? "仓库实拍、验货详情与内部档案库" : "商品实拍图与细节展示"}
            </p>
          </div>

            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
               {(isUploadAllowed || isAdmin) && canUpload && (
                 <button 
                   onClick={() => {
                     setIsUploadModalOpen(true);
                     // Reset form if on main gallery page to avoid stale state
                     setUploadForm({ productId: "", urls: [], tags: "" });
                   }}
                   className="h-9 w-9 sm:h-10 sm:w-auto sm:px-6 rounded-full bg-primary text-primary-foreground text-sm flex items-center justify-center sm:gap-2 transition-all font-bold shadow-lg shadow-primary/20 hover:-translate-y-0.5 active:scale-95 whitespace-nowrap shrink-0"
                 >
                   <Plus size={20} className="shrink-0" />
                   <span className="hidden sm:inline">上传实物</span>
                 </button>
               )}
             </div>
          </div>

        <div className={cn(
            "flex flex-row gap-2 items-center w-full transition-all",
            canUpload ? "mb-6 md:mb-10" : "mb-6 sm:mb-10"
        )}>
              <div className="h-10 sm:h-11 px-3 sm:px-5 rounded-full bg-white dark:bg-white/5 border border-border dark:border-white/10 flex items-center gap-2 sm:gap-3 focus-within:ring-2 focus-within:ring-primary/20 transition-all dark:hover:bg-white/10 flex-1 relative">
                <Search size={16} className="text-muted-foreground shrink-0 sm:w-[18px] sm:h-[18px]" />
                <input 
                    type="text" 
                    placeholder="搜索商品名..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="bg-transparent border-none outline-none w-full text-foreground placeholder:text-muted-foreground text-sm h-full pr-8"
                />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery("")}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10 p-1 rounded-full transition-colors"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              <div className="shrink-0 w-28 sm:w-40 h-10 sm:h-11">
                   <CustomSelect 
                        value={selectedCategory === "All" ? "all" : selectedCategory}
                        onChange={(val) => setSelectedCategory(val === "all" ? "All" : val)}
                        options={[
                            { value: 'all', label: '全部' },
                            ...categories.map(c => ({ value: c.name, label: c.name }))
                        ]}
                        className="h-full"
                        triggerClassName="h-full rounded-full bg-white dark:bg-white/5 border border-border dark:border-white/10 text-xs sm:text-sm py-0 px-2 sm:px-5 transition-all hover:bg-white/5 truncate"
                    />
              </div>
          </div>

        {/* Responsive Grid / Waterfall */}
        <div className="w-full grid gap-3 sm:gap-6 grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
           <AnimatePresence>
               {groupedProducts.map((group) => {
                    // Use product.image as cover URL directly (it may not be a gallery item)
                    // then fall back to the first non-video item, then to any first item
                    const fallbackItem =
                      group.items.find(item => item.type !== 'video' && !/\.(mp4|mov|webm)$/i.test(item.url)) ||
                      group.items[0];
                    const coverUrl = group.product.image || fallbackItem?.url || '';
                    const isVideoCover = !group.product.image && (
                      fallbackItem?.type === 'video' || /\.(mp4|mov|webm)$/i.test(fallbackItem?.url || '')
                    );

                    return (
                    <div
                        key={group.product.id}
                        className="break-inside-avoid mb-3 sm:mb-6"
                    >
                        <div 
                            className="group relative rounded-2xl sm:rounded-3xl overflow-hidden bg-white dark:bg-gray-900/70 border border-border dark:border-white/10 hover:border-primary/50 transition-all duration-500 hover:shadow-2xl hover:shadow-primary/5 flex flex-col h-full cursor-pointer"
                            onClick={() => handleOpenProductPreview(group)}
                        >
                            <div className="relative aspect-square sm:aspect-4/3 overflow-hidden bg-muted">
                                {isVideoCover ? (
                                    <video 
                                        src={coverUrl} 
                                        className="w-full h-full object-cover pointer-events-none"
                                        muted
                                        loop
                                        playsInline
                                        // Optional: autoPlay if you want motion on hover, but static is safer for perf
                                        onMouseOver={e => e.currentTarget.play()}
                                        onMouseOut={e => {
                                            e.currentTarget.pause();
                                            e.currentTarget.currentTime = 0;
                                        }}
                                    />
                                ) : (
                                    <>
                                        <div className="absolute inset-0 bg-muted animate-pulse" />
                                        <Image 
                                            src={coverUrl} 
                                            alt={group.product.name} 
                                            fill 
                                            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                                            className="object-cover transition-all duration-700 opacity-0 group-hover:scale-105" 
                                            onLoadingComplete={(img) => {
                                                img.classList.remove('opacity-0');
                                                img.classList.add('opacity-100');
                                                // Find the closest sibling with animate-pulse and hide it
                                                const skeleton = img.parentElement?.querySelector('.animate-pulse');
                                                if (skeleton) {
                                                    (skeleton as HTMLElement).style.display = 'none';
                                                }
                                            }}
                                        />
                                    </>
                                )}
                                
                                {/* Removed SKU badge from card top right */}

                                <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/95 via-black/40 to-transparent opacity-100 transition-opacity duration-500 flex flex-col justify-end p-2.5 sm:p-5 pt-12 sm:pt-16">
                                    <div className="flex flex-col gap-0.5 sm:gap-1">
                                        <p className="text-white font-bold text-[11px] sm:text-xs line-clamp-2 leading-relaxed" style={{ fontFamily: 'ui-rounded, "SF Pro Rounded", "PingFang SC", "Hiragino Maru Gothic ProN", sans-serif' }}>{group.product.name}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )})
              }
           </AnimatePresence>
        </div>

        {/* Infinite Scroll Anchor */}
        <div id="gallery-scroll-anchor" className="h-[2px] w-full" />

        {/* Next Page Loading State */}
        {isNextPageLoading && (
            <div className="py-8 w-full flex justify-center">
                <div className="flex space-x-2">
                    <div className="w-2.5 h-2.5 bg-primary/40 rounded-full animate-bounce" />
                    <div className="w-2.5 h-2.5 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }} />
                    <div className="w-2.5 h-2.5 bg-primary/80 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }} />
                </div>
            </div>
        )}

        {/* Load Complete State */}
        {!hasMore && !isLoading && !isNextPageLoading && items.length > 0 && (
            <div className="py-12 w-full flex flex-col items-center justify-center animate-in fade-in duration-1000">
                <div className="h-px w-12 bg-linear-to-r from-transparent via-border to-transparent mb-4" />
                <p className="text-xs sm:text-sm text-muted-foreground/50 font-medium tracking-widest uppercase italic">
                    —— 已显示全部内容 ——
                </p>
            </div>
        )}

        {/* Skeleton Grid for Initial Loading */}
        {isLoading && (
            <div className="w-full grid gap-3 sm:gap-6 grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {[...Array(8)].map((_, i) => (
                    <div key={i} className="rounded-2xl sm:rounded-3xl overflow-hidden border border-border/50 bg-white dark:bg-zinc-900/50 flex flex-col h-full animate-pulse">
                        <div className="aspect-4/5 sm:aspect-square bg-muted relative overflow-hidden">
                             <div className="absolute inset-0 bg-linear-to-r from-transparent via-white/10 to-transparent skew-x-12 -translate-x-full animate-[shimmer_2s_infinite]" />
                        </div>
                        <div className="p-4 space-y-3">
                            <div className="h-4 bg-muted rounded-md w-3/4" />
                            <div className="h-3 bg-muted rounded-md w-1/2" />
                            <div className="flex justify-between items-center pt-2">
                                <div className="h-5 bg-muted rounded-full w-20" />
                                <div className="h-5 bg-muted rounded-full w-12" />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        )}

        {/* Enhanced Empty State */}
        {!isLoading && filteredItems.length === 0 && (
            <div className="py-24 sm:py-32 flex flex-col items-center justify-center text-center space-y-8 animate-in fade-in zoom-in-95 duration-500">
                <div className="relative">
                    <div className="h-28 w-28 rounded-full bg-primary/5 flex items-center justify-center text-primary/20 dark:text-primary/10">
                        <Camera size={56} strokeWidth={1.5} />
                    </div>
                    <div className="absolute -bottom-2 -right-2 h-10 w-10 rounded-full bg-background border border-border flex items-center justify-center text-muted-foreground shadow-sm">
                        <Search size={20} />
                    </div>
                </div>
                <div className="space-y-3 max-w-xs mx-auto">
                    <h3 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">找不到对应的实拍</h3>
                    <p className="text-muted-foreground text-sm leading-relaxed">
                        没有找到与 {searchQuery ? `"${searchQuery}"` : "当前筛选"} 匹配的内容。您可以尝试清理过滤条件再次搜索。
                    </p>
                </div>
                
                {(searchQuery || selectedCategory !== "All") && (
                    <button 
                        onClick={() => {
                            setSearchQuery("");
                            setSelectedCategory("All");
                        }}
                        className="px-6 py-2.5 rounded-full bg-secondary hover:bg-secondary/80 text-secondary-foreground text-sm font-bold transition-all flex items-center gap-2 group border border-border/50"
                    >
                        <RefreshCcw size={16} className="group-hover:rotate-180 transition-transform duration-500" />
                        清除所有筛选
                    </button>
                )}
            </div>
        )}

        {/* Upload Modal */}
        {mounted && createPortal(
            <AnimatePresence>
                {isUploadModalOpen && (
                    <div className="fixed inset-0 z-50000 flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
                            onClick={() => setIsUploadModalOpen(false)}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="relative z-10 w-full max-w-lg rounded-3xl bg-white dark:bg-gray-900/70 backdrop-blur-xl border border-border/50 shadow-2xl overflow-hidden flex flex-col"
                        >
                            <div className="flex items-center justify-between border-b border-white/10 p-8 shrink-0">
                                <h2 className="text-xl font-bold text-foreground">上传实拍内容</h2>
                                <button onClick={() => setIsUploadModalOpen(false)} className="rounded-full p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                                    <X size={20} />
                                </button>
                            </div>



                            <form onSubmit={handleUploadSubmit} className="p-6 space-y-5 flex-1 overflow-y-auto">
                                {/* Upload Box */}
                                    <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                            <Camera size={16} className="text-black dark:text-white" /> 选择文件 ({uploadForm.urls.length})
                                        </label>
                                        
                                        {uploadForm.urls.length > 0 && (
                                            <div className="flex items-center gap-2">
                                                {/* Select All / Deselect All */}
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        if (selectedDeleteIndices.length === uploadForm.urls.length) {
                                                            setSelectedDeleteIndices([]); // Deselect All
                                                        } else {
                                                            setSelectedDeleteIndices(uploadForm.urls.map((_, i) => i)); // Select All
                                                        }
                                                    }}
                                                    className="text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                                                >
                                                    {selectedDeleteIndices.length === uploadForm.urls.length ? "取消全选" : "全选"}
                                                </button>
                                                
                                                <div className="w-px h-3 bg-border" />

                                                {selectedDeleteIndices.length > 0 ? (
                                                    <button 
                                                        type="button" 
                                                        onClick={() => {
                                                            setUploadForm(prev => ({
                                                                ...prev,
                                                                urls: prev.urls.filter((_, i) => !selectedDeleteIndices.includes(i))
                                                            }));
                                                            setSelectedDeleteIndices([]);
                                                        }}
                                                        className="text-xs font-medium text-destructive hover:text-destructive/80 transition-colors flex items-center gap-1"
                                                    >
                                                        <Trash2 size={12} />
                                                        删除已选 ({selectedDeleteIndices.length})
                                                    </button>
                                                ) : (
                                                    <button 
                                                        type="button" 
                                                        onClick={() => setUploadForm(prev => ({ ...prev, urls: [] }))}
                                                        className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                                                    >
                                                        <Trash2 size={12} />
                                                        清空
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    
                                    <div className="grid grid-cols-3 gap-3">
                                        {/* Existing Images */}
                                        {uploadForm.urls.map((file, idx) => {
                                            const isSelected = selectedDeleteIndices.includes(idx);
                                            return (
                                            <div 
                                                key={idx} 
                                                onClick={() => {
                                                    setSelectedDeleteIndices(prev => 
                                                        prev.includes(idx) 
                                                            ? prev.filter(i => i !== idx)
                                                            : [...prev, idx]
                                                    );
                                                }}
                                                className={cn(
                                                    "relative aspect-square rounded-2xl overflow-hidden border transition-all cursor-pointer",
                                                    isSelected ? "ring-4 ring-primary ring-offset-2 dark:ring-offset-gray-900 border-primary scale-[0.98]" : "border-border hover:border-primary/50"
                                                )}
                                            >
                                                {file.type === 'video' ? (
                                                     <video 
                                                        src={file.url} 
                                                        className="w-full h-full object-cover pointer-events-none"
                                                        muted
                                                    />
                                                ) : (
                                                    <Image 
                                                      src={file.url} 
                                                      alt="Upload preview"
                                                      fill 
                                                      sizes="(max-width: 640px) 33vw, 150px"
                                                      className="object-cover pointer-events-none" 
                                                    />
                                                )}
                                                
                                                {/* Selection Checkbox */}
                                                <div className={cn(
                                                    "absolute top-2 right-2 z-20 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all shadow-xl",
                                                    isSelected 
                                                        ? "bg-primary border-primary text-white" 
                                                        : "bg-black/30 border-white/50 backdrop-blur-sm hover:border-white"
                                                )}>
                                                    {isSelected && <CheckCircle size={14} strokeWidth={3} className="drop-shadow-sm" />}
                                                </div>

                                                <div className={cn(
                                                    "absolute inset-0 bg-black/0 transition-colors z-10",
                                                    isSelected ? "bg-black/20" : "group-hover:bg-black/10"
                                                )} />
                                            </div>
                                        )})}

                                        {/* Add Button */}
                                        <label className="relative aspect-square rounded-xl border-2 border-dashed border-border hover:border-primary/40 hover:bg-primary/5 transition-all flex flex-col items-center justify-center gap-2 cursor-pointer overflow-hidden group">
                                            <input type="file" className="hidden" accept="image/*,video/*" multiple onChange={handleFileUpload} />
                                            <div className="p-2 rounded-full bg-muted group-hover:bg-primary/10 transition-colors">
                                                {isUploading ? (
                                                    <div className="h-6 w-6 animate-spin border-2 border-primary border-t-transparent rounded-full" />
                                                ) : (
                                                    <Plus size={24} className="text-muted-foreground group-hover:text-primary transition-all" />
                                                )}
                                            </div>
                                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest text-center px-2">
                                                {isUploading ? "上传中" : "添加"}
                                            </span>
                                        </label>
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-2">支持多选，每次最多上传 9 个文件。</p>
                                </div>

                                {/* Product Select / Submission Info */}
                                <div className="space-y-4">
                                    {isAdmin ? (
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                                <Package size={16} /> 关联商品
                                            </label>
                                            <div 
                                                onClick={() => setIsProductSelectOpen(true)}
                                                className="w-full px-4 py-3 rounded-xl bg-muted/50 border border-border transition-colors flex items-center justify-between group cursor-pointer hover:bg-muted mb-2"
                                            >
                                                <div className="flex items-center gap-3 min-w-0">
                                                    {uploadForm.productId ? (() => {
                                                        const p = products.find(p => p.id === uploadForm.productId);
                                                        if (!p) return null;
                                                        return (
                                                            <div className="h-10 w-10 rounded-lg overflow-hidden bg-background border border-border/50 shrink-0 flex items-center justify-center">
                                                                {p.image ? (
                                                                    /* eslint-disable-next-line @next/next/no-img-element */
                                                                    <img src={p.image as string} alt={p.name} className="h-full w-full object-cover" />
                                                                ) : (
                                                                    <Package size={18} className="text-muted-foreground/50" />
                                                                )}
                                                            </div>
                                                        );
                                                    })() : (
                                                        <div className="h-10 w-10 rounded-lg bg-background/50 border border-border/50 shrink-0 flex items-center justify-center border-dashed">
                                                            <Package size={18} className="text-muted-foreground/30" />
                                                        </div>
                                                    )}
                                                    
                                                    <div className="flex flex-col">
                                                        <span className={cn("text-sm", !uploadForm.productId ? "text-muted-foreground" : "text-foreground")}>
                                                            {uploadForm.productId 
                                                                ? products.find(p => p.id === uploadForm.productId)?.name || "未知商品"
                                                                : "点击选择关联商品..."
                                                            }
                                                        </span>
                                                        {uploadForm.productId && (() => {
                                                            const p = products.find(p => p.id === uploadForm.productId);
                                                            return p && (
                                                                <span className="text-xs text-muted-foreground font-mono opacity-70">
                                                                    {p.sku}
                                                                </span>
                                                            );
                                                        })()}
                                                    </div>
                                                </div>
                                                <ChevronRight size={16} className="text-muted-foreground group-hover:translate-x-1 transition-transform shrink-0 ml-2" />
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            {uploadForm.productId ? (
                                                <div className="p-4 rounded-2xl bg-primary/10 border border-primary/20 flex items-center gap-3 mb-4">
                                                    <div className="h-10 w-10 rounded-lg overflow-hidden shrink-0 border border-black/10">
                                                        {products.find(p => p.id === uploadForm.productId)?.image ? (
                                                            /* eslint-disable-next-line @next/next/no-img-element */
                                                            <img 
                                                                src={products.find(p => p.id === uploadForm.productId)?.image || ''} 
                                                                alt="Product" 
                                                                className="w-full h-full object-cover"
                                                            />
                                                        ) : (
                                                            <div className="w-full h-full bg-white flex items-center justify-center">
                                                                <Package size={20} className="text-black/20" />
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div>
                                                        <p className="text-xs text-primary uppercase tracking-wider mb-0.5">关联商品</p>
                                                        <p className="text-foreground text-sm">
                                                            {products.find(p => p.id === uploadForm.productId)?.name}
                                                        </p>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="space-y-4">
                                            <div className="p-4 rounded-2xl bg-primary/5 border border-primary/10 flex items-start gap-3">
                                                <Info size={18} className="text-primary shrink-0 mt-0.5" />
                                                <div className="space-y-1">
                                                    <p className="text-sm text-primary">实拍审核说明</p>
                                                    <p className="text-xs text-muted-foreground leading-relaxed">请提供商品货号或名称，管理员将在审核后将照片关联至对应商品。实拍内容不会立即显示在相册中。</p>
                                                </div>
                                            </div>
                                            
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-2">
                                                    <label className="text-xs text-muted-foreground uppercase tracking-wider">货号 (SKU)</label>
                                                    <input 
                                                        type="text" 
                                                        placeholder="例如: B03"
                                                        value={uploadForm.tags.split(",")[0] || ""}
                                                        onChange={(e) => {
                                                            const parts = uploadForm.tags.split(",");
                                                            parts[0] = e.target.value;
                                                            setUploadForm(prev => ({ ...prev, tags: parts.join(",") }));
                                                        }}
                                                        className="w-full px-4 py-2.5 rounded-xl bg-muted/50 border border-border focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm"
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-xs text-muted-foreground uppercase tracking-wider">商品名称</label>
                                                    <input 
                                                        type="text" 
                                                        placeholder="例如: 赛车游戏机"
                                                        value={uploadForm.tags.split(",")[1] || ""}
                                                        onChange={(e) => {
                                                            const parts = uploadForm.tags.split(",");
                                                            parts[1] = e.target.value;
                                                            setUploadForm(prev => ({ ...prev, tags: parts.join(",") }));
                                                        }}
                                                        className="w-full px-4 py-2.5 rounded-xl bg-muted/50 border border-border focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Download button removed redundancy */}
                                </div>
                            )}
                                </div>

                                <div className="flex justify-end gap-3 pt-4 border-t border-border/50">
                                    <button type="button" onClick={() => setIsUploadModalOpen(false)} className="px-6 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground">取消</button>
                                    <button 
                                        type="submit" 
                                        disabled={uploadForm.urls.length === 0 || (isAdmin && !uploadForm.productId) || (!isAdmin && !uploadForm.productId && !uploadForm.tags.split(",")[0] && !uploadForm.tags.split(",")[1]) || !!isUploading}
                                        className="flex items-center gap-2 rounded-xl bg-primary px-8 py-2.5 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-all"
                                    >
                                        <CheckCircle size={18} />
                                        {isAdmin ? "确认发布" : "提交审核"} ({uploadForm.urls.length})
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>,
            document.body
        )}

        {/* Product Selection Modal */}
        {mounted && (
            <ProductSelectionModal 
                isOpen={isProductSelectOpen}
                onClose={() => setIsProductSelectOpen(false)}
                singleSelect={true}

                showPrice={false}
                selectedIds={uploadForm.productId ? [uploadForm.productId] : []}
                onSelect={(products) => {
                    if (products.length > 0) {
                        setUploadForm(prev => ({ ...prev, productId: products[0].id }));
                    }
                }}
            />
        )}

        {/* Image Viewer Modal */}
        {mounted && createPortal(
            <AnimatePresence>
                {selectedImage && (
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.25, ease: "easeInOut" }}
                            className="fixed inset-0 z-12000 bg-black overflow-hidden touch-none pointer-events-auto flex flex-col"
                        >
                            {/* Layer 0: Ambient Background */}
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={`blur-${selectedImage?.id || 'none'}`}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 0.3 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.8 }}
                                    className="absolute inset-0 -z-20 pointer-events-none"
                                >
                                    {selectedImage && (selectedImage.type !== 'video' && !/\.(mp4|webm|ogg|mov)$/i.test(selectedImage.url)) && (
                                        <Image 
                                            src={selectedImage.url} 
                                            alt="" 
                                            fill
                                            className="object-cover blur-[120px] scale-125"
                                        />
                                    )}
                                    <div className="absolute inset-0 bg-black/40" />
                                </motion.div>
                            </AnimatePresence>

                            {/* Background Overlay - Click to Close */}
                            <div 
                                className="absolute inset-0 -z-10" 
                                onClick={() => setSelectedImage(null)} 
                            />

                            {/* Top Bar Overlay */}
                            <motion.div 
                                style={{ 
                                    opacity: uiOpacity, 
                                    y: uiYOffset,
                                    pointerEvents: isZoomed ? 'none' : 'auto'
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
                                        title="显示商品详情"
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
                                                className="absolute top-16 md:top-[68px] left-4 right-4 md:left-6 md:right-auto z-50 bg-black/80 backdrop-blur-xl px-4 py-3 rounded-xl border border-white/10 shadow-2xl flex flex-col gap-2 max-w-full md:max-w-md pointer-events-auto"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <div className="flex flex-col gap-1 font-rounded">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[10px] text-white/70 uppercase tracking-[0.2em] font-black shrink-0">商品信息</span>
                                                        {selectedImage!.product?.sku && (
                                                            <span className="inline-flex items-center justify-center bg-white/10 px-2 py-0.5 rounded-full border border-white/10 text-[10px] font-bold leading-none text-white/90">
                                                                {selectedImage!.product?.sku}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <h3 className="text-white font-bold text-sm md:text-xl leading-snug tracking-tight">
                                                        {selectedImage!.product?.name}
                                                    </h3>
                                                </div>
                                                
                                                {/* Specifications */}
                                                {selectedImage!.product?.specs && Object.keys(selectedImage!.product!.specs as object).length > 0 && (
                                                    <div className="mt-10 space-y-5 font-rounded">
                                                        <div className="flex items-center">
                                                            <span className="text-[10px] text-white/70 uppercase tracking-[0.3em] font-black">商品参数</span>
                                                        </div>
                                                        <div className="grid grid-cols-2 gap-3">
                                                            {Object.entries(selectedImage!.product!.specs as Record<string, string>).map(([key, value], index) => {
                                                                const isLongValue = String(value).length > 20;
                                                                return (
                                                                    <div 
                                                                        key={index} 
                                                                        className={cn(
                                                                            "group/item relative bg-white/4 hover:bg-white/8 border-white/6 hover:border-white/12 p-4 rounded-2xl transition-all duration-300",
                                                                            isLongValue ? "col-span-2" : "col-span-1"
                                                                        )}
                                                                    >
                                                                        <div className="flex flex-col gap-1.5">
                                                                            <span className="text-[10px] text-white/60 font-bold uppercase tracking-widest">{key}</span>
                                                                            <div className="text-white text-sm font-bold tracking-tight group-hover/item:text-primary transition-colors whitespace-pre-wrap wrap-break-word leading-relaxed">
                                                                                {value as React.ReactNode}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                )}
                                            </motion.div>
                                        </>
                                    )}
                                </AnimatePresence>

                                <div className="flex items-center gap-2 pointer-events-auto">
                                    {(isUploadAllowed || isAdmin) && canUpload && (
                                        <button 
                                            onClick={() => {
                                                const product = selectedImage?.product;
                                                setUploadForm({ 
                                                    productId: product?.id || "", 
                                                    urls: [], 
                                                    tags: "" 
                                                });
                                                setIsUploadModalOpen(true);
                                            }}
                                            className="flex h-10 w-10 items-center justify-center rounded-xl bg-black/60 text-white hover:bg-white hover:text-black transition-all border border-white/10 backdrop-blur-2xl group shadow-xl"
                                            title="为此商品上传新实拍"
                                        >
                                            <Plus size={20} strokeWidth={2.5} />
                                        </button>
                                    )}
                                    <button 
                                        onClick={() => {
                                            const url = new URL(selectedImage.url, window.location.origin).href;
                                            navigator.clipboard.writeText(url).then(() => {
                                                showToast("链接已复制", "success");
                                            }).catch(() => {
                                                showToast("复制失败", "error");
                                            });
                                        }}
                                        className="flex h-10 w-10 items-center justify-center rounded-xl bg-black/60 text-white hover:bg-white hover:text-black transition-all border border-white/10 backdrop-blur-2xl shadow-xl"
                                        title="复制媒体链接"
                                    >
                                        <Link2 size={18} />
                                    </button>
                                    <button 
                                        onClick={() => {
                                            const product = selectedImage.product;
                                            const timestamp = new Date().getTime();
                                            const isVideo = selectedImage.type === 'video' || /\.(mp4|webm|ogg|mov)$/i.test(selectedImage.url);
                                            const ext = isVideo ? 'mp4' : 'jpg';
                                            const fileName = `${product?.sku || 'MEDIA'}_${timestamp}.${ext}`;
                                            handleDownload(selectedImage.url, fileName);
                                        }}
                                        className="flex h-10 w-10 items-center justify-center rounded-xl bg-black/60 text-white hover:bg-white hover:text-black transition-all border border-white/10 backdrop-blur-2xl group shadow-xl"
                                        title="下载原始文件"
                                    >
                                        <Download size={18} className="group-hover:translate-y-0.5 transition-transform" />
                                    </button>
                                    <button 
                                        onClick={() => setSelectedImage(null)}
                                        className="h-10 w-10 rounded-xl flex items-center justify-center bg-black/60 text-white hover:bg-destructive hover:text-white transition-all border border-white/20 backdrop-blur-2xl group shadow-xl"
                                    >
                                        <X size={20} className="group-hover:rotate-90 transition-transform duration-300" />
                                    </button>
                                </div>
                            </motion.div>

                            {/* Main Interaction Area */}
                            <div className="absolute inset-0 z-20 flex items-center justify-center overflow-hidden">
                                {relatedImages.length > 1 && (
                                    <motion.div
                                        style={{ 
                                            opacity: uiOpacity,
                                            pointerEvents: isZoomed ? 'none' : 'auto'
                                        }}
                                        className="contents"
                                    >
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); navigate(-1); }}
                                            className="hidden md:flex absolute left-4 md:left-8 z-55 rounded-full p-4 md:p-6 bg-white/5 text-white hover:bg-primary transition-all border border-white/10 group/btn backdrop-blur-md pointer-events-auto focus:outline-hidden"
                                        >
                                            <ChevronRight size={32} className="rotate-180 group-hover/btn:-translate-x-1 transition-transform" />
                                        </button>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); navigate(1); }}
                                            className="hidden md:flex absolute right-4 md:right-8 z-55 rounded-full p-4 md:p-6 bg-white/5 text-white hover:bg-primary transition-all border border-white/10 group/btn backdrop-blur-md pointer-events-auto focus:outline-hidden"
                                        >
                                            <ChevronRight size={32} className="group-hover/btn:translate-x-1 transition-transform" />
                                        </button>
                                    </motion.div>
                                )}

                                <AnimatePresence initial={false} custom={previewDirection}>
                                    <LightboxMediaItem 
                                        key={selectedImage!.id}
                                        item={selectedImage!}
                                        direction={previewDirection}
                                        onNavigate={navigate}
                                        onScaleChange={(v) => activeScale.set(v)}
                                        totalItems={relatedImages.length}
                                    />
                                </AnimatePresence>
                            </div>

                        {/* Bottom Bar Overlay (Minimalist Float) */}
                        <div className="absolute bottom-4 left-0 right-0 flex justify-center z-55 pointer-events-none px-4">
                            <motion.div 
                                style={{ 
                                    opacity: uiOpacity, 
                                    y: bottomUiYOffset,
                                    pointerEvents: isZoomed ? 'none' : 'auto'
                                }}
                                className="bg-black/40 hover:bg-black/80 transition-colors backdrop-blur-xl px-4 py-3 rounded-2xl border border-white/10 shadow-2xl flex flex-col gap-2 pointer-events-auto items-center max-w-[95vw]"
                            >
                                <div className="flex gap-2.5 overflow-x-auto scrollbar-hide items-end justify-start max-w-full py-2 px-4">
                                {relatedImages.map((img, idx) => {
                                    const isSelected = img.id === selectedImage!.id;
                                    return (
                                        <div key={img.id} className="flex flex-col items-center gap-2 shrink-0">
                                            <motion.div 
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ delay: idx * 0.05 }}
                                                onClick={() => {
                                                    if (!isSelected) {
                                                        setPreviewDirection(idx > currentIndex ? 1 : -1);
                                                        setSelectedImage(img);
                                                    }
                                                }}
                                                className={cn(
                                                    "relative h-12 w-12 md:h-14 md:w-14 rounded-lg overflow-hidden cursor-pointer transition-all duration-300 border shrink-0 group",
                                                    isSelected 
                                                    ? "border-primary scale-110 shadow-[0_0_20px_rgba(var(--primary-rgb),0.4)] z-10 brightness-100 ring-2 ring-primary/30" 
                                                    : "border-white/10 brightness-50 opacity-40 hover:opacity-100 hover:brightness-100 hover:border-white/20"
                                                )}
                                            >
                                                {img.type === 'video' || /\.(mp4|webm|ogg|mov)$/i.test(img.url) ? (
                                                    <div className="w-full h-full bg-black flex items-center justify-center">
                                                        <video src={img.url} className="w-full h-full object-cover" />
                                                        <div className="absolute inset-0 bg-black/10 transition-colors" />
                                                        <PlayCircle size={20} className="absolute text-white/80" />
                                                    </div>
                                                ) : (
                                                    <Image 
                                                        src={img.url} 
                                                        alt="Thumbnail" 
                                                        fill
                                                        sizes="60px"
                                                        className="object-cover" 
                                                    />
                                                )}
                                            </motion.div>
                                            
                                            {/* Selection Indicator Strip */}
                                            <div className="h-1 w-8 relative">
                                                {isSelected && (
                                                    <motion.div 
                                                        layoutId="thumbnail-indicator"
                                                        initial={false}
                                                        transition={{ 
                                                            type: "spring", 
                                                            stiffness: 500, 
                                                            damping: 30 
                                                        }}
                                                        className="absolute inset-0 bg-primary rounded-full shadow-[0_0_10px_rgba(var(--primary-rgb),0.8)]"
                                                    />
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                                </div>
                            </motion.div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>,
            document.body
        )}

    {isAdmin && (
      <>
        <ConfirmModal 
            isOpen={confirmConfig.isOpen}
            onClose={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
            onConfirm={confirmConfig.onConfirm}
            message={confirmConfig.message}
            title={confirmConfig.title}
            confirmLabel="确认删除"
            variant="danger"
            className="z-31000"
        />

        <ActionBar 
            selectedCount={selectedIds.length}
            totalCount={filteredItems.length}
            onToggleSelectAll={() => {
                if (selectedIds.length === filteredItems.length) {
                    setSelectedIds([]);
                } else {
                    setSelectedIds(filteredItems.map(i => i.id));
                }
            }}
            onClear={() => setSelectedIds([])}
            label="个项目"
            onDelete={canDelete ? handleBatchDelete : undefined}
        />
      </>
    )}

    {/* Back to Top Button */}
    {typeof document !== "undefined" && createPortal(
      <AnimatePresence>
        {showBackToTop && (
          <motion.button
            initial={{ opacity: 0, scale: 0.5, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.5, y: 20 }}
            onClick={() => {
                window.scrollTo({ top: 0, behavior: "smooth" });
                document.documentElement.scrollTo({ top: 0, behavior: "smooth" });
                document.body.scrollTo({ top: 0, behavior: "smooth" });
            }}
            className="fixed bottom-24 sm:bottom-12 right-6 sm:right-12 z-9999 p-3 sm:p-4 rounded-full bg-white dark:bg-zinc-800 border border-black/10 dark:border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.3)] backdrop-blur-xl text-foreground hover:scale-110 active:scale-95 transition-all group"
          >
            <ArrowUp size={24} className="group-hover:-translate-y-1 transition-transform" />
          </motion.button>
        )}
      </AnimatePresence>,
      document.body
    )}

    </div>
  );
}

export default function GalleryPage() {
  return (
    <Suspense fallback={
        <div className="flex items-center justify-center h-[50vh] text-muted-foreground">
            正在加载相册...
        </div>
    }>
        <GalleryContent />
    </Suspense>
  );
}
