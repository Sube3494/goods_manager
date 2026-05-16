#!/bin/sh

set -e

sh scripts/init-db.sh

PRISMA_BIN="bunx prisma"

echo "→ Trying prisma db push..."
if $PRISMA_BIN db push --skip-generate --accept-data-loss; then
  echo "✓ prisma db push completed."
else
  echo "! prisma db push failed, but service will continue to start."
fi

exec bun server.js
