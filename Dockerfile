FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --include=dev

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# su-exec lets the root-stage entrypoint drop privileges cleanly to nextjs.
RUN apk add --no-cache su-exec tini

# Non-root user the app actually runs as.
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

# Next.js standalone output
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Drizzle schema + seed script + tsx runtime, so `npm run db:push` / `db:seed`
# work from inside the deployed container.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/package.json ./package.json

# Volume mount target — Railway volumes always create a root-owned lost+found
# here, which the entrypoint fixes up at startup.
RUN mkdir -p /app/public/uploads && chown -R nextjs:nodejs /app/public/uploads

# Entrypoint runs as root, repairs the volume, then drops to nextjs.
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Stay as root so the entrypoint can chown/chmod the volume.
# `tini` gives us proper signal handling + PID-1 reaping;
# the entrypoint script execs `su-exec nextjs node server.js` after fixups.
ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "server.js"]
