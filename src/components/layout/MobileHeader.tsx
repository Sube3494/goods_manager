"use client";

import { Menu, X } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

interface MobileHeaderProps {
  onToggleSidebar: () => void;
  isOpen: boolean;
}

export function MobileHeader({ onToggleSidebar, isOpen }: MobileHeaderProps) {
  return (
    <header className="lg:hidden fixed top-0 left-0 right-0 z-50 px-4 pt-4 flex items-start justify-between pointer-events-none">
      <div className="flex items-center gap-3 pointer-events-auto">
        <button
          onClick={onToggleSidebar}
          className="p-2 text-foreground/80 hover:text-foreground transition-colors active:scale-95"
          aria-label={isOpen ? "Close menu" : "Open menu"}
        >
          {isOpen ? <X size={24} /> : <Menu size={24} />}
        </button>

      </div>
      
      <div className="flex items-center gap-2 pointer-events-auto">
        <ThemeToggle className="bg-transparent border-none shadow-none text-foreground/80 hover:text-foreground" />
      </div>
    </header>
  );
}
