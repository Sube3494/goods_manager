"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ToastProvider } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";

export function MainLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";

  return (
    <ToastProvider>
        <div className="min-h-screen bg-transparent text-foreground relative flex font-sans overflow-hidden">
        {/* Ambient Background Mesh - Animated Blobs */}
        <div className="fixed inset-0 z-[-1] pointer-events-none overflow-hidden">
            {/* Subtle Ambient Light - Clean & Professional */}
            <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-blue-400/5 dark:bg-blue-600/5 rounded-full blur-[120px] mix-blend-multiply dark:mix-blend-screen" />
            <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-purple-400/5 dark:bg-purple-600/5 rounded-full blur-[100px] mix-blend-multiply dark:mix-blend-screen" />
        </div>

        {!isLoginPage && <Sidebar />}
        
        <div className={cn(
            "flex-1 flex flex-col min-h-screen transition-all duration-300 ease-in-out relative z-10",
            !isLoginPage && "ml-72"
        )}>
            {!isLoginPage && (
                <header className="sticky top-0 z-30 h-20 px-10 flex items-center justify-end">
                    <ThemeToggle />
                </header>
            )}            
            <main className={cn(
                "flex-1",
                !isLoginPage && "px-10 pb-10"
            )}>
                <div className={cn(
                    "h-full animate-fade-in",
                    !isLoginPage && "mx-auto max-w-7xl"
                )}>
                    {children}
                </div>
            </main>
        </div>
        </div>
    </ToastProvider>
  );
}
