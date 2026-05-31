"use client";

import Image from "next/image";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

type BrandLogoProps = {
  alt?: string;
  className?: string;
  height: number;
  priority?: boolean;
  width: number;
};

export function BrandLogo({
  alt = "腾荣科技图标",
  className,
  height,
  priority = false,
  width,
}: BrandLogoProps) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted ? resolvedTheme === "dark" : false;
  const src = isDark ? "/teng-rong-tech-icon-dark.svg" : "/teng-rong-tech-icon.svg";

  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      priority={priority}
      className={className}
    />
  );
}
