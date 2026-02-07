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

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const toggleTheme = (e: React.MouseEvent<HTMLButtonElement>) => {
    // 1. Check if View Transitions API is supported
    if (!(document as unknown as DocumentWithViewTransition).startViewTransition) {
      setTheme(theme === "light" ? "dark" : "light");
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
      setTheme(theme === "light" ? "dark" : "light");
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
          duration: 500,
          easing: "ease-in-out",
          // The new view (next theme) renders on top, effectively "revealing" it
          pseudoElement: "::view-transition-new(root)",
        }
      );
    });
  };

  return (
    <button
      onClick={toggleTheme}
      className="relative grid place-items-center h-10 w-10 rounded-full hover:bg-muted/50 transition-colors"
      aria-label="Toggle theme"
    >
      <Sun className="col-start-1 row-start-1 h-6 w-6 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0 text-orange-500" />
      <Moon className="col-start-1 row-start-1 h-6 w-6 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100 text-blue-400" />
    </button>
  );
}
