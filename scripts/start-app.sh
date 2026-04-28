#!/bin/sh

set -e

sh scripts/init-db.sh
node scripts/fix_shop_external_id_duplicates.js
node scripts/fix_shop_dedupe_keys.js
node scripts/fix_shop_product_duplicate_skus.js

echo "→ Trying prisma db push..."
if prisma db push --skip-generate --accept-data-loss; then
  echo "✓ prisma db push completed."
else
  echo "! prisma db push failed, but service will continue to start."
fi

exec node server.js
