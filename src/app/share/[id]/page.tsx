import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";
import Image from "next/image";
import { Metadata } from "next";
import { createHmac } from "crypto";
import { CameraOff } from "lucide-react";

// 根据图片后缀判断是否是视频
function isVideoUrl(url: string) {
  return /\.(mp4|webm|ogg|mov)$/i.test(url);
}

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
  title: "实物分享",
  description: "查看该商品的高清实拍图/视频"
};

export default async function SharePage({ params, searchParams }: { params: Promise<{ id: string }>, searchParams?: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const expiresStr = resolvedSearchParams?.e as string | undefined;
  const signature = resolvedSearchParams?.s as string | undefined;

  const isExpiredOrInvalid = !verifySignature(id, expiresStr, signature);

  if (isExpiredOrInvalid) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 relative overflow-hidden font-sans">
        {/* 背景氛围点缀 */}
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

  const item = await prisma.galleryItem.findUnique({
    where: { id },
    include: { product: true }
  });

  if (!item) {
    notFound();
  }

  const isVideo = isVideoUrl(item.url) || item.type === "video";
  const displayUrl = item.url.startsWith("http") || item.url.startsWith("/") 
    ? item.url 
    : `/uploads/${item.url}`;

  return (
    <div className="min-h-screen h-screen w-full bg-black text-white flex flex-col relative overflow-hidden font-sans">
      
      {/* Background Ambient Glow */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        {!isVideo && (
          <Image 
            src={displayUrl} 
            alt="ambient" 
            fill
            className="object-cover blur-[100px] opacity-30 scale-110"
          />
        )}
        <div className="absolute inset-0 bg-black/80" />
      </div>

      {/* Main Content Area */}
      <main className="relative z-10 flex-1 w-full h-full flex items-center justify-center">
          {isVideo ? (
            <video 
              src={displayUrl} 
              className="w-full h-full object-contain"
              controls
              playsInline
              autoPlay
              muted
              loop
            />
          ) : (
            <Image 
              src={displayUrl} 
              alt={item.product?.name || "分享图片"} 
              fill
              className="object-contain"
              sizes="100vw"
              priority
              unoptimized
            />
          )}
      </main>

    </div>
  );
}
