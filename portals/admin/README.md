# Ruyin Admin Portal

Platform management surface for Ruyin.

## Functions

- **VPN Management** - Opens Marzban dashboard at `admin.ruyin.ai/dashboard/`
- **Password Management** - Opens Vaultwarden admin panel at `pas.ruyin.ai/admin`

## Architecture

This is a standalone Next.js app scaffold. It is not wired into production
routing yet; the Docker Compose stack does not currently run an `umbra-admin`
container.

Current production Nginx routing (`07-admin.conf.template`):
- `/` -> redirects to `/dashboard/` (Marzban)
- `/invites` -> `umbra-account-web:3220`
- `/api/account/` -> `umbra-account:3281`
- All other routes -> Marzban at `umbra-marzban:8000`

## Future

When invite management is moved from `portals/console` to `portals/admin`,
this portal will be deployed as its own container (`umbra-admin`) with
dedicated Nginx routing. At that point, `admin.ruyin.ai/` can serve the
two-card dashboard directly.
