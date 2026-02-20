# ================================
# Stage 1: 依赖安装
# ================================
FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile && pnpm store prune

# ================================
# Stage 2: 构建
# ================================
FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate && \
    apk add --no-cache openssl
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# 生成 Prisma Client
RUN pnpm exec prisma generate

# 构建 Next.js（standalone 模式减小镜像体积）
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# ================================
# Stage 3: 运行时
# ================================
FROM node:20-alpine AS runner
WORKDIR /app

# Prisma 在 Alpine 上需要 openssl；postgresql-client 提供 psql 用于自动建库
RUN apk add --no-cache openssl libc6-compat postgresql-client

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# 创建非 root 用户
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# 复制 standalone 产物
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Prisma Client（自定义输出路径：prisma/generated-client）
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# 安装 Prisma CLI（用于启动时自动执行 migrate deploy）
RUN npm install -g prisma@5.22.0

# 自动建库脚本（shell 脚本，不依赖 npm 包）
COPY --chmod=755 scripts/init-db.sh ./scripts/init-db.sh

# 上传文件持久化目录
RUN mkdir -p /app/public/uploads && chown -R nextjs:nodejs /app/public/uploads

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# 启动顺序：自动建库 → 数据库迁移 → 启动应用
CMD ["sh", "-c", "sh scripts/init-db.sh && prisma migrate deploy && node server.js"]
