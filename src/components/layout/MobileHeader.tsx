"use client";

import { Menu, X, LogIn } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useUser } from "@/hooks/useUser";
import Link from "next/link";

interface MobileHeaderProps {
  onToggleSidebar: () => void;
  isOpen: boolean;
  showMenu?: boolean;
}

export function MobileHeader({ onToggleSidebar, isOpen, showMenu = true }: MobileHeaderProps) {
  const { user, isLoading } = useUser();

  return (
    <header className="lg:hidden relative px-4 py-2 flex items-center justify-between">
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
        <ThemeToggle />
      </div>
    </header>
  );
}
