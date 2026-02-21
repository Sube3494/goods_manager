"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

// Extend the Document interface to support View Transitions API
interface ViewTransition {
  ready: Promise<void>;
  finished: Promise<void>;
  updateCallbackDone: Promise<void>;
}

interface DocumentWithViewTransition {
  startViewTransition(callback: () => void): ViewTransition;
}

import { cn } from "@/lib/utils";

interface ThemeToggleProps {
  className?: string;
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { setTheme, resolvedTheme } = useTheme();

  const toggleTheme = (e: React.MouseEvent<HTMLButtonElement>) => {
    // 1. Check if View Transitions API is supported
    if (!(document as unknown as DocumentWithViewTransition).startViewTransition) {
      setTheme(resolvedTheme === "light" ? "dark" : "light");
      return;
    }

    const x = e.clientX;
    const y = e.clientY;
    const endRadius = Math.hypot(
      Math.max(x, innerWidth - x),
      Math.max(y, innerHeight - y)
    );

    // 2. Start the transition
    const transition = (document as unknown as DocumentWithViewTransition).startViewTransition(() => {
      setTheme(resolvedTheme === "light" ? "dark" : "light");
    });

    // 3. Animate the circular clip path
    transition.ready.then(() => {
      const clipPath = [
        `circle(0px at ${x}px ${y}px)`,
        `circle(${endRadius}px at ${x}px ${y}px)`,
      ];

      document.documentElement.animate(
        {
          clipPath: clipPath,
        },
        {
          duration: 400,
          easing: "cubic-bezier(0.4, 0, 0.2, 1)",
          // The new view (next theme) renders on top, effectively "revealing" it
          pseudoElement: "::view-transition-new(root)",
        }
      );
    });
  };

  return (
    <button
      onClick={toggleTheme}
      className={cn(
        "group relative flex items-center justify-center h-10 w-10 rounded-full bg-white dark:bg-white/5 hover:bg-muted/50 border border-border dark:border-white/10 transition-all active:scale-95 shadow-sm",
        className
      )}
      aria-label="Toggle theme"
    >
      <div className="relative grid place-items-center h-6 w-6">
        <Sun className="col-start-1 row-start-1 h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0 text-orange-500" />
        <Moon className="col-start-1 row-start-1 h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100 text-blue-400" />
      </div>
    </button>
  );
}
