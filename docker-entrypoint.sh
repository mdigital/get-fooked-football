#!/bin/sh
# Runs as root on container start. Fixes up the persistent volume, applies any
# pending DB migrations, then drops privileges to the unprivileged `nextjs`
# user before exec'ing the app.
#
# Volume fix:
#   Railway-mounted ext4 volumes always contain a root-owned `lost+found`
#   directory. Next.js scans /public on boot (and on every static asset
#   request) and crashes with EACCES when it hits lost+found as a non-root
#   user. We can't fix permissions from inside the running Next.js process
#   because by then we're already nextjs (uid 1001), so this entrypoint
#   runs first as root.
#
# Migrations:
#   Every deploy runs `npm run db:migrate` which is idempotent — pending
#   migrations apply, an up-to-date DB is a fast no-op. Avoids the
#   schema-out-of-date class of bug (every page 500'ing because the prod DB
#   doesn't have a column the code expects).
#
#   Setting SKIP_MIGRATIONS=1 in env skips this step (useful if you want to
#   roll back the app without touching the DB).
set -e

UPLOADS_DIR="/app/public/uploads"

if [ -d "$UPLOADS_DIR" ]; then
  if [ -d "$UPLOADS_DIR/lost+found" ]; then
    chmod -R a+rX "$UPLOADS_DIR/lost+found" 2>/dev/null || true
  fi
  chown -R nextjs:nodejs "$UPLOADS_DIR" 2>/dev/null || true
  chmod 0755 "$UPLOADS_DIR" 2>/dev/null || true
fi

if [ -z "$SKIP_MIGRATIONS" ]; then
  echo "[entrypoint] applying database migrations…"
  if ! npm run --silent db:migrate; then
    echo "[entrypoint] migration failed — refusing to start the app"
    exit 1
  fi
fi

exec su-exec nextjs:nodejs "$@"
