"use client";

import { Menu, X, LogIn, LogOut } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useUser } from "@/hooks/useUser";
import Link from "next/link";
import { useState } from "react";
import { ConfirmModal } from "@/components/ui/ConfirmModal";

interface MobileHeaderProps {
  onToggleSidebar: () => void;
  isOpen: boolean;
  showMenu?: boolean;
}

export function MobileHeader({ onToggleSidebar, isOpen, showMenu = true }: MobileHeaderProps) {
  const { user, isLoading } = useUser();
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);

  return (
    <header className="lg:hidden relative px-4 py-2 safe-top flex items-center justify-between">
      <div className="flex items-center gap-3 pointer-events-auto">
        {showMenu && (
          <button
            onClick={onToggleSidebar}
            className="p-2 text-foreground/80 hover:text-foreground transition-colors active:scale-95 bg-white/10 dark:bg-white/5 rounded-full border border-white/10"
            aria-label={isOpen ? "Close menu" : "Open menu"}
          >
            {isOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        )}
      </div>
      
      <div className="flex items-center gap-3 pointer-events-auto">
        {!user && !isLoading && (
            <Link 
                href="/login"
                className="flex items-center gap-2 px-4 h-9 rounded-full bg-white dark:bg-white/5 border border-border dark:border-white/10 text-sm font-medium hover:bg-primary hover:text-primary-foreground transition-all shadow-sm active:scale-95"
            >
                <LogIn size={16} />
                登录
            </Link>
        )}
        {user && !isLoading && !showMenu && (
            <button
                onClick={() => setIsLogoutModalOpen(true)}
                className="h-9 w-9 rounded-full text-red-500 hover:text-red-600 hover:bg-black/5 dark:hover:bg-white/10 flex items-center justify-center transition-all bg-white dark:bg-white/5 border border-border dark:border-white/10"
                title="退出登录"
            >
                <LogOut size={16} />
            </button>
        )}
        <ThemeToggle />
      </div>
      <ConfirmModal
          isOpen={isLogoutModalOpen}
          onClose={() => setIsLogoutModalOpen(false)}
          onConfirm={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              window.location.href = "/login";
          }}
          title="退出登录"
          message="确定要退出当前账号吗？"
          confirmLabel="退出"
          cancelLabel="取消"
      />
    </header>
  );
}
