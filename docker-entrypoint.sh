#!/bin/sh
# Runs as root on container start, fixes up the persistent volume,
# then drops privileges to the unprivileged `nextjs` user before exec'ing the app.
#
# Why this exists: Railway-mounted ext4 volumes always contain a root-owned
# `lost+found` directory. Next.js scans /public on boot (and on every static
# asset request) and crashes with EACCES when it hits lost+found as a non-root
# user. We can't fix permissions from inside the running Next.js process because
# by then we're already nextjs (uid 1001). So this entrypoint runs first.
set -e

UPLOADS_DIR="/app/public/uploads"

if [ -d "$UPLOADS_DIR" ]; then
  # Make the lost+found dir readable (and traversable) so Next.js can scan past it.
  if [ -d "$UPLOADS_DIR/lost+found" ]; then
    chmod -R a+rX "$UPLOADS_DIR/lost+found" 2>/dev/null || true
  fi
  # Make sure the rest of the uploads tree is writable by the runtime user.
  chown -R nextjs:nodejs "$UPLOADS_DIR" 2>/dev/null || true
  # If a volume's mount point is root-owned root-only, chmod it too.
  chmod 0755 "$UPLOADS_DIR" 2>/dev/null || true
fi

# Drop to the unprivileged user and exec the Next.js standalone server.
exec su-exec nextjs:nodejs "$@"
