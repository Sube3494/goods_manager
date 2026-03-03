"use client";

import { useState, useEffect, Suspense, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, useMotionValue } from "framer-motion";
import { uploadFileWithChunking } from "@/lib/uploadWithChunking";
import { Camera, ChevronRight, X, Check, Download, Plus, CheckCircle, Package, Search, PlayCircle, Play, Info, ArrowUp, Trash2, RefreshCcw, Link2, RotateCcw, ExternalLink, Volume2, VolumeX, Maximize } from "lucide-react";

import { ProductSelectionModal } from "@/components/Purchases/ProductSelectionModal";

import { ActionBar } from "@/components/ui/ActionBar";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { useToast } from "@/components/ui/Toast";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { GestureImage } from "@/components/ui/GestureImage";
import { useUser } from "@/hooks/useUser";
import { hasPermission } from "@/lib/permissions";
import { Product, GalleryItem, Category } from "@/lib/types";
import { SessionUser } from "@/lib/permissions";
import { useCallback } from "react";
import md5 from "blueimp-md5";


interface LightboxMediaItemProps {
    item: GalleryItem;
    onScaleChange: (scale: number) => void;
    isVisible?: boolean;
}

const LightboxMediaItem = ({ item, onScaleChange, isVisible = true }: LightboxMediaItemProps) => {
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
        <motion.div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
        >
                <div className="w-full h-full flex flex-col items-center justify-center p-4 pb-28 md:p-8 md:pb-36 pointer-events-auto overflow-hidden">
                    {isVideo ? (
                        <div className="flex flex-col items-center justify-center w-full h-full max-w-6xl mx-auto gap-2 relative">
                            {/* Video Container - Compact sizing */}
                            <div className="relative flex items-center justify-center w-full min-h-0 bg-transparent rounded-xl overflow-hidden shadow-2xl shrink-0">
                                <video 
                                    ref={videoRef}
                                    src={item.url} 
                                    className="max-w-full max-h-[calc(100vh-320px)] w-auto h-auto object-contain cursor-pointer"
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
                                                <Play size={80} fill="currentColor" strokeWidth={0} />
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
                                className="max-w-full max-h-[calc(100vh-320px)] object-contain"
                            />
                        </div>
                    )}
                </div>
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
  const thumbnailContainerRef = useRef<HTMLDivElement>(null);
  const scrollAnchorRef = useRef<HTMLDivElement>(null);

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
  const [hoveredDev, setHoveredDev] = useState(false);

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
  
  // 基础权限检查，不再用于隐藏按钮，仅用于业务逻辑拦截

  // 统一权限拦截与游客引导逻辑
  const checkAction = useCallback((permissionKey: "gallery:upload" | "gallery:download" | "gallery:share" | "gallery:copy", action: () => void) => {
    if (!user) {
      // 游客身份：引导登录
      setConfirmConfig({
        isOpen: true,
        title: "登录后使用",
        message: "您当前为游客身份，登录后即可使用下载、分享、复制链接及上传等完整功能。",
        onConfirm: () => {
          window.location.href = `/login?callbackUrl=${encodeURIComponent(window.location.pathname)}`;
        },
      });
      return;
    }

    // 已登录：检查具体权限
    const hasPerm = hasPermission(user as SessionUser | null, permissionKey);

    // 系统已关闭上传功能
    if (permissionKey === "gallery:upload" && !isUploadAllowed) {
        showToast("当前系统已关闭上传权限", "error");
        return;
    }
    
    if (hasPerm) {
      action();
    } else {
      showToast("您的账号暂无此功能操作权限", "error");
    }
  }, [user, isUploadAllowed, showToast]);
  
  // Lightbox Enhancements
  const activeScale = useMotionValue(1);
  
  // UI 自动隐藏逻辑
  const [isUIVisible, setIsUIVisible] = useState(true);
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleInteraction = useCallback((e?: React.MouseEvent | React.TouchEvent) => {
    // 处理点击切换
    if (e?.type === 'click') {
        const target = e.target as HTMLElement;
        // 如果点击的是非按钮、非控制条的可选区域（即空白背景区域）
        if (!target.closest('button, .pointer-events-auto')) {
            setIsUIVisible(prev => !prev);
        } else {
            setIsUIVisible(true);
        }
    } else {
        // 鼠标移动或触摸，显示 UI
        setIsUIVisible(true);
    }

    // 移除自动隐藏逻辑，以满足用户“常显”以及不希望被突然隐藏干扰的需求
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
  }, []);

  useEffect(() => {
    const currentTimer = idleTimerRef.current;
    if (selectedImage) {
        handleInteraction();
    } else {
        setIsUIVisible(true);
        if (currentTimer) clearTimeout(currentTimer);
    }
    return () => { if (currentTimer) clearTimeout(currentTimer); };
  }, [selectedImage, handleInteraction]);

  const [showInfo, setShowInfo] = useState(false);

  // Auto-scroll selected thumbnail into view
  useEffect(() => {
    if (selectedImage && thumbnailContainerRef.current) {
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
  }, [selectedImage]);

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

  const hasActiveFilters = searchQuery.trim() !== "" || selectedCategory !== "All";

  const resetFilters = useCallback(() => {
    setSearchQuery("");
    setSelectedCategory("All");
  }, []);

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

  // Infinite Scroll Observer (Main Page)
  useEffect(() => {
    if (!hasMore || isLoading || isNextPageLoading) return;
    const target = scrollAnchorRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          fetchData(false);
        }
      },
      { rootMargin: "200px" } // Load a bit before reaching bottom
    );

    observer.observe(target);

    return () => observer.disconnect();
  }, [fetchData, hasMore, isLoading, isNextPageLoading]);


  useEffect(() => {
    if (selectedImage || isUploadModalOpen) {
      document.body.style.overflow = 'hidden';
      document.body.style.overscrollBehavior = 'none';
    } else {
      document.body.style.overflow = 'unset';
      document.body.style.overscrollBehavior = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
      document.body.style.overscrollBehavior = 'unset';
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

      for (let index = 0; index < filesToUpload.length; index++) {
        const file = filesToUpload[index];
        const uploadTask = async () => {
          try {
            const data = await uploadFileWithChunking(file, "gallery", (pct) => {
              setIsUploading(`文件 ${index + 1}/${filesToUpload.length} : ${pct}%`);
            });
            
            results.push({ status: 'fulfilled', value: data as { url: string; type: 'image'|'video' } });
          } catch (err) {
            results.push({ status: 'rejected', reason: err });
          } finally {
            completedCount++;
            setIsUploading(`已完成 ${completedCount}/${filesToUpload.length}`);
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
      console.error("Gallery submit failed:", error);
      showToast("发布失败", "error");
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
      message: `确定要删除选中中的 ${count} 个实拍项吗？此操作不可恢复。`,
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
      // 优先按 sortOrder 升序 (Priority: sortOrder ASC)
      if (a.sortOrder !== b.sortOrder) {
          return (a.sortOrder || 0) - (b.sortOrder || 0);
      }
      // 其次按 createdAt 降序 (Secondary: createdAt DESC)
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
  }) : [];
  const currentIndex = relatedImages.findIndex(img => img.id === selectedImage?.id);

  const navigate = (dir: number) => {
    if (!selectedImage) return;
    const nextIndex = currentIndex + dir;
    if (nextIndex < 0 || nextIndex >= relatedImages.length) return;
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
    <div className="space-y-8">
        {/* Header */}
        {/* Header section with unified style */}
        <div className="flex items-center justify-between mb-6 sm:mb-8 transition-all relative z-10 gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-4xl sm:text-4xl font-bold tracking-tight text-foreground truncate">实物<span className="text-primary">相册</span></h1>
            <p className="block text-muted-foreground mt-1 sm:mt-2 text-[10px] sm:text-lg truncate max-w-2xl opacity-80">
                {user ? (isAdmin ? "仓库实拍、验货详情与内部档案库" : "商品实拍图与细节展示") : "登录可探索更多实拍详情与下载功能"}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0 -translate-y-1">
            {/* Developer & Contributors Avatar Group - Capsule Styled */}
            {(user === null || user.roleProfile?.name === "基础访客") && (
              <div 
                className={cn(
                    "flex items-center gap-3 px-4 py-2 rounded-full bg-white dark:bg-white/5 border transition-all shadow-sm",
                    hoveredDev 
                        ? "border-primary/50 bg-black/5 dark:bg-white/10 shadow-md ring-1 ring-primary/10" 
                        : "border-border dark:border-white/10"
                )}
                onMouseEnter={() => setHoveredDev(true)}
                onMouseLeave={() => setHoveredDev(false)}
              >
                <div className="flex -space-x-4 items-center">
                  {/* Contributor Avatar */}
                  <div className="relative h-10 w-10 sm:h-14 sm:w-14 rounded-full border-2 border-background ring-1 ring-zinc-200/50 dark:ring-white/10 overflow-hidden bg-muted transition-transform hover:z-20 hover:scale-110">
                    <Image 
                      src="/contributors/member.jpg" 
                      alt="Contributor" 
                      fill 
                      className="object-cover"
                    />
                  </div>
                  {/* Main Developer Avatar */}
                  <div 
                    className="relative h-10 w-10 sm:h-14 sm:w-14 rounded-full border-2 border-background ring-1 ring-zinc-200/50 dark:ring-white/10 overflow-hidden bg-muted transition-transform hover:z-20 hover:scale-110 cursor-pointer"
                    onClick={() => {
                      if (window.innerWidth >= 640) window.open('https://sube.top', '_blank');
                    }}
                    onDoubleClick={() => {
                      if (window.innerWidth < 640) window.open('https://sube.top', '_blank');
                    }}
                    title="PC单击 / 移动端双击访问主页"
                  >
                    <Image 
                      src={`https://cravatar.cn/avatar/${md5("2237608602@qq.com")}?d=mp`} 
                      alt="Sube"
                      fill
                      className="object-cover"
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-0.5 justify-center items-center">
                  <span className="text-[10px] sm:text-[13px] font-bold text-foreground/80 tracking-tight leading-none">素材提供 & 开发者</span>
                  <span className="text-[8px] sm:text-[10px] font-black text-primary tracking-widest opacity-80 uppercase">CONTRIBUTORS</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-row gap-2 items-center w-full transition-all mb-6 md:mb-10">
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
                        triggerClassName={cn(
                            "h-full rounded-full border text-xs sm:text-sm py-0 px-2 sm:px-5 transition-all truncate",
                            selectedCategory !== "All" ? "bg-primary/10 border-primary/20 text-primary dark:bg-primary/20 dark:border-primary/30 dark:text-primary font-medium" : "bg-white dark:bg-white/5 border-border dark:border-white/10 hover:bg-white/5"
                        )}
                    />
              </div>

              {hasActiveFilters && (
                  <button
                      onClick={resetFilters}
                      className="h-10 sm:h-11 px-4 flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 text-primary text-xs font-bold hover:bg-primary/10 transition-all active:scale-95 shadow-sm shrink-0 whitespace-nowrap"
                  >
                      <RotateCcw size={14} />
                      <span>重置</span>
                  </button>
              )}
          </div>

        {/* Responsive Grid / Waterfall */}
        <div className="w-full grid gap-3 sm:gap-6 grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
               {groupedProducts.map((group, idx) => {
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
                            className={cn(
                                "group relative rounded-2xl sm:rounded-3xl overflow-hidden bg-white dark:bg-white/5 border border-border dark:border-white/10 hover:border-primary/50 transition-all duration-500 flex flex-col h-full hover:shadow-2xl hover:shadow-primary/5 cursor-pointer",
                                group.product.isDiscontinued ? "bg-muted/30 border-muted-foreground/20" : ""
                            )}
                            onClick={() => handleOpenProductPreview(group)}
                        >
                            {/* Full Card Discontinued Overlay */}
                            {group.product.isDiscontinued && (
                                <div className="absolute inset-0 z-30 pointer-events-none flex items-center justify-center overflow-hidden">
                                    <div className="absolute inset-0 bg-white/40 dark:bg-black/40 backdrop-grayscale-[0.8]"></div>
                                    <div 
                                        className="relative z-10 transform -rotate-45 font-black text-red-600/70 dark:text-red-500/70 text-3xl sm:text-5xl lg:text-4xl xl:text-3xl tracking-widest whitespace-nowrap select-none drop-shadow-[0_0_12px_rgba(255,255,255,0.8)] dark:drop-shadow-[0_0_12px_rgba(0,0,0,0.8)]"
                                        style={{ WebkitTextStroke: '2px rgba(255, 255, 255, 0.5)' }}
                                    >
                                        已停产
                                    </div>
                                </div>
                            )}

                            <div className="relative aspect-square sm:aspect-4/3 overflow-hidden bg-muted">
                                {isVideoCover ? (
                                    <div className="relative w-full h-full">
                                        <video 
                                            src={`${coverUrl}#t=0.1`} 
                                            className="w-full h-full object-cover pointer-events-none"
                                            muted
                                            loop
                                            playsInline
                                            preload="metadata"
                                            onMouseOver={e => {
                                                const v = e.currentTarget;
                                                const playPromise = v.play();
                                                if (playPromise !== undefined) {
                                                    playPromise.catch(() => {});
                                                }
                                            }}
                                            onMouseOut={e => {
                                                e.currentTarget.pause();
                                                e.currentTarget.currentTime = 0;
                                            }}
                                        />
                                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                            <div className="bg-black/20 backdrop-blur-sm rounded-full p-3 border border-white/20 shadow-xl group-hover:scale-110 transition-transform duration-500">
                                                <PlayCircle size={32} className="text-white fill-white/20" strokeWidth={1.5} />
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <div className="absolute inset-0 bg-muted animate-pulse" />
                                        <Image 
                                            src={coverUrl} 
                                            alt={group.product.name} 
                                            fill 
                                            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                                            className="object-cover transition-all duration-700 opacity-0 group-hover:scale-105" 
                                            priority={idx < 6}
                                            onLoad={(e) => {
                                                const img = e.currentTarget;
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
                                
                                {/* 媒体数量 (Media Count) - 完美契合右上角 */}
                                 {group.items.length > 1 && (
                                    <div className="absolute top-0 right-0 z-20 h-6 min-w-[24px] px-2 flex items-center justify-center bg-black/50 text-white text-[12px] font-bold leading-none pointer-events-none rounded-bl-[16px] rounded-tr-[16px]">
                                        {group.items.length}
                                    </div>
                                )}
                                
                                <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/95 via-black/40 to-transparent opacity-100 transition-opacity duration-500 flex flex-col justify-end p-2.5 sm:p-5 pt-12 sm:pt-16">
                                    <div className="flex flex-col gap-0.5 sm:gap-1">
                                        <p className="text-white font-bold text-[9.5px] sm:text-[11px] line-clamp-2 leading-tight" style={{ fontFamily: 'ui-rounded, "SF Pro Rounded", "PingFang SC", "Hiragino Maru Gothic ProN", sans-serif' }}>{group.product.name}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )})
              }
        </div>

        {/* Infinite Scroll Anchor */}
        <div ref={scrollAnchorRef} className="h-[2px] w-full" />

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
            <div className="w-full grid gap-3 sm:gap-6 grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
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
                            transition={{ duration: 0.1 }}
                            className="fixed inset-0 bg-black/60 backdrop-blur-sm touch-none overscroll-none"
                            onClick={() => setIsUploadModalOpen(false)}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.98 }}
                            transition={{ duration: 0.15 }}
                            className="relative z-10 w-full max-w-lg rounded-[32px] bg-white dark:bg-[#0b111e] backdrop-blur-3xl shadow-2xl border border-black/5 dark:border-white/10 overflow-hidden flex flex-col font-rounded"
                        >
                            <div className="flex items-center justify-between border-b border-white/10 p-8 shrink-0">
                                <h2 className="text-xl font-bold text-foreground">上传实物内容</h2>
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
                                                    "absolute top-2 right-2 z-20 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-300 shadow-lg",
                                                    isSelected 
                                                        ? "bg-foreground border-foreground text-background scale-110" 
                                                        : "bg-white/50 dark:bg-zinc-800/50 border-white/50 dark:border-white/20 backdrop-blur"
                                                )}>
                                                    {isSelected && <Check size={14} strokeWidth={4} />}
                                                </div>

                                                <div className={cn(
                                                    "absolute inset-0 bg-black/0 transition-colors z-10",
                                                    isSelected ? "bg-black/20" : "group-hover:bg-black/10"
                                                )} />
                                            </div>
                                        )})}

                                        {/* Add Button */}
                                         <label className="relative aspect-square rounded-2xl border-2 border-dashed border-zinc-200 dark:border-white/5 hover:border-primary/40 dark:hover:border-primary/40 bg-zinc-50 dark:bg-white/5 hover:bg-primary/5 transition-all flex flex-col items-center justify-center gap-2 cursor-pointer overflow-hidden group">
                                            <input type="file" className="hidden" accept="image/*,video/*" multiple onChange={handleFileUpload} />
                                            <div className="p-3 rounded-2xl bg-white dark:bg-white/10 shadow-sm group-hover:bg-primary/10 transition-all duration-300">
                                                {isUploading ? (
                                                    <div className="h-6 w-6 animate-spin border-2 border-primary border-t-transparent rounded-full" />
                                                ) : (
                                                    <Plus size={24} className="text-zinc-400 dark:text-zinc-500 group-hover:text-primary transition-all scale-100 group-hover:scale-110" />
                                                )}
                                            </div>
                                            <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest text-center px-2">
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
                                                className="w-full px-4 py-4 rounded-[20px] bg-zinc-50 dark:bg-white/5 border border-zinc-200/50 dark:border-white/5 transition-all duration-300 flex items-center justify-between group cursor-pointer hover:bg-zinc-100 dark:hover:bg-white/10 mb-2 hover:translate-x-1"
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
                                                        {/* SKU hidden as per user request */}
                                                    </div>
                                                </div>
                                                <ChevronRight size={16} className="text-muted-foreground group-hover:translate-x-1 transition-transform shrink-0 ml-2" />
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            {uploadForm.productId ? (
                                                <div className="p-4 rounded-[20px] bg-zinc-50 dark:bg-white/5 border border-zinc-200/50 dark:border-white/5 flex items-center gap-3 mb-4 shadow-sm">
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
                                            <div className="p-4 rounded-[20px] bg-zinc-50 dark:bg-white/5 border border-zinc-200/50 dark:border-white/5 flex items-start gap-3 shadow-sm">
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
                                        className="relative flex items-center gap-2 rounded-2xl bg-primary px-8 py-3 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-all group overflow-hidden"
                                    >
                                        <CheckCircle size={18} className="relative z-10" />
                                        <span className="relative z-10">{isAdmin ? "确认发布" : "提交审核"} ({uploadForm.urls.length})</span>
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
                            transition={{ duration: 0.15, ease: "linear" }}
                            className="fixed inset-0 z-12000 bg-black overflow-hidden touch-none pointer-events-auto flex flex-col cursor-none"
                            style={{ cursor: isUIVisible ? 'default' : 'none' }}
                            onMouseMove={handleInteraction}
                            onTouchStart={handleInteraction}
                            onClick={handleInteraction}
                        >
                            {/* Layer 0: Ambient Background */}
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={`blur-${selectedImage?.id || 'none'}`}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 0.3 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.2 }}
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
                                className="absolute inset-0 -z-10 cursor-alias" 
                                onClick={() => setSelectedImage(null)} 
                            />

                             {/* Top Bar Overlay */}
                            <motion.div 
                                animate={{ 
                                    opacity: isUIVisible ? 1 : 0, 
                                    y: isUIVisible ? 0 : -20 
                                }}
                                style={{ 
                                    pointerEvents: isUIVisible ? "auto" : "none"
                                }}
                                className="absolute top-0 left-0 right-0 p-4 md:p-6 flex items-start justify-between z-55"
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
                                                className="absolute top-16 md:top-[68px] left-4 right-4 md:left-6 md:right-auto z-50 bg-black/90 backdrop-blur-2xl px-5 py-4 rounded-2xl border border-white/20 shadow-2xl flex flex-col gap-3 max-w-full md:max-w-md pointer-events-auto"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <div className="flex flex-col gap-1 font-rounded">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[10px] text-white/70 uppercase tracking-[0.2em] font-black shrink-0">商品信息</span>
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
                                                                            "group/item relative bg-white/8 backdrop-blur-md hover:bg-white/12 border border-white/15 hover:border-white/30 p-4 rounded-2xl transition-all duration-300 shadow-lg hover:shadow-xl",
                                                                            isLongValue ? "col-span-2" : "col-span-1"
                                                                        )}
                                                                    >
                                                                        <div className="flex flex-col gap-1.5">
                                                                            <span className="text-[10px] text-white/75 font-bold uppercase tracking-widest">{key}</span>
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
                                    {/* 上传按钮：仅系统开启上传功能且用户拥有 gallery:upload 权限时显示 */}
                                    {isUploadAllowed && hasPermission(user as SessionUser | null, "gallery:upload") && (
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
                                            checkAction("gallery:copy", async () => {
                                                try {
                                                    const res = await fetch(`/api/share/sign?id=${selectedImage!.id}`);
                                                    if (!res.ok) throw new Error("Sign failed");
                                                    const { expires, signature, expireText } = await res.json();
                                                    const url = new URL(`/share/${selectedImage!.id}?e=${expires}&s=${signature}`, window.location.origin).href;
                                                    navigator.clipboard.writeText(url).then(() => {
                                                        showToast(`链接已复制，${expireText}内有效`, "success");
                                                    }).catch(() => {
                                                        showToast("复制失败", "error");
                                                    });
                                                } catch {
                                                    showToast("生成链接失败", "error");
                                                }
                                            });
                                        }}
                                        className="flex h-10 w-10 items-center justify-center rounded-xl bg-black/60 text-white hover:bg-white hover:text-black transition-all border border-white/10 backdrop-blur-2xl shadow-xl"
                                        title="复制媒体链接"
                                    >
                                        <Link2 size={18} />
                                    </button>

                                    <button 
                                        onClick={() => {
                                            checkAction("gallery:share", async () => {
                                                try {
                                                    const productId = selectedImage!.productId;
                                                    const res = await fetch(`/api/share/sign?productId=${productId}`);
                                                    if (!res.ok) throw new Error("Sign failed");
                                                    const { expires, signature, expireText } = await res.json();
                                                    const url = new URL(`/share/product/${productId}?e=${expires}&s=${signature}`, window.location.origin).href;
                                                    navigator.clipboard.writeText(url).then(() => {
                                                        showToast(`相册链接已复制，${expireText}内有效`, "success");
                                                    }).catch(() => {
                                                        showToast("复制失败", "error");
                                                    });
                                                } catch {
                                                    showToast("生成链接失败", "error");
                                                }
                                            });
                                        }}
                                        className="flex h-10 w-10 items-center justify-center rounded-xl bg-black/60 text-white hover:bg-white hover:text-black transition-all border border-white/10 backdrop-blur-2xl group shadow-xl"
                                        title="转发（分享全套实拍）"
                                    >
                                        <ExternalLink size={18} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                                    </button>

                                    <button 
                                        onClick={() => {
                                            checkAction("gallery:download", () => {
                                                const product = selectedImage!.product;
                                                const timestamp = new Date().getTime();
                                                const isVideo = selectedImage!.type === 'video' || /\.(mp4|webm|ogg|mov)$/i.test(selectedImage!.url);
                                                const ext = isVideo ? 'mp4' : 'jpg';
                                                const fileName = `${product?.sku || 'MEDIA'}_${timestamp}.${ext}`;
                                                handleDownload(selectedImage!.url, fileName);
                                            });
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
                                        animate={{ opacity: isUIVisible ? 1 : 0 }}
                                        style={{ pointerEvents: isUIVisible ? "auto" : "none" }}
                                        className="hidden md:contents"
                                    >
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); navigate(-1); }}
                                            disabled={currentIndex === 0}
                                            className="absolute left-8 z-55 rounded-full p-4 bg-white/5 text-white hover:bg-white hover:text-black transition-all border border-white/10 backdrop-blur-md disabled:opacity-0 shadow-xl active:scale-95"
                                        >
                                            <ChevronRight size={32} className="rotate-180" />
                                        </button>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); navigate(1); }}
                                            disabled={currentIndex === relatedImages.length - 1}
                                            className="absolute right-8 z-55 rounded-full p-4 bg-white/5 text-white hover:bg-white hover:text-black transition-all border border-white/10 backdrop-blur-md disabled:opacity-0 shadow-xl active:scale-95"
                                        >
                                            <ChevronRight size={32} />
                                        </button>
                                    </motion.div>
                                )}

                                 <LightboxMediaItem 
                                    key={selectedImage!.id}
                                    item={selectedImage!}
                                    onScaleChange={(v) => activeScale.set(v)}
                                    isVisible={isUIVisible}
                                />
                            </div>

                        {/* Bottom Bar Overlay (Minimalist Float) */}
                        {/* Bottom Bar Overlay (Immersive Float) */}
                         <div className="absolute bottom-6 left-0 right-0 flex justify-center z-55 pointer-events-none px-4">
                            <motion.div 
                                className="bg-zinc-900/40 backdrop-blur-3xl px-2 py-3 rounded-2xl border border-white/10 shadow-2xl flex items-center gap-2 max-w-full overflow-hidden transition-all duration-700 ring-1 ring-white/5 opacity-100 translate-y-0"
                                style={{ 
                                    pointerEvents: "auto"
                                }}
                            >
                                {relatedImages.length > 1 && (
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); navigate(-1); }}
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
                                {relatedImages.map((img) => {
                                    const isSelected = img.id === selectedImage!.id;
                                    return (
                                        <div 
                                            key={img.id} 
                                            data-selected={isSelected}
                                            onClick={() => {
                                                if (!isSelected) {
                                                    setSelectedImage(img);
                                                }
                                            }}
                                            className={cn(
                                                "relative h-11 w-11 rounded-lg overflow-hidden cursor-pointer transition-all duration-200 border shrink-0 group",
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
                                                <Image 
                                                    src={img.url} 
                                                    alt="Thumbnail" 
                                                    fill
                                                    sizes="50px"
                                                    className="object-cover" 
                                                />
                                            )}
                                        </div>
                                    );
                                })}
                                </div>

                                {relatedImages.length > 1 && (
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); navigate(1); }}
                                        disabled={currentIndex === relatedImages.length - 1}
                                        className="md:hidden flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/5 text-white disabled:opacity-20 transition-all border border-white/10 active:scale-95"
                                    >
                                        <ChevronRight size={20} />
                                    </button>
                                )}
                            </motion.div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>,
            document.body
        )}

    <ConfirmModal 
        isOpen={confirmConfig.isOpen}
        onClose={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmConfig.onConfirm}
        message={confirmConfig.message}
        title={confirmConfig.title}
        confirmLabel={confirmConfig.title === "登录后使用" ? "立即登录" : "确认删除"}
        variant={confirmConfig.title === "登录后使用" ? "primary" : "danger"}
        className="z-31000"
    />

    {isAdmin && (
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
          onDelete={handleBatchDelete}
      />
    )}

    {/* Floating Actions Stack (Back to Top + Dev Avatar) */}
    {typeof document !== "undefined" && createPortal(
      <div className="fixed bottom-6 right-6 z-9999 flex flex-col items-center gap-5 pointer-events-none">
        
        {/* Back to Top Button */}
        <AnimatePresence>
          {showBackToTop && (
            <motion.button
              initial={{ opacity: 0, scale: 0.5, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.5, y: 10 }}
              onClick={() => {
                  window.scrollTo({ top: 0, behavior: "smooth" });
                  document.documentElement.scrollTo({ top: 0, behavior: "smooth" });
                  document.body.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className="w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center rounded-full bg-white dark:bg-zinc-800 shadow-[0_20px_50px_rgba(0,0,0,0.3)] backdrop-blur-xl text-foreground hover:scale-110 active:scale-95 transition-all group pointer-events-auto"
            >
              <ArrowUp size={24} className="group-hover:-translate-y-1 transition-transform" />
            </motion.button>
          )}
        </AnimatePresence>

      </div>,
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
