# Ruyin Server Compare Checklist

Use this checklist on the production server after the local template changes are
pulled. It compares the server runtime environment against the Umbra template
before building the Next website.

## Scope

- Umbra only.
- Consume the published `@vxture/design-system` and `@vxture/shared` packages
  only.
- Do not modify the Vxture repository from this workflow.

## Commands

Run from the Umbra repo on the server:

```bash
cd /srv/vxture/repo/umbra

git status --short

printf '\n-- Template package env --\n'
grep -n '^VXTURE_NPM_REGISTRY=' .env.example
grep -n '^NODE_AUTH_TOKEN=' .env.example | sed 's/=.*/=<hidden>/'

printf '\n-- Server package env --\n'
grep -n '^VXTURE_NPM_REGISTRY=' .env
grep -n '^NODE_AUTH_TOKEN=' .env | sed 's/=.*/=<hidden>/'

printf '\n-- Token presence --\n'
set -a
. ./.env
set +a
node -e 'const t=process.env.NODE_AUTH_TOKEN||""; console.log(t && t.length > 20 ? "NODE_AUTH_TOKEN present" : "NODE_AUTH_TOKEN missing or placeholder")'

printf '\n-- Compose website build config --\n'
docker compose config | sed -n '/umbra-website:/,/^[^ ]/p'

printf '\n-- Package registry visibility --\n'
npm config get @vxture:registry
npm view @vxture/design-system@0.1.0 version
npm view @vxture/shared@0.1.0 version

printf '\n-- Package registry visibility from clean container --\n'
docker run --rm \
  -e NODE_AUTH_TOKEN="$NODE_AUTH_TOKEN" \
  node:22-alpine sh -lc '
    npm config set @vxture:registry "${VXTURE_NPM_REGISTRY:-https://npm.pkg.github.com}" &&
    npm config set //npm.pkg.github.com/:_authToken "$NODE_AUTH_TOKEN" &&
    npm view @vxture/design-system@0.1.0 version &&
    npm view @vxture/shared@0.1.0 version
  '

printf '\n-- Website build --\n'
DOCKER_BUILDKIT=1 docker compose build umbra-website
```

## Expected

- `.env` has `VXTURE_NPM_REGISTRY`.
- `.env` has `NODE_AUTH_TOKEN` when using GitHub Packages.
- Do not print or paste the raw `NODE_AUTH_TOKEN` value.
- `npm config get @vxture:registry` prints `https://npm.pkg.github.com`.
- `npm view @vxture/design-system@0.1.0 version` prints `0.1.0`.
- `npm view @vxture/shared@0.1.0 version` prints `0.1.0`.
- `docker compose build umbra-website` completes without copying DS source into
  Umbra.

## If Package Lookup Fails

- `404`: package is not published to that registry or the token lacks access.
- `401` or `403`: token is missing, expired, or lacks package read scope.
- Network timeout: server cannot reach the package registry.
