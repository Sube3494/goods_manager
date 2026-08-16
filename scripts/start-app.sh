#!/bin/sh

set -e

sh scripts/init-db.sh

PRISMA_BIN="bun ./node_modules/prisma/build/index.js"

echo "→ Trying prisma db push..."
if $PRISMA_BIN db push --skip-generate --accept-data-loss; then
  echo "✓ prisma db push completed."
else
  echo "! prisma db push failed, but service will continue to start."
fi


echo "→ Running other platform data migration..."
if bun scripts/migrate-other-platform-to-offline.js; then
  echo "✓ other platform data migration completed."
else
  echo "! other platform data migration failed, but service will continue to start."
fi

exec bun server.js
