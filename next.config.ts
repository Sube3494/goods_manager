/*
 * @Date: 2026-02-07 00:08:33
 * @Author: Sube
 * @FilePath: next.config.ts
 * @LastEditTime: 2026-02-23 00:14:57
 * @Description: 
 */
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */

  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: 'cravatar.cn',
      },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
    proxyClientMaxBodySize: 50 * 1024 * 1024, // 50MB
  },
};

export default nextConfig;
