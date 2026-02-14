"use client";

import { useState, useEffect, Suspense, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform, animate } from "framer-motion";
import { Camera, ChevronRight, ArrowLeft, X, Download, Plus, CheckCircle, Package, Search, Check, PlayCircle, Info, ArrowUp } from "lucide-react";

import { ProductSelectionModal } from "@/components/Purchases/ProductSelectionModal";
import { useSearchParams, useRouter } from "next/navigation";

import { ActionBar } from "@/components/ui/ActionBar";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { useToast } from "@/components/ui/Toast";

import Image from "next/image";
import { cn } from "@/lib/utils";

import { useUser } from "@/hooks/useUser";
import { Product, GalleryItem, Category } from "@/lib/types";
import { useCallback } from "react";
import { pinyin } from 'pinyin-pro';

interface LightboxMediaItemProps {
    item: GalleryItem;
    direction: number;
    onNavigate: (dir: number) => void;
    onScaleChange: (v: number) => void;
}

const LightboxMediaItem = ({ item, direction, onNavigate, onScaleChange }: LightboxMediaItemProps) => {
    const scaleValue = useMotionValue(1);
    const xValue = useMotionValue(0);
    const yValue = useMotionValue(0);
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [isZoomed, setIsZoomed] = useState(false);

    const softSpringConfig = { stiffness: 300, damping: 30, mass: 0.5 };
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
        if (item.type === 'video') return;
        setIsDragging(true);
        setDragStart({ x: e.clientX - xValue.get(), y: e.clientY - yValue.get() });
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!isDragging) return;
        const newX = e.clientX - dragStart.x;
        if (scaleValue.get() <= 1) {
            xValue.set(newX);
        } else {
            xValue.set(newX);
            yValue.set(e.clientY - dragStart.y);
        }
    };

    const handlePointerUp = () => {
        if (!isDragging) return;
        setIsDragging(false);
        if (scaleValue.get() <= 1) {
            const currentX = xValue.get();
            const threshold = 80;
            if (currentX > threshold) {
                onNavigate(-1);
            } else if (currentX < -threshold) {
                onNavigate(1);
            } else {
                animate(xValue, 0, { type: "spring", ...softSpringConfig });
            }
        }
    };

    return (
        <motion.div
            custom={direction}
            variants={{
                enter: (dir: number) => ({
                    x: dir === 0 ? 0 : (dir > 0 ? "100%" : "-100%"),
                    opacity: 1,
                    scale: 1,
                    zIndex: 1
                }),
                center: { x: 0, opacity: 1, scale: 1, zIndex: 10 },
                exit: (dir: number) => ({
                    x: dir === 0 ? 0 : (dir < 0 ? "100%" : "-100%"),
                    opacity: 1,
                    scale: 1,
                    zIndex: 1
                })
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ 
                x: { type: "spring", stiffness: 400, damping: 40, mass: 1 },
                opacity: { duration: 0.25 }
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
                    width: '100vw',
                    height: '100vh',
                    willChange: "transform"
                }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
                onWheel={handleWheel}
            >
                {item.type === 'video' || /\.(mp4|webm|ogg|mov)$/i.test(item.url) ? (
                    <video 
                        src={item.url} 
                        className="max-w-[90%] max-h-[75%] object-contain rounded-lg shadow-2xl mx-auto"
                        controls
                        autoPlay
                    />
                ) : (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img 
                        src={item.url} 
                        alt="Gallery View" 
                        className="max-w-[95%] sm:max-w-[90%] max-h-[85%] sm:max-h-[75%] object-contain rounded-2xl shadow-2xl mx-auto border border-white/5"
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
  const searchParams = useSearchParams();
  const router = useRouter();  
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedImage, setSelectedImage] = useState<GalleryItem | null>(null);
  const [mounted, setMounted] = useState(false);
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isUploadAllowed, setIsUploadAllowed] = useState(false);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showBackToTop, setShowBackToTop] = useState(false);

  // Scroll listener for Back to Top button
  useEffect(() => {
    const handleScroll = () => {
      setShowBackToTop(window.scrollY > 400);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);
  const { showToast } = useToast();
  
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
  const [isUploading, setIsUploading] = useState(false);
  const [uploadForm, setUploadForm] = useState<{
    productId: string;
    isPublic: boolean;
    urls: { url: string; type: 'image' | 'video' }[],
    tags: ""
  }>({
    productId: "",
    isPublic: true,
    urls: [],
    tags: ""
  });

  const fetchData = useCallback(async () => {
    try {
      const productId = searchParams.get("productId");
      const galleryUrl = productId ? `/api/gallery?productId=${productId}` : "/api/gallery";
      
      const [galleryRes, categoriesRes, productsRes] = await Promise.all([
        fetch(galleryUrl),
        fetch("/api/categories"),
        fetch("/api/products")
      ]);

      if (galleryRes.ok && categoriesRes.ok && productsRes.ok) {
        const galleryData = await galleryRes.json();
        const categoriesData = await categoriesRes.json();
        const productsData = await productsRes.json();
        
        const sortedGalleryData = galleryData.sort((a: GalleryItem, b: GalleryItem) => {
          const productA = productsData.find((p: Product) => p.id === a.productId);
          const productB = productsData.find((p: Product) => p.id === b.productId);
          
          const isACover = productA?.image === a.url;
          const isBCover = productB?.image === b.url;
          
          if (isACover && !isBCover) return -1;
          if (!isACover && isBCover) return 1;
          
          const dateA = a.createdAt || a.uploadDate || new Date(0).toISOString();
          const dateB = b.createdAt || b.uploadDate || new Date(0).toISOString();
          return new Date(dateA).getTime() - new Date(dateB).getTime();
        });
        
        setItems(sortedGalleryData);
        setCategories(categoriesData);
        setProducts(productsData);
      }
    } catch (error) {
      console.error("Gallery fetch failed:", error);
    }
  }, [searchParams]);

  useEffect(() => {
    setMounted(true);
    fetchData();
  }, [fetchData]);

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

    setIsUploading(true);

    try {
      const uploadPromises = Array.from(files).map(async (file) => {
        // Use streaming upload for reliability (especially for videos)
        const arrayBuffer = await file.arrayBuffer();
        
        const res = await fetch("/api/upload", {
            method: "POST",
            headers: {
              "Content-Type": file.type,
              "X-File-Name": encodeURIComponent(file.name),
              "X-File-Type": file.type
            },
            body: arrayBuffer,
        });

        if (res.ok) {
            const data = await res.json();
            return {
                url: data.url,
                type: data.type
            };
        }
        return null;
      });

      const results = await Promise.all(uploadPromises);
      const successfulFiles = results.filter((res): res is { url: string; type: 'image' | 'video' } => res !== null);
      
      setUploadForm(prev => ({ ...prev, urls: [...prev.urls, ...successfulFiles] }));
      
    } catch (error) {
      console.error("Upload failed:", error);
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (uploadForm.urls.length === 0 || !uploadForm.productId) return;

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
        setUploadForm({ productId: "", isPublic: true, urls: [], tags: "" });
        fetchData();
      }
    } catch (error) {
      console.error("Gallery submit failed:", error);
    }
  };

  // Pre-calculate pinyin for products to optimize search
  const productPinyinMap = useMemo(() => {
    const map: Record<string, { full: string, first: string }> = {};
    products.forEach(p => {
      if (!p.name) return;
      const full = pinyin(p.name, { toneType: 'none', type: 'string' }).replace(/\s+/g, '').toLowerCase();
      const first = pinyin(p.name, { pattern: 'first', toneType: 'none', type: 'string' }).replace(/\s+/g, '').toLowerCase();
      map[p.id] = { full, first };
    });
    return map;
  }, [products]);

  // Helper logic
  const productIdFilter = searchParams.get("productId");

  const filteredItems = items.filter(item => {
    const product = item.product;
    if (!isAdmin && !item.isPublic) return false;
    if (!item.productId) return false; // Safety: must have productId

    // If we are looking at a specific product, only filter by that ID
    if (productIdFilter && productIdFilter !== 'undefined') {
        return item.productId === productIdFilter;
    }

    const searchLower = searchQuery.toLowerCase().replace(/\s+/g, '');
    
    // Safety check if product exists
    if (!product) return false;

    // Match Name or SKU
    const matchesNameOrSku = 
      (product.name?.toLowerCase()?.includes(searchLower) ?? false) || 
      (product.sku?.toLowerCase()?.includes(searchLower) ?? false);

    // Match Pinyin
    const pinyinData = productPinyinMap[product.id];
    const matchesPinyin = pinyinData ? (
        pinyinData.full.includes(searchLower) || 
        pinyinData.first.includes(searchLower)
    ) : false;

    const matchesSearch = matchesNameOrSku || matchesPinyin;

    const matchesCategory = selectedCategory === "All" || item.product?.category?.name === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Grouped logic: unique products with items
  const groupedProducts = useMemo(() => {
    if (productIdFilter && productIdFilter !== 'undefined') return [];
    
    const groups: Record<string, { product: Product, items: GalleryItem[] }> = {};
    
    filteredItems.forEach(item => {
      const pid = item.productId;
      if (!pid) return; // Safety
      
      if (!groups[pid]) {
        // Prepare a robust product object for display
        const productData = item.product || { id: pid, name: '未知商品', sku: 'N/A' };
        // Ensure id is present in the object used for grouping
        if (!productData.id) productData.id = pid;
        
        groups[pid] = { product: productData as Product, items: [] };
      }
      groups[pid].items.push(item);
    });
    
    return Object.values(groups).sort((a, b) => {
        const latestA = Math.max(...a.items.map(i => new Date(i.createdAt || 0).getTime()));
        const latestB = Math.max(...b.items.map(i => new Date(i.createdAt || 0).getTime()));
        return latestB - latestA;
    });
  }, [filteredItems, productIdFilter]);

  const filteredProduct = items.length > 0 ? items[0].product : null;

  const handleOpenImage = (item: GalleryItem) => {
    setSelectedImage(item);
  };

  const toggleSelect = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
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


  // Navigation logic
  const relatedImages = selectedImage ? items.filter(img => {
      const isCorrectProduct = img.productId === selectedImage.productId;
      const isVisible = isAdmin || img.isPublic;
      return isCorrectProduct && isVisible;
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
    <div className="space-y-8 pb-12 animate-in fade-in slide-in-from-top-4 duration-700">
        {/* Header */}
        {/* Header section with unified style */}
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between mb-8 transition-all">
          <div className="flex-1 min-w-0">
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground flex items-center gap-2">
              {productIdFilter ? (
                <div className="flex items-start gap-2 min-w-0 max-w-full">
                  <span className="shrink-0 mt-0.5 sm:mt-1">实物相册</span>
                  <span className="text-muted-foreground/30 font-light mt-0.5 sm:mt-1">/</span>
                  <span 
                    className="text-base sm:text-2xl font-bold text-muted-foreground/60 wrap-break-word line-clamp-2 sm:line-clamp-none"
                    title={filteredProduct?.name}
                  >
                    {filteredProduct?.name || "加载中..."}
                  </span>
                </div>
              ) : (
                <span>实物<span className="text-primary">相册</span></span>
              )}
            </h1>
            {!productIdFilter && (
              <p className="text-muted-foreground mt-2 text-sm sm:text-lg">
                {isAdmin ? "仓库实拍、验货详情与内部档案库" : "商品实拍图与细节展示"}
              </p>
            )}
          </div>

            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
               {(isUploadAllowed || isAdmin) && (
                 <button 
                   onClick={() => {
                     setIsUploadModalOpen(true);
                     if (productIdFilter && productIdFilter !== 'undefined') {
                       setUploadForm(prev => ({ ...prev, productId: productIdFilter }));
                     }
                   }}
                   className="h-10 px-4 sm:px-6 rounded-full bg-primary text-primary-foreground text-sm flex items-center justify-center gap-2 transition-all font-bold shadow-lg shadow-primary/20 hover:-translate-y-0.5 active:scale-95 whitespace-nowrap"
                 >
                   <Plus size={18} /> <span className="hidden xs:inline">上传实拍</span><span className="xs:hidden">上传</span>
                 </button>
               )}
               
               {productIdFilter && (
                   <button 
                      onClick={() => router.push("/gallery")}
                      className="h-10 px-4 sm:px-6 rounded-full bg-white dark:bg-white/5 border border-border dark:border-white/10 text-foreground flex items-center justify-center gap-2 transition-all font-bold whitespace-nowrap shadow-sm hover:bg-muted"
                   >
                      <ArrowLeft size={18} /> <span className="hidden sm:inline">返回全集</span><span className="sm:hidden">返回</span>
                   </button>
               )}
            </div>
          </div>

          {!productIdFilter && (
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="h-10 px-5 rounded-full bg-white dark:bg-white/5 border border-border dark:border-white/10 flex items-center gap-3 focus-within:ring-2 focus-within:ring-primary/20 transition-all dark:hover:bg-white/10 w-full sm:w-64 shrink-0">
                <Search size={18} className="text-muted-foreground shrink-0" />
                <input 
                    type="text" 
                    placeholder="搜索商品名或 SKU..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="bg-transparent border-none outline-none w-full text-foreground placeholder:text-muted-foreground text-sm h-full"
                />
              </div>
            </div>
          )}

        {/* Filters */}
        {!productIdFilter && (
          <div className="-mx-4 px-4 overflow-x-auto scrollbar-hide">
              <div className="flex items-center gap-2 pb-2">
                  <button
                      onClick={() => setSelectedCategory("All")}
                      className={cn(
                          "px-5 py-1.5 rounded-full text-xs sm:text-sm font-bold transition-all whitespace-nowrap border",
                          selectedCategory === "All" 
                          ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20" 
                          : "bg-muted/50 dark:glass text-muted-foreground border-border/50 hover:border-primary/30 hover:text-primary"
                      )}
                  >
                      全部展示
                  </button>

                  {categories.map(cat => (
                      <button
                          key={cat.id}
                          onClick={() => setSelectedCategory(cat.name)}
                          className={cn(
                              "px-5 py-1.5 rounded-full text-xs sm:text-sm font-bold transition-all whitespace-nowrap border",
                              selectedCategory === cat.name
                              ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20" 
                              : "bg-muted/50 dark:glass text-muted-foreground border-border/50 hover:border-primary/30 hover:text-primary"
                          )}
                      >
                          {cat.name}
                      </button>
                  ))}
              </div>
          </div>
        )}



        {/* Responsive Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 sm:gap-6">
           <AnimatePresence mode="popLayout">
            {productIdFilter && productIdFilter !== 'undefined' ? (
                filteredItems.map((item, index) => {
                    const product = item.product;
                    return (
                        <motion.div
                            key={item.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            transition={{ duration: 0.4, delay: index * 0.05 }}
                        >
                            <div className="group relative rounded-2xl sm:rounded-3xl overflow-hidden bg-white dark:bg-gray-900/70 border border-border dark:border-white/10 hover:border-primary/50 transition-all duration-500 hover:shadow-2xl hover:shadow-primary/5 flex flex-col h-full cursor-pointer"
                                 onClick={() => {
                                     if (selectedIds.length > 0) {
                                         toggleSelect(item.id);
                                     } else {
                                         handleOpenImage(item);
                                     }
                                 }}
                            >
                                {/* Image Container */}
                                <div className="relative aspect-square sm:aspect-4/3 overflow-hidden bg-muted">
                                    {item.type === 'video' || /\.(mp4|webm|ogg|mov)$/i.test(item.url) ? (
                                        <div className="relative w-full h-full bg-black flex items-center justify-center">
                                            <video 
                                                src={item.url} 
                                                className="w-full h-full object-cover pointer-events-none"
                                                muted
                                                preload="metadata"
                                            />
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <PlayCircle size={48} className="text-white/80 drop-shadow-lg scale-90 group-hover:scale-100 transition-transform" />
                                            </div>
                                        </div>
                                    ) : (
                                        <Image 
                                            src={item.url} 
                                            alt={item.product?.name || "Product image"} 
                                            fill 
                                            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                                            priority={index < 4}
                                            className="object-cover transition-transform duration-700 group-hover:scale-105" 
                                        />
                                    )}
                                    
                                    {/* 元数据浮层 - SKU + 快速发图引导 */}
                                    <div className="absolute top-2 left-2 z-10 flex flex-col gap-1.5">
                                        <span className="px-2 py-0.5 bg-black/70 backdrop-blur-md rounded-md text-[9px] font-black text-white border border-white/10 tracking-widest uppercase">
                                            {product?.sku}
                                        </span>
                                        {!item.isPublic && isAdmin && (
                                            <span className="px-1.5 py-0.5 bg-yellow-500/90 text-black text-[8px] font-bold rounded-md shadow-sm w-fit whitespace-nowrap">
                                                内部可见
                                            </span>
                                        )}
                                    </div>
    
                                    {/* Selection Checkbox (Hover or Selected) */}
                                    {isAdmin && (
                                        <div className={`absolute top-4 right-4 z-20 transition-all duration-300 ${
                                            selectedIds.includes(item.id) || selectedIds.length > 0 ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                                        }`}>
                                            <button 
                                                onClick={(e) => toggleSelect(item.id, e)}
                                                className={`relative h-6 w-6 rounded-full border-2 transition-all duration-300 flex items-center justify-center ${
                                                    selectedIds.includes(item.id)
                                                    ? "bg-foreground border-foreground text-background scale-110" 
                                                    : "bg-black/40 border-white/40 backdrop-blur hover:border-white"
                                                }`}
                                            >
                                                {selectedIds.includes(item.id) && (
                                                    <Check size={14} strokeWidth={4} />
                                                )}
                                            </button>
                                        </div>
                                    )}
    
                                    <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex flex-col justify-end p-3 sm:p-6">
                                        <div className="flex flex-col gap-1">
                                            <p className="text-white font-bold text-xs sm:text-base line-clamp-1">{product?.name}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    );
                })
            ) : (
                groupedProducts.map((group, index) => (
                    <motion.div
                        key={group.product.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        transition={{ duration: 0.4, delay: index * 0.05 }}
                    >
                        <div 
                            className="group relative rounded-2xl sm:rounded-3xl overflow-hidden bg-white dark:bg-gray-900/70 border border-border dark:border-white/10 hover:border-primary/50 transition-all duration-500 hover:shadow-2xl hover:shadow-primary/5 flex flex-col h-full cursor-pointer"
                            onClick={() => router.push(`/gallery?productId=${group.product.id}`)}
                        >
                            <div className="relative aspect-square sm:aspect-4/3 overflow-hidden bg-muted">
                                <Image 
                                    src={group.items[0].url} 
                                    alt={group.product.name} 
                                    fill 
                                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                                    className="object-cover transition-transform duration-700 group-hover:scale-105" 
                                />
                                
                                {/* Image Count Badge */}
                                <div className="absolute top-2 right-2 sm:top-4 sm:right-4 z-10">
                                    <span className="px-2 py-0.5 sm:px-3 sm:py-1 bg-black/60 backdrop-blur-md rounded-full text-[9px] sm:text-[10px] font-black text-white border border-white/10 tracking-widest">
                                        {group.items.length} 个
                                    </span>
                                </div>

                                <div className="absolute inset-0 bg-linear-to-t from-black/90 via-black/20 to-transparent opacity-100 transition-opacity duration-500 flex flex-col justify-end p-3 sm:p-6">
                                    <div className="flex flex-col gap-0.5 sm:gap-1">
                                        <p className="text-white font-bold text-xs sm:text-lg line-clamp-1">{group.product.name}</p>
                                        <p className="text-white/60 text-[10px] sm:text-xs font-mono tracking-wider">{group.product.sku}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                ))
            )}

            {filteredItems.length === 0 && productIdFilter && (
                <div className="col-span-full py-24 text-center glass border-dashed border-2 border-border/50 rounded-3xl">
                <Camera size={48} className="mx-auto text-black/30 dark:text-white/30 mb-4" />
                <h3 className="text-xl font-bold text-foreground">该商品暂无实拍内容</h3>
                <p className="text-muted-foreground mt-1">您可以尝试上传第一个实拍内容</p>
                </div>
            )}
           </AnimatePresence>
        </div>

        {/* Empty State */}
        {filteredItems.length === 0 && !productIdFilter && (
            <div className="py-32 flex flex-col items-center justify-center text-center space-y-6">
                <div className="h-24 w-24 rounded-full bg-muted flex items-center justify-center text-black/30 dark:text-white/30">
                    <Camera size={48} />
                </div>
                <div className="space-y-2">
                    <h3 className="text-2xl font-bold text-foreground">暂无符合条件的媒体内容</h3>
                    <p className="text-muted-foreground">尝试更换搜索词或选择其他分类</p>
                </div>
            </div>
        )}

        {/* Upload Modal */}
        {mounted && createPortal(
            <AnimatePresence>
                {isUploadModalOpen && (
                    <div className="fixed inset-0 z-9999 flex items-center justify-center p-4">
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
                                    <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                        <Camera size={16} className="text-black dark:text-white" /> 选择文件 ({uploadForm.urls.length})
                                    </label>
                                    {uploadForm.urls.length > 0 && (
                                        <button 
                                            type="button" 
                                            onClick={() => setUploadForm(prev => ({ ...prev, urls: [] }))}
                                            className="text-xs text-destructive hover:underline"
                                        >
                                            清空所有
                                        </button>
                                    )}
                                    
                                    <div className="grid grid-cols-3 gap-3">
                                        {/* Existing Images */}
                                        {uploadForm.urls.map((file, idx) => (
                                            <div key={idx} className="relative aspect-square rounded-xl overflow-hidden group border border-border">
                                                {file.type === 'video' ? (
                                                     <video 
                                                        src={file.url} 
                                                        className="w-full h-full object-cover"
                                                        muted
                                                    />
                                                ) : (
                                                    <Image 
                                                      src={file.url} 
                                                      alt="Upload preview"
                                                      fill 
                                                      sizes="(max-width: 640px) 33vw, 150px"
                                                      className="object-cover" 
                                                    />
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => setUploadForm(prev => ({ ...prev, urls: prev.urls.filter((_, i) => i !== idx) }))}
                                                    className="absolute top-1 right-1 p-1 bg-black/60 text-white rounded-full hover:bg-destructive transition-colors opacity-0 group-hover:opacity-100"
                                                >
                                                    <X size={12} />
                                                </button>
                                            </div>
                                        ))}

                                        {/* Add Button */}
                                        <label className="relative aspect-square rounded-xl border-2 border-dashed border-border hover:border-primary/40 hover:bg-primary/5 transition-all flex flex-col items-center justify-center gap-2 cursor-pointer overflow-hidden group">
                                            <input type="file" className="hidden" accept="image/*" multiple onChange={handleFileUpload} />
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

                                {/* Product Select */}
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                        <Package size={16} /> 关联商品
                                    </label>
                                    <div 
                                        onClick={() => setIsProductSelectOpen(true)}
                                        className="w-full px-4 py-3 rounded-xl bg-muted/50 border border-border hover:bg-muted transition-colors cursor-pointer flex items-center justify-between group"
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            {uploadForm.productId ? (() => {
                                                const p = products.find(p => p.id === uploadForm.productId);
                                                if (!p) return null;
                                                return (
                                                    <div className="h-10 w-10 rounded-lg overflow-hidden bg-background border border-border/50 shrink-0 flex items-center justify-center">
                                                        {p?.image ? (
                                                            /* eslint-disable-next-line @next/next/no-img-element */
                                                            <img src={p.image} alt={p.name} className="h-full w-full object-cover" />
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
                                            
                                            <div className="flex flex-col truncate">
                                                <span className={cn("text-sm font-medium truncate", !uploadForm.productId ? "text-muted-foreground" : "text-foreground")}>
                                                    {uploadForm.productId 
                                                        ? (() => {
                                                            const p = products.find(p => p.id === uploadForm.productId);
                                                            return p ? p.name : "未知商品";
                                                        })()
                                                        : "点击选择关联商品..."
                                                    }
                                                </span>
                                                {uploadForm.productId && (() => {
                                                     const p = products.find(p => p.id === uploadForm.productId);
                                                     return p && (
                                                         <span className="text-xs text-muted-foreground font-mono truncate opacity-70">
                                                             {p.sku}
                                                         </span>
                                                     );
                                                })()}
                                            </div>
                                        </div>
                                        <ChevronRight size={16} className="text-muted-foreground group-hover:translate-x-1 transition-transform shrink-0 ml-2" />
                                    </div>
                                </div>

                                <div className="flex justify-end gap-3 pt-4 border-t border-border/50">
                                    <button type="button" onClick={() => setIsUploadModalOpen(false)} className="px-6 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground">取消</button>
                                    <button 
                                        type="submit" 
                                        disabled={uploadForm.urls.length === 0 || !uploadForm.productId || isUploading}
                                        className="flex items-center gap-2 rounded-xl bg-primary px-8 py-2.5 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-all"
                                    >
                                        <CheckCircle size={18} />
                                        确认发布 ({uploadForm.urls.length})
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
                            className="fixed inset-0 z-9999 bg-black overflow-hidden touch-none pointer-events-auto flex flex-col"
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
                                    {selectedImage && (
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
                                        {showInfo ? <X size={20} /> : <Info size={20} className="group-hover:scale-110 transition-transform" />}
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
                                                className="absolute top-16 left-4 right-4 md:left-6 md:right-auto z-50 bg-black/80 backdrop-blur-xl px-4 py-3 rounded-xl border border-white/10 shadow-2xl flex flex-col gap-2 max-w-full md:max-w-md pointer-events-auto"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <div className="flex flex-col gap-1">
                                                    <span className="text-[10px] text-white/40 uppercase tracking-[0.2em] font-black">商品信息</span>
                                                    <h3 className="text-white font-bold text-sm md:text-lg leading-snug">
                                                        {selectedImage.product?.name}
                                                    </h3>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <span className="text-white/60 font-mono text-[10px] md:text-xs bg-white/10 px-2 py-0.5 rounded-md border border-white/10">
                                                            {selectedImage.product?.sku}
                                                        </span>
                                                    </div>
                                                </div>
                                                {isAdmin && selectedImage.product?.stock !== undefined && (
                                                    <>
                                                        <div className="h-px w-full bg-white/10 my-1" />
                                                        <div className="flex flex-col gap-0.5">
                                                            <span className="text-[10px] text-white/40 uppercase tracking-[0.2em] font-black">当前库存</span>
                                                            <span className="text-white font-bold text-sm">
                                                                {selectedImage.product?.stock} <span className="text-[10px] opacity-40">件</span>
                                                            </span>
                                                        </div>
                                                    </>
                                                )}
                                            </motion.div>
                                        </>
                                    )}
                                </AnimatePresence>

                                <div className="flex items-center gap-2 pointer-events-auto">
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

                                <AnimatePresence initial={false} custom={previewDirection} mode="popLayout">
                                    <LightboxMediaItem 
                                        key={selectedImage.id}
                                        item={selectedImage}
                                        direction={previewDirection}
                                        onNavigate={navigate}
                                        onScaleChange={(v) => activeScale.set(v)}
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
                                    const isSelected = img.id === selectedImage.id;
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
                                                    /* eslint-disable-next-line @next/next/no-img-element */
                                                    <img src={img.url} alt="Thumbnail" className="w-full h-full object-cover" />
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
            onDelete={handleBatchDelete}
        />
      </>
    )}

    {/* Back to Top Button */}
    <AnimatePresence>
      {showBackToTop && (
        <motion.button
          initial={{ opacity: 0, scale: 0.5, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.5, y: 20 }}
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-6 right-6 sm:bottom-10 sm:right-10 z-40 h-12 w-12 rounded-full bg-primary text-primary-foreground shadow-2xl shadow-primary/40 flex items-center justify-center hover:scale-110 active:scale-95 transition-transform"
          title="返回顶部"
        >
          <ArrowUp size={24} strokeWidth={3} />
        </motion.button>
      )}
    </AnimatePresence>
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
