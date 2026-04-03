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
  serverExternalPackages: ["sharp"],
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
  async rewrites() {
    return [
      {
        source: '/gallery/:path*',
        destination: '/uploads/gallery/:path*',
      },
    ];
  },
};

export default nextConfig;
