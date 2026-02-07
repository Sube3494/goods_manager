"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Camera, ChevronRight, Eye, ArrowLeft, X, Download } from "lucide-react";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";
import { INITIAL_GALLERY, INITIAL_GOODS } from "@/lib/mockData";
import { GalleryItem } from "@/lib/types";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import Image from "next/image";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function GalleryContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedImage, setSelectedImage] = useState<GalleryItem | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const handle = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(handle);
  }, []);

  // Body Scroll Lock
  useEffect(() => {
    if (selectedImage) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [selectedImage]);

  const productIdFilter = searchParams.get("productId");

  const categories = ["All", ...Array.from(new Set(INITIAL_GOODS.map(g => g.category)))];

  const filteredItems = INITIAL_GALLERY.filter(item => {
    const product = INITIAL_GOODS.find(g => g.id === item.productId);
    
    // If productId filter is active, only show that product
    if (productIdFilter && item.productId !== productIdFilter) return false;

    const matchesSearch = product?.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         item.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCategory = selectedCategory === "All" || product?.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const filteredProduct = productIdFilter ? INITIAL_GOODS.find(g => g.id === productIdFilter) : null;

  const handleOpenImage = (item: GalleryItem) => {
    setSelectedImage(item);
  };

  const relatedImages = selectedImage ? INITIAL_GALLERY.filter(img => img.productId === selectedImage.productId) : [];
  const currentIndex = relatedImages.findIndex(img => img.id === selectedImage?.id);

  const handlePrev = () => {
    if (currentIndex > 0) setSelectedImage(relatedImages[currentIndex - 1]);
  };

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
      // Fallback to direct link if fetch fails
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.target = "_blank";
      link.click();
    }
  };

  const handleNext = () => {
    if (currentIndex < relatedImages.length - 1) setSelectedImage(relatedImages[currentIndex + 1]);
  };

  return (
    <div className="space-y-8 pb-12 animate-in fade-in slide-in-from-top-4 duration-700">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-primary">
              <Camera size={20} />
              <span className="text-sm font-bold uppercase tracking-wider">Physical Album</span>
            </div>
            <h1 className="text-4xl font-black tracking-tight text-foreground">
              {productIdFilter ? (
                  <div className="flex items-center gap-3">
                    实物<span className="text-primary">档案</span>
                    <span className="text-2xl font-normal text-muted-foreground">/ {filteredProduct?.name}</span>
                  </div>
              ) : (
                <>实物<span className="text-primary">相册</span></>
              )}
            </h1>
            <p className="text-muted-foreground text-lg">
              {productIdFilter ? `正在查看此款商品的专属随拍记录` : `查看商品实拍图、细节展示及入库验货记录`}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
             {productIdFilter && (
                 <button 
                    onClick={() => router.push("/gallery")}
                    className="h-14 px-6 rounded-2xl glass border-border/50 text-muted-foreground hover:text-foreground flex items-center gap-2 transition-all font-bold"
                 >
                    <ArrowLeft size={20} /> 返回全集
                 </button>
             )}
             <div className="h-14 px-6 rounded-2xl glass border-border/50 flex items-center gap-4 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                <Search size={20} className="text-muted-foreground" />
                <input 
                    type="text" 
                    placeholder="搜索商品或标签..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground w-64"
                />
             </div>
          </div>
        </div>

        {/* Filters - Added py-4 and adjusted margins to prevent shadow/scale truncation */}
        <div className="flex items-center gap-2 overflow-x-auto py-4 -mx-2 px-2 scrollbar-none">
            {categories.map(cat => (
                <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={cn(
                        "px-6 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap border",
                        selectedCategory === cat 
                        ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20 scale-105" 
                        : "bg-muted/50 dark:glass text-muted-foreground border-border/50 hover:border-primary/30 hover:text-primary"
                    )}
                >
                    {cat === "All" ? "全部展示" : cat}
                </button>
            ))}
        </div>

        {/* Responsive Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
           <AnimatePresence mode="popLayout">
            {filteredItems.map((item, index) => {
                const product = INITIAL_GOODS.find(g => g.id === item.productId);
                return (
                    <motion.div
                        key={item.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        transition={{ duration: 0.4, delay: index * 0.05 }}
                    >
                        <div className="group relative rounded-3xl overflow-hidden bg-white dark:bg-card border border-border dark:border-white/10 hover:border-primary/50 transition-all duration-500 hover:shadow-2xl hover:shadow-primary/5 flex flex-col h-full">
                            {/* Image Container */}
                            <div className="relative aspect-4/3 overflow-hidden bg-muted">
                                <Image 
                                    src={item.url} 
                                    alt={product?.name || "Product image"} 
                                    fill
                                    unoptimized
                                    className="object-cover transition-transform duration-700 group-hover:scale-110"
                                />
                                <div className="absolute inset-0 bg-linear-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex flex-col justify-end p-6">
                                    <button 
                                        onClick={() => handleOpenImage(item)}
                                        className="w-full py-3 rounded-xl bg-white text-black font-black text-sm flex items-center justify-center gap-2 hover:bg-primary hover:text-white transition-all transform translate-y-4 group-hover:translate-y-0 duration-500"
                                    >
                                        <Eye size={16} /> 查看大图
                                    </button>
                                </div>
                            </div>

                            {/* Content */}
                            <div className="p-5 space-y-2 flex-1 flex flex-col justify-between">
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between gap-3">
                                        <h3 className="font-bold text-foreground truncate group-hover:text-primary transition-colors text-sm">
                                            {product?.name}
                                        </h3>
                                        <span className="shrink-0 text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                            {product?.sku}
                                        </span>
                                    </div>
                                    
                                    <div className="pt-2 border-t border-border/30 flex items-center justify-between text-[10px]">
                                        <span className="font-bold text-primary uppercase tracking-wider">{product?.category}</span>
                                        <ChevronRight size={12} className="text-muted-foreground/50" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                );
            })}

            {filteredItems.length === 0 && productIdFilter && (
                <div className="col-span-full py-24 text-center glass border-dashed border-2 border-border/50 rounded-3xl">
                <Camera size={48} className="mx-auto text-muted-foreground/30 mb-4" />
                <h3 className="text-xl font-bold text-foreground">该商品暂无实拍图</h3>
                <p className="text-muted-foreground mt-1">您可以尝试上传第一张实拍照片</p>
                </div>
            )}
           </AnimatePresence>
        </div>

        {/* Empty State */}
        {filteredItems.length === 0 && !productIdFilter && (
            <div className="py-32 flex flex-col items-center justify-center text-center space-y-6">
                <div className="h-24 w-24 rounded-full bg-muted flex items-center justify-center text-muted-foreground/30">
                    <Camera size={48} />
                </div>
                <div className="space-y-2">
                    <h3 className="text-2xl font-bold text-foreground">暂无符合条件的随拍</h3>
                    <p className="text-muted-foreground">尝试更换搜索词或选择其他分类</p>
                </div>
            </div>
        )}

        {/* Image Viewer Modal - Using Portal to cover entire screen including sidebar */}
        {mounted && createPortal(
            <AnimatePresence>
                {selectedImage && (
                    <div className="fixed inset-0 z-9999 flex items-center justify-center p-4 overflow-hidden">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-black/95 backdrop-blur-2xl"
                            onClick={() => setSelectedImage(null)}
                        />
                        
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="relative z-10 w-full h-full flex items-center justify-center pointer-events-none"
                        >
                            <div className="relative w-full max-w-[90vw] h-[85vh] flex items-center justify-center pointer-events-auto">
                                {/* Close Button */}
                                <button 
                                    onClick={() => setSelectedImage(null)}
                                    className="fixed top-8 right-8 z-50 rounded-full p-3 bg-white/10 text-white hover:bg-primary hover:text-white transition-all border border-white/10 group/close backdrop-blur-md"
                                >
                                    <X size={28} className="group-hover/close:rotate-90 transition-transform duration-300" />
                                </button>

                                {/* Navigation Buttons */}
                                {relatedImages.length > 1 && (
                                    <>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handlePrev(); }}
                                            disabled={currentIndex === 0}
                                            className={cn(
                                                "fixed left-8 top-1/2 -translate-y-1/2 z-50 rounded-full p-6 bg-white/5 text-white hover:bg-primary transition-all border border-white/10 disabled:opacity-10 disabled:cursor-not-allowed group/btn backdrop-blur-md",
                                                currentIndex === 0 ? "hidden" : "block"
                                            )}
                                        >
                                            <ChevronRight size={40} className="rotate-180 group-hover/btn:-translate-x-1 transition-transform" />
                                        </button>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handleNext(); }}
                                            disabled={currentIndex === relatedImages.length - 1}
                                            className={cn(
                                                "fixed right-8 top-1/2 -translate-y-1/2 z-50 rounded-full p-6 bg-white/5 text-white hover:bg-primary transition-all border border-white/10 disabled:opacity-10 disabled:cursor-not-allowed group/btn backdrop-blur-md",
                                                currentIndex === relatedImages.length - 1 ? "hidden" : "block"
                                            )}
                                        >
                                            <ChevronRight size={40} className="group-hover/btn:translate-x-1 transition-transform" />
                                        </button>
                                    </>
                                )}
                                
                                <Image 
                                    src={selectedImage.url} 
                                    alt="Full screen"
                                    width={1200}
                                    height={800}
                                    unoptimized
                                    className="max-w-full max-h-full object-contain rounded-3xl shadow-[0_0_150px_rgba(0,0,0,0.8)]"
                                    onClick={(e) => e.stopPropagation()}
                                />

                                {/* Info Overlay - Forced Dark Theme - Compacted Layout */}
                                <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-black/70 border border-white/10 px-7 py-4 rounded-[28px] flex items-center gap-8 min-w-fit shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-500 backdrop-blur-2xl">
                                    <div className="flex flex-col shrink-0">
                                        <span className="text-[9px] text-white/40 uppercase tracking-[0.15em] font-black mb-0.5 whitespace-nowrap">Product Name</span>
                                        <span className="text-white font-bold text-base whitespace-nowrap tracking-tight">{INITIAL_GOODS.find(g => g.id === selectedImage.productId)?.name}</span>
                                    </div>
                                    <div className="h-8 w-px bg-white/10 shrink-0" />
                                    <div className="flex flex-col shrink-0">
                                        <span className="text-[9px] text-white/40 uppercase tracking-[0.15em] font-black mb-0.5 whitespace-nowrap">SKU ID</span>
                                        <span className="text-white font-mono text-base bg-white/15 px-2.5 py-0.5 rounded-lg border border-white/10 whitespace-nowrap">{INITIAL_GOODS.find(g => g.id === selectedImage.productId)?.sku}</span>
                                    </div>
                                    {relatedImages.length > 1 && (
                                        <>
                                            <div className="h-8 w-px bg-white/10 shrink-0" />
                                            <div className="flex flex-col items-center shrink-0">
                                                <span className="text-[9px] text-white/40 uppercase tracking-[0.15em] font-black mb-0.5 whitespace-nowrap">Gallery</span>
                                                <span className="text-white font-black text-base bg-primary/40 px-3 py-0.5 rounded-full border border-primary/20 whitespace-nowrap">
                                                    {currentIndex + 1} <span className="text-white/30 mx-0.5">/</span> {relatedImages.length}
                                                </span>
                                            </div>
                                        </>
                                    )}
                                    <div className="h-8 w-px bg-white/10 shrink-0" />
                                    <button 
                                        onClick={() => {
                                            const product = INITIAL_GOODS.find(g => g.id === selectedImage.productId);
                                            const fileName = `${product?.sku || 'image'}-${selectedImage.id}.jpg`;
                                            handleDownload(selectedImage.url, fileName);
                                        }}
                                        className="flex items-center gap-2 bg-white text-black hover:bg-primary hover:text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-lg active:scale-95 group/dl whitespace-nowrap shrink-0"
                                    >
                                        <Download size={18} className="group-hover:animate-bounce" />
                                        <span>下载原图</span>
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
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
