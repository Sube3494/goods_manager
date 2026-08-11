/*
 * @Date: 2026-02-07 00:08:33
 * @Author: Sube
 * @FilePath: layout.tsx
 * @LastEditTime: 2026-03-02 18:45:57
 * @Description: 
 */
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { MainLayout } from "@/components/layout/MainLayout";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "PickNote",
  description: "PickNote 专业管理平台",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning className={cn("font-sans", geist.variable)}>
      <body
        className={`font-sans antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
          enableColorScheme
        >
          <MainLayout>{children}</MainLayout>
        </ThemeProvider>
      </body>
    </html>
  );
}
