# syntax=docker/dockerfile:1.7

# ================================
# Stage 1: 依赖安装
# ================================
FROM oven/bun:1.3.13-alpine AS deps
WORKDIR /app
ENV npm_config_registry="https://registry.npmmirror.com"
ENV PRISMA_ENGINES_MIRROR="https://npmmirror.com/mirrors/prisma"
ENV PRISMA_BINARIES_MIRROR="https://npmmirror.com/mirrors/prisma"

COPY package.json bun.lock ./
RUN --mount=type=cache,id=bun-install,target=/root/.bun/install/cache \
    bun install --frozen-lockfile --ignore-scripts

# ================================
# Stage 2: 构建
# ================================
FROM oven/bun:1.3.13-alpine AS builder
RUN apk add --no-cache openssl
WORKDIR /app
ENV npm_config_registry="https://registry.npmmirror.com"

COPY --from=deps /app/node_modules ./node_modules
COPY prisma ./prisma

# 先基于 schema 生成 Prisma Client，避免业务代码改动导致这一层失效
RUN bunx prisma generate

COPY . .

# 构建 Next.js（standalone 模式减小镜像体积）
ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_AMAP_KEY
ARG NEXT_PUBLIC_AMAP_SECURITY_CODE
ENV NEXT_PUBLIC_AMAP_KEY=$NEXT_PUBLIC_AMAP_KEY
ENV NEXT_PUBLIC_AMAP_SECURITY_CODE=$NEXT_PUBLIC_AMAP_SECURITY_CODE
RUN bun run build

# ================================
# Stage 3: 运行时
# ================================
FROM oven/bun:1.3.13-alpine AS runner
WORKDIR /app

# Prisma 在 Alpine 上需要 openssl；postgresql-client 提供 psql 用于自动建库；su-exec 用于降权
RUN apk add --no-cache openssl libc6-compat postgresql-client su-exec

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# 创建非 root 用户
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# 复制 standalone 产物
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/bun.lock ./bun.lock

# Prisma Client（自定义输出路径：prisma/generated-client）
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# 复用构建阶段已经安装好的 Prisma CLI，避免运行镜像构建时再次联网下载引擎
RUN chmod -R 777 /app/node_modules/@prisma

# 自动建库脚本（shell 脚本，不依赖 npm 包）
COPY --chmod=755 scripts/init-db.sh ./scripts/init-db.sh
COPY --chmod=755 scripts/start-app.sh ./scripts/start-app.sh

# 上传文件持久化目录（chmod 777 确保 volume 挂载时也能正常写入）
RUN mkdir -p /app/public/uploads && chown -R nextjs:nodejs /app/public/uploads

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# 启动顺序：自动建库 → 尝试 db push → 启动应用
CMD ["sh", "scripts/start-app.sh"]
