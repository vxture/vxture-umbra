# Security Spec

Security boundaries are part of the product contract.

## Operator Identity

Deployment scripts must run as the non-root admin user, normally `stone`.

Root-owned files in `DATA_DIR` can break later deploys, backups, certificate sync, and config rendering.

## Console

`console.ruyin.ai` has two layers:

- nginx IP allow/deny first.
- Marzban login second.

Do not add nginx Basic Auth to the console vhost. It breaks Marzban's bearer-token API calls.

## Subscriptions

Only `GET /sub/<marzban-token>` is public.

`HEAD` may return `405 Method Not Allowed`; that is expected because Marzban supports GET for subscription delivery.

Marzban may show a different token after console refresh. Tokens are opaque subscription credentials and can remain valid while GET returns `200`.

## Certificates

Public TLS certificates live under `DATA_DIR/letsencrypt`.

Marzban also requires TLS files under `DATA_DIR/marzban/tls` so its HTTP service binds to `0.0.0.0` and nginx can proxy to it over HTTPS.

Certificate replacement is a safety boundary. `ops.sh certs --upgrade` copies the current cert directory into `DATA_DIR/letsencrypt.staged`, removes non-trusted domain state only from the staged copy, and must leave the current `DATA_DIR/letsencrypt` untouched if any Let's Encrypt request fails. A failed upgrade must keep the staged directory so successful partial issuance can be reused on the next retry.

Existing trusted Let's Encrypt certificates must be reused unless they are due for renewal. Failed certbot runs may leave zero-byte `renewal/*.conf` files; scripts may remove only those invalid renewal configs and must not treat them as issued certificates.

Certbot writes files as root from inside Docker. Do not copy `privkey.pem` directly from shell scripts as the deploy user; use the Docker helper in `scripts/lib/certs.sh`.

Self-signed recovery mode requires:

```env
CERTBOT_SKIP=true
MARZBAN_SSL_CA_TYPE=private
```

Switch back to public CA mode after Let's Encrypt rate limits clear:

```env
CERTBOT_SKIP=false
MARZBAN_SSL_CA_TYPE=public
```
