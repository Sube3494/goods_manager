#!/bin/sh
###
 # @Date: 2026-02-22 00:44:53
 # @Author: Sube
 # @FilePath: docker-entrypoint.sh
 # @LastEditTime: 2026-02-22 00:50:39
 # @Description: 
### 
# 如果 /app/public/uploads 是挂载的 host volume 且属于 root，则将其所有权交还给 nextjs
if [ "$(stat -c %U /app/public/uploads)" = "root" ]; then
    echo "Fixing permissions for /app/public/uploads..."
    chown -R nextjs:nodejs /app/public/uploads
fi

# 切换回 nextjs 用户执行后续的所有 CMD 命令
exec su-exec nextjs "$@"
