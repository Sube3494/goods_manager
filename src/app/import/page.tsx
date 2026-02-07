"use client";

import { ImportModal } from "@/components/Goods/ImportModal";
import { ProductFormModal } from "@/components/Goods/ProductFormModal";
import { useToast } from "@/components/ui/Toast";
import { ArrowDown, FileSpreadsheet, Keyboard, ScanBarcode } from "lucide-react";
import { Product } from "@/lib/types";
import { useState } from "react";

export default function ImportPage() {
  const [showImportModal, setShowImportModal] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);
  const { showToast } = useToast();

  const handleManualAdd = (data: Omit<Product, "id">) => {
    console.log("Adding manual item:", data);
    showToast(`"${data.name}" 已入库成功`, "success");
  };

  const handleScan = () => {
    showToast("扫码枪功能需连接硬件设备 (模拟中)", "info");
  };

  return (
    <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">入库登记</h1>
          <p className="text-muted-foreground mt-2">选择一种方式将商品录入系统。</p>
        </div>
        <div className="p-3 rounded-xl bg-primary/5 text-primary">
           <ArrowDown size={24} />
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Excel Import Card */}
        <button 
          onClick={() => setShowImportModal(true)}
          className="group relative flex flex-col items-center justify-center p-8 rounded-2xl glass-panel border-2 border-transparent hover:border-primary/20 hover:bg-card/80 transition-all duration-300 text-center space-y-4"
        >
           <div className="h-16 w-16 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-600 group-hover:scale-110 transition-transform duration-500">
              <FileSpreadsheet size={32} />
           </div>
           <div>
              <h3 className="text-lg font-bold text-foreground">Excel 批量导入</h3>
              <p className="text-sm text-muted-foreground mt-1">支持拖拽上传 .xlsx 文件</p>
           </div>
        </button>

        {/* Manual Entry Card */}
        <button 
           onClick={() => setShowManualModal(true)}
           className="group relative flex flex-col items-center justify-center p-8 rounded-2xl glass-panel border-2 border-transparent hover:border-primary/20 hover:bg-card/80 transition-all duration-300 text-center space-y-4"
        >
           <div className="h-16 w-16 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-600 group-hover:scale-110 transition-transform duration-500">
              <Keyboard size={32} />
           </div>
           <div>
              <h3 className="text-lg font-bold text-foreground">手动录入</h3>
              <p className="text-sm text-muted-foreground mt-1">单件商品详细登记</p>
           </div>
        </button>

        {/* Scan Barcode */}
        <button 
           onClick={handleScan}
           className="group relative flex flex-col items-center justify-center p-8 rounded-2xl glass-panel border-2 border-transparent hover:border-primary/20 hover:bg-card/80 transition-all duration-300 text-center space-y-4"
        >
           <div className="h-16 w-16 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-600 group-hover:scale-110 transition-transform duration-500">
              <ScanBarcode size={32} />
           </div>
           <div>
              <h3 className="text-lg font-bold text-foreground">扫码入库</h3>
              <p className="text-sm text-muted-foreground mt-1">连接扫码枪快速登记</p>
           </div>
           <span className="absolute top-4 right-4 px-2 py-0.5 rounded text-[10px] font-bold bg-secondary text-muted-foreground">
             PRO
           </span>
        </button>
      </div>

      {/* Recent Activity Hint */}
      <div className="glass-panel rounded-2xl p-8 text-center text-muted-foreground border-dashed">
         <p>最近没有入库记录</p>
      </div>

      <ImportModal isOpen={showImportModal} onClose={() => setShowImportModal(false)} onImport={(data) => {
          console.log(data);
          showToast(`成功导入 ${data.length} 件商品`, "success");
      }} />

      <ProductFormModal 
        isOpen={showManualModal}
        onClose={() => setShowManualModal(false)}
        onSubmit={handleManualAdd}
      />
    </div>
  );
}
