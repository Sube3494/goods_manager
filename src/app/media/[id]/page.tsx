import prisma from "@/lib/prisma";
import Image from "next/image";
import { Metadata } from "next";
import { createHmac } from "crypto";
import { CameraOff } from "lucide-react";
import { getStorageStrategy } from "@/lib/storage";
import { getFreshSession } from "@/lib/auth";
import { SessionUser } from "@/lib/permissions";

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
  title: "媒体预览",
  description: "查看单个图片或视频",
};

export default async function MediaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await getFreshSession() as SessionUser | null;
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const expiresStr = resolvedSearchParams?.e as string | undefined;
  const signature = resolvedSearchParams?.s as string | undefined;

  if (!session && !verifySignature(id, expiresStr, signature)) {
    return (
      <div className="min-h-dynamic-screen bg-black text-white flex flex-col items-center justify-center p-6 safe-x safe-y relative overflow-hidden font-sans">
        <div className="absolute inset-0 bg-grid-white/[0.02] -z-10" />
        <div className="absolute top-[30%] -left-[10%] w-[500px] h-[500px] bg-red-500/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute -bottom-[20%] right-[10%] w-[500px] h-[500px] bg-neutral-800/30 rounded-full blur-[100px] pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center text-center max-w-sm animate-in fade-in zoom-in-95 duration-500">
          <div className="w-20 h-20 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-8 backdrop-blur-md shadow-2xl relative">
            <div className="absolute inset-0 rounded-full bg-red-500/20 blur-xl animate-pulse" />
            <CameraOff size={32} className="text-white/60 relative z-10" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4 text-white/90">媒体链接已失效</h1>
          <p className="text-white/50 text-sm leading-relaxed mb-10">
            该媒体链接已超出访问时间限制，或链接参数无效。请重新复制一个新的媒体链接。
          </p>
          <div className="w-12 h-1 rounded-full bg-white/10" />
        </div>
      </div>
    );
  }

  const item = await prisma.galleryItem.findFirst({
    where: {
      id,
      ...((!session || !session.id)
        ? { isPublic: true }
        : (session.role === "SUPER_ADMIN"
            ? {}
            : {
                OR: [
                  { isPublic: true },
                  { userId: session.id },
                ],
              })),
    },
    include: {
      product: true,
    },
  });

  if (!item) {
    return (
      <div className="min-h-dynamic-screen bg-black text-white flex flex-col items-center justify-center p-6 safe-x safe-y relative overflow-hidden font-sans">
        <div className="absolute inset-0 bg-grid-white/[0.02] -z-10" />
        <div className="absolute top-[30%] -left-[10%] w-[500px] h-[500px] bg-red-500/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute -bottom-[20%] right-[10%] w-[500px] h-[500px] bg-neutral-800/30 rounded-full blur-[100px] pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center text-center max-w-sm animate-in fade-in zoom-in-95 duration-500">
          <div className="w-20 h-20 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-8 backdrop-blur-md shadow-2xl relative">
            <div className="absolute inset-0 rounded-full bg-red-500/20 blur-xl animate-pulse" />
            <CameraOff size={32} className="text-white/60 relative z-10" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4 text-white/90">媒体不存在或无权查看</h1>
          <p className="text-white/50 text-sm leading-relaxed mb-10">
            该媒体可能已被删除、设为不可见，或当前账号没有访问权限。
          </p>
          <div className="w-12 h-1 rounded-full bg-white/10" />
        </div>
      </div>
    );
  }

  const storage = await getStorageStrategy();
  const displayUrl = storage.resolveUrl(item.url);
  const isVideo = isVideoUrl(item.url) || item.type === "video";

  return (
    <div className="min-h-dynamic-screen h-dynamic-screen w-full bg-black text-white flex flex-col relative overflow-hidden font-sans">
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

      <main className="relative z-10 flex-1 w-full h-full flex items-center justify-center">
        {isVideo ? (
          <video
            src={displayUrl}
            className="w-full h-full object-contain overflow-hidden"
            controls
            playsInline
            autoPlay
            muted
            loop
          />
        ) : (
          <div className="relative w-full h-full">
            <Image
              src={displayUrl}
              alt={item.product?.name || "媒体预览"}
              fill
              className="object-contain"
              sizes="100vw"
              priority
              unoptimized
            />
          </div>
        )}
      </main>
    </div>
  );
}
