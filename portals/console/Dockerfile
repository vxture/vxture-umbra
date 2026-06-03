ARG NODE_BASE_IMAGE=node:22-alpine
FROM ${NODE_BASE_IMAGE} AS deps
WORKDIR /app
ARG VXTURE_NPM_REGISTRY=https://npm.pkg.github.com
COPY package.json package-lock.json* ./
RUN --mount=type=secret,id=npm_token \
    npm_token="$(cat /run/secrets/npm_token 2>/dev/null || true)" \
    && printf "@vxture:registry=%s\n" "$VXTURE_NPM_REGISTRY" > .npmrc \
    && if [ -n "$npm_token" ]; then \
      NPM_TOKEN="$npm_token" node -e "const u=new URL(process.env.VXTURE_NPM_REGISTRY); console.log('//' + u.host + '/:_authToken=' + process.env.NPM_TOKEN)" >> .npmrc; \
    fi \
    && if [ -f package-lock.json ]; then npm ci; else npm install; fi \
    && rm -f .npmrc

FROM ${NODE_BASE_IMAGE} AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Brand identity PNG/ICO files from repo-level canonical source
COPY --from=brand_context / ./public/assets/brand/
RUN npm run build

FROM ${NODE_BASE_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3220
RUN addgroup -S nextjs && adduser -S nextjs -G nextjs
COPY --from=builder --chown=nextjs:nextjs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nextjs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nextjs /app/public ./public
USER nextjs
EXPOSE 3220
CMD ["node", "server.js"]
