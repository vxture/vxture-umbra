ARG NODE_BASE_IMAGE=node:22-alpine

# Build context is the portals/ workspace root (npm workspaces). This image
# builds the @umbra/admin workspace; shared code comes from the internal
# @umbra/shared package, hoisted by the single workspace install.
FROM ${NODE_BASE_IMAGE} AS deps
WORKDIR /app
ARG VXTURE_NPM_REGISTRY=https://npm.pkg.github.com
# Root manifest + single lockfile + every workspace member manifest (npm ci
# needs them all to resolve the workspace).
COPY package.json package-lock.json ./
COPY website/package.json ./website/package.json
COPY console/package.json ./console/package.json
COPY admin/package.json ./admin/package.json
COPY packages/shared/package.json ./packages/shared/package.json
RUN --mount=type=secret,id=npm_token \
    npm_token="$(cat /run/secrets/npm_token 2>/dev/null || true)" \
    && printf "@vxture:registry=%s\n" "$VXTURE_NPM_REGISTRY" > .npmrc \
    && if [ -n "$npm_token" ]; then \
      NPM_TOKEN="$npm_token" node -e "const u=new URL(process.env.VXTURE_NPM_REGISTRY); console.log('//' + u.host + '/:_authToken=' + process.env.NPM_TOKEN)" >> .npmrc; \
    fi \
    && npm ci \
    && rm -f .npmrc

FROM ${NODE_BASE_IMAGE} AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# Bring the full installed workspace from deps: root + per-workspace
# node_modules and the @umbra symlinks (npm does not hoist @vxture/ioredis/jose
# to root). Then overlay source; node_modules are dockerignored so they survive.
COPY --from=deps /app ./
COPY . .
# Brand identity PNG/ICO files from repo-level canonical source
COPY --from=brand_context / ./admin/public/assets/brand/
RUN npm run build -w @umbra/admin

FROM ${NODE_BASE_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Next.js standalone server binds to $HOSTNAME; Docker sets HOSTNAME to the
# container id, so without this it listens only on the container IP and a
# 127.0.0.1 healthcheck cannot reach it. Bind all interfaces instead.
ENV HOSTNAME=0.0.0.0
ENV PORT=3230
RUN addgroup -S nextjs && adduser -S nextjs -G nextjs
# Monorepo standalone output is nested under the workspace dir (admin/).
COPY --from=builder --chown=nextjs:nextjs /app/admin/.next/standalone ./
COPY --from=builder --chown=nextjs:nextjs /app/admin/.next/static ./admin/.next/static
COPY --from=builder --chown=nextjs:nextjs /app/admin/public ./admin/public
USER nextjs
EXPOSE 3230
CMD ["node", "admin/server.js"]
