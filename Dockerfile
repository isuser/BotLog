# Botlog as a container: a standalone Next.js server (see docker-compose.yml and the
# self-hosting guide at /help/self-hosting in a running instance).
#
# The two NEXT_PUBLIC_ Supabase values are public and compiled into the build, so they're build
# arguments. Secrets (SUPABASE_SECRET_KEY, SUPABASE_JWT_SIGNING_KEY) are only given at runtime.

FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_SITE_URL
RUN test -n "$NEXT_PUBLIC_SUPABASE_URL" && test -n "$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" \
  || (echo "Pass NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as build args" && exit 1)
RUN pnpm build

FROM node:24-alpine AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S botlog && adduser -S botlog -G botlog
COPY --from=build --chown=botlog:botlog /app/.next/standalone ./
COPY --from=build --chown=botlog:botlog /app/.next/static ./.next/static
USER botlog
EXPOSE 3000
CMD ["node", "server.js"]
