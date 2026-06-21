# Certificate Incident Ledger

This document records certificate failure modes that must not regress. Each ID
is referenced from certificate scripts as an implementation guardrail.

## Evidence Pattern

Original observed production state:

- `pass.ruyin.ai` has a trusted Let's Encrypt certificate.
- `ruyin.ai`, `www.ruyin.ai`, `console.ruyin.ai`, and `admin.ruyin.ai` have
  self-signed certificates.
- The six self-signed domains have zero-byte `renewal/*.conf` files.
- Only `pass.ruyin.ai` has normal Certbot `archive/` material.

This means the running system is mixed state: one valid Certbot-managed domain
and six self-signed fallback domains. `certs --renew` cannot repair that state;
the repair path is `certs --upgrade`.

## Failure Modes

| ID | Failure | Required Guardrail |
|---|---|---|
| CERT-001 | Existing trusted LE certs were not treated as authoritative and could be requested again. | Reuse trusted non-staging LE certs unless they are near expiry. |
| CERT-002 | Failed Certbot runs left zero-byte `renewal/*.conf` files. | Remove only zero-byte renewal configs before status, renew, and issue flows. |
| CERT-003 | Non-trusted/self-signed domain state could be replaced in-place. | Production replacement must route through staged upgrade. |
| CERT-004 | Malformed `live/<domain>` directories could block Certbot and trigger repeated attempts. | Refuse in-place mutation; remove domain state only inside staged cert dirs. |
| CERT-005 | A previous staged run could partially succeed and then fail on a later domain. | Preserve `letsencrypt.staged` so already-issued certs are reused on retry. |
| CERT-006 | Certbot returning success was treated as sufficient. | Verify `fullchain.pem` exists and issuer is trusted production Let's Encrypt. |
| CERT-007 | Legacy `letsencrypt.new.*` workdirs could duplicate retry state. | Migrate the newest legacy staged dir to `letsencrypt.staged` and prune obsolete workdirs. |
| CERT-008 | Activation could happen without an independent all-domain trust check. | Verify every staged domain is trusted LE, unexpired, and name-matched before activation. |
| CERT-009 | Activation failure could leave certificate state half-swapped. | Use rename-based activation with rollback to the previous current dir. |
| CERT-010 | Service restart or Marzban TLS sync failure after activation could strand new certs. | Restore previous certs and save failed new state for forensics. |
| CERT-011 | Domain values from `.env` could be used in filesystem paths directly. | Validate certificate domain names before building `live/`, `archive/`, or `renewal/` paths. |

## Directory Rules

| Directory | Meaning | Automatic Handling |
|---|---|---|
| `DATA_DIR/letsencrypt` | Active production certificate state | Never deleted by issue or renew flows |
| `DATA_DIR/letsencrypt.staged` | Reusable staged upgrade state | Preserved after failed upgrade; activated only after all domains verify |
| `DATA_DIR/letsencrypt.new.*` | Legacy staged retry state | Newest may be migrated to `letsencrypt.staged`; remaining dirs may be pruned |
| `DATA_DIR/letsencrypt.failed.*` | Failed post-activation state | May be pruned by `certs --clean-workdirs` |
| `DATA_DIR/letsencrypt.backup.*` | Rollback backups | Never automatically pruned |

## Operational Rules

- Use `bash deploy/ops.sh certs --status` to inspect certificate trust and
  work directories.
- Use `bash deploy/ops.sh certs --clean-renewal-state` to remove only invalid
  zero-byte renewal configs.
- Use `bash deploy/ops.sh certs --clean-workdirs` to normalize obsolete staged
  work directories without touching active certs or backups.
- Use `bash deploy/ops.sh certs --upgrade` to replace self-signed certs with
  trusted LE certs.
- Do not use `certs --renew` as a repair command. It only renews existing
  Certbot-managed certificates that are due.
