"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

interface BackButtonProps {
  children: ReactNode;
  className?: string;
  fallbackHref?: string;
}

export function BackButton({ children, className, fallbackHref = "/brush" }: BackButtonProps) {
  const router = useRouter();

  const handleBack = () => {
    if (window.history.length > 1) {
      router.back();
    } else {
      router.replace(fallbackHref);
    }
  };

  return (
    <button type="button" onClick={handleBack} className={className}>
      {children}
    </button>
  );
}
