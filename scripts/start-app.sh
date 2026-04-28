#!/bin/sh

set -e

sh scripts/init-db.sh

echo "→ Trying prisma db push..."
if prisma db push --skip-generate --accept-data-loss; then
  echo "✓ prisma db push completed."
else
  echo "! prisma db push failed, but service will continue to start."
fi

exec node server.js
