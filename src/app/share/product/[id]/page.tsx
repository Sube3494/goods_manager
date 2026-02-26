import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";
import { Metadata } from "next";
import { createHmac } from "crypto";
import { CameraOff } from "lucide-react";
import { ProductShareClient } from "./ShareClient";

function verifySignature(id: string, expiresStr?: string, signature?: string) {
  if (!expiresStr || !signature) return false;
  const expires = parseInt(expiresStr, 10);
  if (isNaN(expires) || Date.now() > expires) return false;
  
  const secret = process.env.NEXTAUTH_SECRET || "picknote_share_secret_fallback";
  const expectedSig = createHmac("sha256", secret)
    .update(`${id}:${expires}`)
    .digest("hex")
    .slice(0, 16);
    
  return signature === expectedSig;
}

export const metadata: Metadata = {
  title: "商品实拍全集分享",
  description: "查看该商品的所有高清实拍图/视频"
};

export default async function ProductSharePage({ params, searchParams }: { params: Promise<{ id: string }>, searchParams?: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const expiresStr = resolvedSearchParams?.e as string | undefined;
  const signature = resolvedSearchParams?.s as string | undefined;

  const isExpiredOrInvalid = !verifySignature(id, expiresStr, signature);

  if (isExpiredOrInvalid) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 relative overflow-hidden font-sans">
        <div className="absolute inset-0 bg-grid-white/[0.02] -z-10" />
        <div className="absolute top-[30%] -left-[10%] w-[500px] h-[500px] bg-red-500/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute -bottom-[20%] right-[10%] w-[500px] h-[500px] bg-neutral-800/30 rounded-full blur-[100px] pointer-events-none" />
        
        <div className="relative z-10 flex flex-col items-center text-center max-w-sm animate-in fade-in zoom-in-95 duration-500">
          <div className="w-20 h-20 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-8 backdrop-blur-md shadow-2xl relative">
             <div className="absolute inset-0 rounded-full bg-red-500/20 blur-xl animate-pulse" />
             <CameraOff size={32} className="text-white/60 relative z-10" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4 text-white/90">分享链接已失效</h1>
          <p className="text-white/50 text-sm leading-relaxed mb-10">
            该资源已超出访问时间限制或链接拼写不正确。出于隐私安全保护，该链接已被永久销毁，请联系分享者重新获取。
          </p>
          <div className="w-12 h-1 rounded-full bg-white/10" />
        </div>
      </div>
    );
  }

  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      gallery: {
        where: { isPublic: true },
        orderBy: [
          { sortOrder: 'asc' },
          { createdAt: 'asc' }
        ]
      }
    }
  });

  if (!product || product.gallery.length === 0) {
    notFound();
  }

  // Cast safely for the client component
  return <ProductShareClient 
    items={product.gallery as unknown as { id: string; url: string; type: string }[]} 
    productName={product.name}
  />;
}
