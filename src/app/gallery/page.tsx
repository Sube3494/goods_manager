"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Camera, ChevronRight, Eye, ArrowLeft, X, Download, Plus, Upload, CheckCircle, Tag as TagIcon, Package } from "lucide-react";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";
import { CustomSelect } from "@/components/ui/CustomSelect";
import Image from "next/image";
import { cn } from "@/lib/utils";

import { useUser } from "@/hooks/useUser";
import { Product, GalleryItem } from "@/lib/types";
import { useCallback } from "react";

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
  const [categories, setCategories] = useState<any[]>([]); // Full category objects
  const [isUploadAllowed, setIsUploadAllowed] = useState(true);

  useEffect(() => {
    const checkUploadSetting = () => {
      const saved = localStorage.getItem("app_allow_upload");
      if (saved !== null) {
        setIsUploadAllowed(saved === "true");
      }
    };
    
    checkUploadSetting();
    window.addEventListener("storage", checkUploadSetting);
    return () => window.removeEventListener("storage", checkUploadSetting);
  }, []);
  
  // Upload States
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [uploadForm, setUploadForm] = useState({
    productId: "",
    isPublic: true,
    url: ""
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
        setItems(galleryData);
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

  // Body Scroll Lock
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

  // Upload Handlers
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const { url } = await res.json();
        setUploadForm(prev => ({ ...prev, url }));
      }
    } catch (error) {
      console.error("Upload failed:", error);
    } finally {
      setIsUploading(false);
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadForm.url || !uploadForm.productId) return;

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
        setUploadForm({ productId: "", isPublic: true, url: "" });
        fetchData(); // Refresh
      }
    } catch (error) {
      console.error("Gallery submit failed:", error);
    }
  };

  // Helper logic
  const productIdFilter = searchParams.get("productId");

  const filteredItems = items.filter(item => {
    const product = item.product;
    if (!isAdmin && !item.isPublic) return false;

    const searchLower = searchQuery.toLowerCase();
    const matchesSearch = 
      (product?.name?.toLowerCase()?.includes(searchLower) ?? false) || 
      (product?.sku?.toLowerCase()?.includes(searchLower) ?? false);

    const matchesCategory = selectedCategory === "All" || item.product?.category?.name === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const filteredProduct = items.length > 0 ? items[0].product : null;

  const handleOpenImage = (item: GalleryItem) => {
    setSelectedImage(item);
  };

  // Navigation logic
  const relatedImages = selectedImage ? items.filter(img => {
      const isCorrectProduct = img.productId === selectedImage.productId;
      const isVisible = isAdmin || img.isPublic;
      return isCorrectProduct && isVisible;
  }) : [];
  const currentIndex = relatedImages.findIndex(img => img.id === selectedImage?.id);

  const handlePrev = () => {
    if (currentIndex > 0) setSelectedImage(relatedImages[currentIndex - 1]);
  };

  const handleNext = () => {
    if (currentIndex < relatedImages.length - 1) setSelectedImage(relatedImages[currentIndex + 1]);
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
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.target = "_blank";
      link.click();
    }
  };

  return (
    <div className="space-y-8 pb-12 animate-in fade-in slide-in-from-top-4 duration-700">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 px-1">
          <div className="space-y-1">
            <h1 className="text-4xl font-black tracking-tight text-foreground">
              {productIdFilter ? (
                  <div className="flex items-center gap-2">
                    实物相册
                    <span className="text-xl font-bold text-muted-foreground/60 ml-2">/ {filteredProduct?.name}</span>
                  </div>
              ) : (
                <>实物<span className="text-primary">相册</span></>
              )}
            </h1>
            <p className="text-muted-foreground/60 text-sm font-medium">
              {isAdmin ? "仓库实拍、验货详情与内部档案库" : "商品实拍图与细节展示"}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
             {isAdmin && isUploadAllowed && (
               <button 
                 onClick={() => setIsUploadModalOpen(true)}
                 className="h-10 px-6 rounded-full bg-primary text-primary-foreground text-sm flex items-center gap-2 transition-all font-bold shadow-lg shadow-primary/20 hover:-translate-y-0.5 active:scale-95"
               >
                 <Plus size={18} /> 上传照片
               </button>
             )}
             
             {/* Remove the "switch view" button, since it's now real auth */ }

             {productIdFilter && (
                 <button 
                    onClick={() => router.push("/gallery")}
                    className="h-10 px-6 rounded-full glass border-border/50 text-muted-foreground hover:text-foreground flex items-center gap-2 transition-all font-bold"
                 >
                    <ArrowLeft size={18} /> 返回全集
                 </button>
             )}
             <div className="h-10 px-5 rounded-full bg-white dark:bg-white/5 border border-border dark:border-white/10 flex items-center gap-3 focus-within:ring-2 focus-within:ring-primary/20 transition-all dark:hover:bg-white/10 w-full sm:w-auto">
                <Search size={18} className="text-muted-foreground shrink-0" />
                <input 
                    type="text" 
                    placeholder="按商品名或 SKU 检索..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground w-full sm:w-64 text-sm"
                />
             </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 py-4">
            {/* All Button */}
            <button
                onClick={() => setSelectedCategory("All")}
                className={cn(
                    "px-6 py-2 rounded-full text-sm font-bold transition-all whitespace-nowrap border",
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
                        "px-6 py-2 rounded-full text-sm font-bold transition-all whitespace-nowrap border",
                        selectedCategory === cat.name
                        ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20" 
                        : "bg-muted/50 dark:glass text-muted-foreground border-border/50 hover:border-primary/30 hover:text-primary"
                    )}
                >
                    {cat.name}
                </button>
            ))}
        </div>

        {/* Responsive Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 sm:gap-6">
           <AnimatePresence mode="popLayout">
            {filteredItems.map((item, index) => {
                const product = item.product;
                return (
                    <motion.div
                        key={item.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        transition={{ duration: 0.4, delay: index * 0.05 }}
                    >
                        <div className="group relative rounded-3xl overflow-hidden bg-white dark:bg-gray-900/70 border border-border dark:border-white/10 hover:border-primary/50 transition-all duration-500 hover:shadow-2xl hover:shadow-primary/5 flex flex-col h-full cursor-pointer"
                             onClick={() => handleOpenImage(item)}
                        >
                            {/* Image Container */}
                            <div className="relative aspect-4/3 overflow-hidden bg-muted">
                                <Image 
                                    src={item.url} 
                                    alt={product?.name || "Product image"} 
                                    fill
                                    unoptimized
                                    className="object-cover transition-transform duration-700 group-hover:scale-110"
                                />
                                
                                {/* 元数据浮层 - SKU + 快速发图引导 */}
                                <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
                                    <span className="px-3 py-1 bg-black/70 backdrop-blur-md rounded-full text-[10px] font-black text-white border border-white/10 tracking-widest uppercase">
                                        {product?.sku}
                                    </span>
                                    {!item.isPublic && isAdmin && (
                                        <span className="px-2 py-0.5 bg-yellow-500/90 text-black text-[9px] font-bold rounded-full shadow-sm w-fit">
                                            内部可见
                                        </span>
                                    )}
                                </div>

                                <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex flex-col justify-end p-6">
                                    <div className="flex flex-col gap-1">
                                        <p className="text-white font-bold text-base line-clamp-1">{product?.name}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                );
            })}

            {filteredItems.length === 0 && productIdFilter && (
                <div className="col-span-full py-24 text-center glass border-dashed border-2 border-border/50 rounded-3xl">
                <Camera size={48} className="mx-auto text-black/30 dark:text-white/30 mb-4" />
                <h3 className="text-xl font-bold text-foreground">该商品暂无实拍图</h3>
                <p className="text-muted-foreground mt-1">您可以尝试上传第一张实拍照片</p>
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
                    <h3 className="text-2xl font-bold text-foreground">暂无符合条件的图片</h3>
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
                                <h2 className="text-xl font-bold text-foreground">上传实拍照片</h2>
                                <button onClick={() => setIsUploadModalOpen(false)} className="rounded-full p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                                    <X size={20} />
                                </button>
                            </div>

                            <form onSubmit={handleUploadSubmit} className="p-6 space-y-5">
                                {/* Upload Box */}
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                        <Camera size={16} className="text-black dark:text-white" /> 选择照片
                                    </label>
                                    <label className="relative aspect-video rounded-2xl border-2 border-dashed border-border hover:border-primary/40 hover:bg-primary/5 transition-all flex flex-col items-center justify-center gap-3 cursor-pointer overflow-hidden group">
                                        <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} />
                                        {uploadForm.url ? (
                                            <Image src={uploadForm.url} alt="upload preview" fill className="object-cover" />
                                        ) : (
                                            <>
                                                <div className="p-4 rounded-full bg-muted group-hover:bg-primary/10 transition-colors">
                                                    <Upload size={32} className={cn("text-muted-foreground group-hover:text-primary transition-all", isUploading && "animate-bounce")} />
                                                </div>
                                                <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{isUploading ? "正在处理照片..." : "点击或拖拽上传"}</span>
                                            </>
                                        )}
                                    </label>
                                </div>

                                {/* Product Select */}
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                        <Package size={16} /> 关联商品
                                    </label>
                                    <CustomSelect 
                                        value={uploadForm.productId}
                                        onChange={(val) => setUploadForm({...uploadForm, productId: val})}
                                        options={products.map(p => ({ value: p.id, label: `${p.name} (${p.sku})` }))}
                                        placeholder="选择关联商品..."
                                    />
                                </div>



                                <div className="flex justify-end gap-3 pt-4">
                                    <button type="button" onClick={() => setIsUploadModalOpen(false)} className="px-6 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground">取消</button>
                                    <button 
                                        type="submit" 
                                        disabled={!uploadForm.url || !uploadForm.productId || isUploading}
                                        className="flex items-center gap-2 rounded-xl bg-primary px-8 py-2.5 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-all"
                                    >
                                        <CheckCircle size={18} />
                                        确认发布
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>,
            document.body
        )}

        {/* Image Viewer Modal */}
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

                                {/* Info Overlay */}
                                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-black/80 border border-white/10 px-5 py-4 rounded-[24px] flex flex-col md:flex-row items-center gap-4 md:gap-8 w-[90vw] md:w-auto md:min-w-fit shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-500 backdrop-blur-2xl">
                                    <div className="flex flex-row md:flex-row gap-4 md:gap-8 w-full md:w-auto justify-between md:justify-start">
                                        <div className="flex flex-col shrink-0">
                                            <span className="text-[9px] text-white/40 uppercase tracking-[0.15em] font-black mb-0.5 whitespace-nowrap">商品名称</span>
                                            <span className="text-white font-bold text-sm md:text-base whitespace-nowrap tracking-tight max-w-[120px] md:max-w-none truncate">{selectedImage.product?.name}</span>
                                        </div>
                                        {/* Mobile Separator hidden */}
                                        <div className="h-8 w-px bg-white/10 shrink-0 hidden md:block" />
                                        <div className="flex flex-col shrink-0 items-end md:items-start">
                                            <span className="text-[9px] text-white/40 uppercase tracking-[0.15em] font-black mb-0.5 whitespace-nowrap">商品编码</span>
                                            <span className="text-white font-mono text-sm md:text-base bg-white/15 px-2 py-0.5 rounded-lg border border-white/10 whitespace-nowrap">{selectedImage.product?.sku}</span>
                                        </div>
                                    </div>
                                    
                                    <div className="hidden md:block h-8 w-px bg-white/10 shrink-0" />
                                    
                                    <div className="flex flex-row justify-between w-full md:w-auto gap-4 md:gap-8 items-center">
                                        {isAdmin && selectedImage.product?.stock !== undefined && (
                                            <div className="flex flex-col shrink-0">
                                                <span className="text-[9px] text-white/40 uppercase tracking-[0.15em] font-black mb-0.5 whitespace-nowrap">当前库存</span>
                                                <span className="text-white font-bold text-sm md:text-base whitespace-nowrap">
                                                    {selectedImage.product?.stock} <span className="text-[10px] font-normal opacity-50 text-white/60">件</span>
                                                </span>
                                            </div>
                                        )}
                                        
                                        {relatedImages.length > 1 && (
                                            <>
                                                <div className="h-8 w-px bg-white/10 shrink-0 hidden md:block" />
                                                <div className="flex flex-col items-center shrink-0">
                                                    <span className="text-[9px] text-white/40 uppercase tracking-[0.15em] font-black mb-0.5 whitespace-nowrap">图集浏览</span>
                                                    <span className="text-white font-black text-sm md:text-base bg-primary/40 px-3 py-0.5 rounded-full border border-primary/20 whitespace-nowrap">
                                                        {currentIndex + 1} <span className="text-white/30 mx-0.5">/</span> {relatedImages.length}
                                                    </span>
                                                </div>
                                            </>
                                        )}
                                        
                                        <div className="h-8 w-px bg-white/10 shrink-0 hidden md:block" />
                                        
                                        <button 
                                            onClick={() => {
                                                const product = selectedImage.product;
                                                const fileName = `${product?.name || 'product'}_${product?.sku || 'image'}_${selectedImage.id}.jpg`;
                                                handleDownload(selectedImage.url, fileName);
                                            }}
                                            className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-white text-black hover:bg-primary hover:text-white px-4 py-2 md:px-5 md:py-2.5 rounded-xl font-bold transition-all shadow-lg active:scale-95 group/dl whitespace-nowrap shrink-0 text-sm md:text-base"
                                        >
                                            <Download size={16} className="group-hover:animate-bounce" />
                                            <span>下载</span>
                                        </button>
                                    </div>
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
