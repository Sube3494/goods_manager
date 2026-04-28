#!/bin/sh

set -e

sh scripts/init-db.sh
node scripts/fix_shop_external_id_duplicates.js
node scripts/fix_shop_dedupe_keys.js
node scripts/fix_shop_product_duplicate_skus.js
node scripts/cleanup_orphan_shop_only_products.js

echo "→ Trying prisma db push..."
if prisma db push --skip-generate --accept-data-loss; then
  echo "✓ prisma db push completed."
  echo "→ Backfilling brush product shop product links..."
  if node scripts/backfill_brush_product_shop_ids.js; then
    echo "✓ brush product backfill completed."
  else
    echo "! brush product backfill failed, but service will continue to start."
  fi
else
  echo "! prisma db push failed, but service will continue to start."
fi

exec node server.js
